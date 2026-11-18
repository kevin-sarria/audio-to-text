import { InProcessJobQueue } from "./infrastructure/queue/InProcessJobQueue.js";
import { ISessionRepository } from "../domain/repositories/ISessionRepository.js";
import { IStorageService } from "../domain/services/IStorageService.js";
import { IAudioProcessor } from "../domain/services/IAudioProcessor.js";
import { ITranscriptionEngine } from "../domain/services/ITranscriptionEngine.js";
import { IEventPublisher } from "../domain/services/IEventPublisher.js";
import { CompleteSession } from "../application/use-cases/transcription/CompleteSession.js";
import { FailSession } from "../application/use-cases/transcription/FailSession.js";
import { PurgeExpiredAudio } from "../application/use-cases/retention/PurgeExpiredAudio.js";
import { SessionStatus } from "../domain/value-objects/SessionStatus.js";
import { createPreprocessHandler } from "../workers/handlers/preprocess.handler.js";
import { createTranscribeHandler } from "../workers/handlers/transcribe.handler.js";
import { createPersistHandler } from "../workers/handlers/persist.handler.js";
import { createRetentionHandler } from "../workers/handlers/retention.handler.js";
import { LOCAL_USER_ID } from "./infrastructure/sqlite/migrations.js";

export interface DesktopPipelineDeps {
  jobQueue: InProcessJobQueue;
  sessionRepository: ISessionRepository;
  storageService: IStorageService;
  audioProcessor: IAudioProcessor;
  transcriptionEngine: ITranscriptionEngine;
  eventPublisher: IEventPublisher;
  completeSession: CompleteSession;
  failSession: FailSession;
  purgeExpiredAudio: PurgeExpiredAudio;
}

export function setupDesktopPipeline(deps: DesktopPipelineDeps): void {
  const {
    jobQueue,
    sessionRepository,
    storageService,
    audioProcessor,
    transcriptionEngine,
    eventPublisher,
    completeSession,
    failSession,
    purgeExpiredAudio
  } = deps;

  // 1. Configurar handlers
  const handlePreprocess = createPreprocessHandler({
    sessionRepository,
    storageService,
    audioProcessor,
    jobQueue
  });

  const handleTranscribe = createTranscribeHandler({
    transcriptionEngine,
    jobQueue,
    eventPublisher
  });

  const handlePersist = createPersistHandler({
    completeSession
  });

  const handleRetention = createRetentionHandler({
    purgeExpiredAudio
  });

  // 2. Registrar en la cola en proceso
  jobQueue.registerHandler("preprocess", handlePreprocess);
  jobQueue.registerHandler("transcribe", handleTranscribe);
  jobQueue.registerHandler("persist", handlePersist);
  jobQueue.registerRetentionHandler(() => handleRetention());

  // 3. Callback para fallos definitivos (tras agotar 3 reintentos)
  jobQueue.setFinalFailureCallback(async (stage, payload, error) => {
    try {
      await failSession.execute({
        sessionId: payload.sessionId,
        errorMessage: `Error en ${stage}: ${error.message}`
      });
    } catch (err) {
      console.error(`[DesktopPipeline] No se pudo marcar sesión ${payload.sessionId} como fallida:`, err);
    }
  });
}

export async function runStartupRecovery(deps: {
  sessionRepository: ISessionRepository;
  storageService: IStorageService;
  jobQueue: InProcessJobQueue;
  failSession: FailSession;
}): Promise<void> {
  const { sessionRepository, storageService, jobQueue, failSession } = deps;

  try {
    // Buscar todas las sesiones del usuario local
    const { sessions } = await sessionRepository.findByUserId(LOCAL_USER_ID, 0, 1000);

    for (const session of sessions) {
      if (session.status === SessionStatus.PROCESSING) {
        // PROCESSING -> PENDING para recuperación
        session.markProcessing(); // mantiene o actualiza
        // Creamos una nueva instancia o asignamos status directamente
        (session as any).props.status = SessionStatus.PENDING;
        await sessionRepository.update(session);
      }

      if (session.status === SessionStatus.PENDING) {
        const storageKey = session.storagePath;
        if (storageKey && (await storageService.exists(storageKey))) {
          console.log(`[Recovery] Re-encolando sesión pendiente: ${session.id}`);
          await jobQueue.enqueuePreprocess({
            sessionId: session.id,
            inputPath: storageKey
          });
        } else {
          console.warn(`[Recovery] Archivo ausente para sesión ${session.id}, marcando FAILED`);
          try {
            await failSession.execute({
              sessionId: session.id,
              errorMessage: "Archivo de audio ausente en almacenamiento al recuperar la sesión tras reinicio."
            });
          } catch (failErr) {
            console.error(`Error marcando sesión como fallida en recovery:`, failErr);
          }
        }
      }
    }
  } catch (err) {
    console.error("[Recovery] Error ejecutando recovery de arranque:", err);
  }
}
