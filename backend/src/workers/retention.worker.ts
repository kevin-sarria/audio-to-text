import { Worker, Job } from "bullmq";
import { redisConnection } from "../infrastructure/queue/connection.js";
import { compositionRoot } from "../composition-root.js";
import { createRetentionHandler } from "./handlers/retention.handler.js";

export function createRetentionWorker(): Worker {
  const { purgeExpiredAudio } = compositionRoot;

  const handleRetention = createRetentionHandler({
    purgeExpiredAudio
  });

  const worker = new Worker(
    "maintenance.retention",
    async (job: Job) => {
      return await handleRetention(job.id);
    },
    {
      connection: redisConnection,
      concurrency: 1
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`[Worker:Retention] Error en ciclo de purga ${job?.id}:`, err);
  });

  return worker;
}
