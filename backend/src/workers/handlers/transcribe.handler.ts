import fs from "node:fs/promises";
import { ITranscriptionEngine } from "../../domain/services/ITranscriptionEngine.js";
import { IJobQueue, JobQueuePayload } from "../../domain/services/IJobQueue.js";
import { IEventPublisher } from "../../domain/services/IEventPublisher.js";

export interface TranscribeHandlerDeps {
  transcriptionEngine: ITranscriptionEngine;
  jobQueue: IJobQueue;
  eventPublisher: IEventPublisher;
}

export function createTranscribeHandler(deps: TranscribeHandlerDeps) {
  const { transcriptionEngine, jobQueue, eventPublisher } = deps;

  return async function handleTranscribe(payload: JobQueuePayload): Promise<void> {
    const { sessionId, wavPath, metadata } = payload;
    if (!wavPath) {
      throw new Error(`Ruta WAV ausente para sesión ${sessionId}.`);
    }

    console.log(`[W2:Transcriber] Iniciando transcripción de sesión ${sessionId}`);

    try {
      const language = (metadata?.["language"] as string) || undefined;
      const result = await transcriptionEngine.transcribe(wavPath, {
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
    } finally {
      // Borrar archivo WAV temporal de manera garantizada
      await fs.unlink(wavPath).catch(() => {});
    }
  };
}
