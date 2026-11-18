export interface JobQueuePayload {
  sessionId: string;
  inputPath?: string;
  wavPath?: string;
  metadata?: Record<string, unknown>;
}

export interface IJobQueue {
  enqueuePreprocess(data: JobQueuePayload): Promise<void>;
  enqueueTranscribe(data: JobQueuePayload): Promise<void>;
  enqueuePersist(data: JobQueuePayload): Promise<void>;
  scheduleRetentionJob(): Promise<void>;
}
