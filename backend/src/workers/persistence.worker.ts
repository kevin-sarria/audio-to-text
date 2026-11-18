import { Worker, Job } from "bullmq";
import { redisConnection } from "../infrastructure/queue/connection.js";
import { compositionRoot } from "../composition-root.js";
import { JobQueuePayload } from "../domain/services/IJobQueue.js";
import { createPersistHandler } from "./handlers/persist.handler.js";

export function createPersistenceWorker(): Worker<JobQueuePayload> {
  const { completeSession, failSession } = compositionRoot;

  const handlePersist = createPersistHandler({
    completeSession
  });

  const worker = new Worker<JobQueuePayload>(
    "audio.persist",
    async (job: Job<JobQueuePayload>) => {
      await handlePersist(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 5
    }
  );

  worker.on("failed", async (job, err) => {
    if (job) {
      console.error(`[W3:Persistence] Fallo en persistencia de job ${job.id}:`, err);
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade < maxAttempts) return;
      try {
        await failSession.execute({
          sessionId: job.data.sessionId,
          errorMessage: `Error en persistencia: ${err.message}`
        });
      } catch (failErr) {
        console.error(`No se pudo marcar la sesión como fallida:`, failErr);
      }
    }
  });

  return worker;
}
