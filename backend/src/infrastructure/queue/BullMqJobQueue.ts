import { IJobQueue, JobQueuePayload } from "../../domain/services/IJobQueue.js";
import { preprocessQueue, transcribeQueue, persistQueue, retentionQueue } from "./queues.js";

export class BullMqJobQueue implements IJobQueue {
  public async enqueuePreprocess(data: JobQueuePayload): Promise<void> {
    await preprocessQueue.add("preprocess", data, {
      jobId: `preprocess-${data.sessionId}`
    });
  }

  public async enqueueTranscribe(data: JobQueuePayload): Promise<void> {
    await transcribeQueue.add("transcribe", data, {
      jobId: `transcribe-${data.sessionId}`
    });
  }

  public async enqueuePersist(data: JobQueuePayload): Promise<void> {
    await persistQueue.add("persist", data, {
      jobId: `persist-${data.sessionId}`
    });
  }

  public async scheduleRetentionJob(): Promise<void> {
    await retentionQueue.add(
      "purge-expired",
      {},
      {
        jobId: "hourly-retention-purge",
        repeat: {
          pattern: "0 * * * *" // Cada hora en punto
        }
      }
    );
  }
}
