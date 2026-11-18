import { Queue, QueueOptions } from "bullmq";
import { redisConnection } from "./connection.js";

const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: {
      count: 100
    },
    removeOnFail: {
      count: 500
    }
  }
};

export const preprocessQueue = new Queue("audio.preprocess", defaultQueueOptions);
export const transcribeQueue = new Queue("audio.transcribe", defaultQueueOptions);
export const persistQueue = new Queue("audio.persist", defaultQueueOptions);
export const retentionQueue = new Queue("maintenance.retention", defaultQueueOptions);
