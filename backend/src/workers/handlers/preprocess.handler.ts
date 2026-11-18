import path from "node:path";
import os from "node:os";
import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";
import { IStorageService } from "../../domain/services/IStorageService.js";
import { IAudioProcessor } from "../../domain/services/IAudioProcessor.js";
import { IJobQueue, JobQueuePayload } from "../../domain/services/IJobQueue.js";

export interface PreprocessHandlerDeps {
  sessionRepository: ISessionRepository;
  storageService: IStorageService;
  audioProcessor: IAudioProcessor;
  jobQueue: IJobQueue;
}

export function createPreprocessHandler(deps: PreprocessHandlerDeps) {
  const { sessionRepository, storageService, audioProcessor, jobQueue } = deps;

  return async function handlePreprocess(payload: JobQueuePayload): Promise<void> {
    const { sessionId, inputPath } = payload;
    console.log(`[W1:Preprocessor] Iniciando procesamiento de sesión ${sessionId}`);

    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error(`Sesión ${sessionId} no encontrada.`);
    }

    const rawStorageKey = inputPath || session.storagePath;
    if (!rawStorageKey) {
      throw new Error(`Ruta de almacenamiento ausente para sesión ${sessionId}.`);
    }

    const rawAbsolutePath = storageService.getAbsolutePath(rawStorageKey);
    const exists = await storageService.exists(rawStorageKey);
    if (!exists) {
      throw new Error(`Archivo no encontrado en storage: ${rawAbsolutePath}`);
    }

    // Convertir a WAV 16kHz mono pcm_s16le en directorio temporal
    const tempWavPath = path.join(os.tmpdir(), `session-${sessionId}-16k.wav`);
    const { wavPath, durationSeconds } = await audioProcessor.convertToWavMono16k(
      rawAbsolutePath,
      tempWavPath
    );

    // Actualizar estado y duración en la sesión
    session.markProcessing(durationSeconds);
    await sessionRepository.update(session);

    // Encolar W2: transcripción
    await jobQueue.enqueueTranscribe({
      sessionId,
      wavPath,
      metadata: {
        language: session.sourceLanguage
      }
    });

    console.log(
      `[W1:Preprocessor] Sesión ${sessionId} preprocesada con éxito. Duración: ${durationSeconds}s`
    );
  };
}

export const createPreprocessorWorkerHandler = createPreprocessHandler;

