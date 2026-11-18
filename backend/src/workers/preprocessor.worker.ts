import { Worker, Job } from "bullmq";
import { redisConnection } from "../infrastructure/queue/connection.js";
import { compositionRoot } from "../composition-root.js";
import { JobQueuePayload } from "../domain/services/IJobQueue.js";
import { createPreprocessorWorkerHandler } from "./handlers/preprocess.handler.js";

export function createPreprocessorWorker(): Worker<JobQueuePayload> {
  const { sessionRepository, storageService, audioProcessor, jobQueue, failSession } =
    compositionRoot;

  const handlePreprocess = createPreprocessorWorkerHandler({
    sessionRepository,
    storageService,
    audioProcessor,
    jobQueue
  });

  const worker = new Worker<JobQueuePayload>(
    "audio.preprocess",
    async (job: Job<JobQueuePayload>) => {
      await handlePreprocess(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 2
    }
  );

  worker.on("failed", async (job, err) => {
    if (job) {
      console.error(`[W1:Preprocessor] Fallo definitivo en job ${job.id}:`, err);
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) return;
      try {
        await failSession.execute({
          sessionId: job.data.sessionId,
          errorMessage: `Error en preprocesamiento: ${err.message}`
        });
      } catch (failErr) {
        console.error(`No se pudo marcar la sesión como fallida:`, failErr);
      }
    }
  });

  return worker;
}
