import { Worker, Job } from "bullmq";
import { redisConnection } from "../infrastructure/queue/connection.js";
import { compositionRoot } from "../composition-root.js";
import { JobQueuePayload } from "../domain/services/IJobQueue.js";
import { createTranscribeHandler } from "./handlers/transcribe.handler.js";

export function createTranscriberWorker(): Worker<JobQueuePayload> {
  const { transcriptionEngine, jobQueue, failSession, eventPublisher } = compositionRoot;

  const handleTranscribe = createTranscribeHandler({
    transcriptionEngine,
    jobQueue,
    eventPublisher
  });

  const worker = new Worker<JobQueuePayload>(
    "audio.transcribe",
    async (job: Job<JobQueuePayload>) => {
      await handleTranscribe(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 1 // Concurrencia acotada para uso intensivo de CPU / GPU
    }
  );

  worker.on("failed", async (job, err) => {
    if (job) {
      console.error(`[W2:Transcriber] Fallo en job ${job.id}:`, err);
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) return;
      try {
        await failSession.execute({
          sessionId: job.data.sessionId,
          errorMessage: `Error en transcripción: ${err.message}`
        });
      } catch (failErr) {
        console.error(`No se pudo marcar la sesión como fallida:`, failErr);
      }
    }
  });

  return worker;
}
