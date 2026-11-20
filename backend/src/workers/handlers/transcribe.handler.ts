import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { ITranscriptionEngine } from "../../domain/services/ITranscriptionEngine.js";
import { IJobQueue, JobQueuePayload } from "../../domain/services/IJobQueue.js";
import { IEventPublisher } from "../../domain/services/IEventPublisher.js";
import { IStorageService } from "../../domain/services/IStorageService.js";
import { IAudioProcessor } from "../../domain/services/IAudioProcessor.js";
import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";

export interface TranscribeHandlerDeps {
  transcriptionEngine: ITranscriptionEngine;
  jobQueue: IJobQueue;
  eventPublisher: IEventPublisher;
  storageService?: IStorageService;
  audioProcessor?: IAudioProcessor;
  sessionRepository?: ISessionRepository;
}

export function createTranscribeHandler(deps: TranscribeHandlerDeps) {
  const {
    transcriptionEngine,
    jobQueue,
    eventPublisher,
    storageService,
    audioProcessor,
    sessionRepository
  } = deps;

  return async function handleTranscribe(payload: JobQueuePayload): Promise<void> {
    const { sessionId, wavPath, metadata } = payload;
    if (!wavPath) {
      throw new Error(`Ruta WAV ausente para sesión ${sessionId}.`);
    }

    console.log(`[W2:Transcriber] Iniciando transcripción de sesión ${sessionId}`);

    // Si el archivo temporal no existe (ej. tras un reintento o reinicio previo), intentamos regenerarlo desde storage
    let effectiveWavPath = wavPath;
    if (!fsSync.existsSync(effectiveWavPath) && storageService && audioProcessor && sessionRepository) {
      try {
        const session = await sessionRepository.findById(sessionId);
        if (session && session.storagePath && (await storageService.exists(session.storagePath))) {
          const rawAbsolutePath = storageService.getAbsolutePath(session.storagePath);
          const regeneratedWav = path.join(os.tmpdir(), `session-${sessionId}-16k.wav`);
          const res = await audioProcessor.convertToWavMono16k(rawAbsolutePath, regeneratedWav);
          effectiveWavPath = res.wavPath;
          console.info(`[W2:Transcriber] Archivo temporal regenerado con éxito en ${effectiveWavPath}`);
        }
      } catch (recoverErr) {
        console.warn(`[W2:Transcriber] Intento de regeneración fallido para sesión ${sessionId}:`, recoverErr);
      }
    }

    const language = (metadata?.["language"] as string) || undefined;
    const result = await transcriptionEngine.transcribe(effectiveWavPath, {
      language,
      onProgress: (percent) => {
        eventPublisher
          .publishSessionEvent({
            sessionId,
            type: "progress",
            data: { stage: "transcribing", percent }
          })
          .catch(() => {});
      }
    });

    // Si el motor no diarizó ningún segmento, asignar "Hablante 1"
    const segments = result.segments.map((s) => ({
      ...s,
      speakerLabel: s.speakerLabel || "Hablante 1"
    }));

    // Encolar W3: persistencia
    await jobQueue.enqueuePersist({
      sessionId,
      metadata: {
        language: result.language,
        segments
      }
    });

    console.log(
      `[W2:Transcriber] Sesión ${sessionId} transcrita con ${segments.length} segmentos.`
    );

    // Borrar archivo WAV temporal de manera segura SÓLO cuando la transcripción concluye exitosamente
    await fs.unlink(effectiveWavPath).catch(() => {});
  };
}
