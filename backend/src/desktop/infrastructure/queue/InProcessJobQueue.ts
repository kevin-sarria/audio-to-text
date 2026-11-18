import { IJobQueue, JobQueuePayload } from "../../../domain/services/IJobQueue.js";

type Stage = "preprocess" | "transcribe" | "persist";
export type JobHandler = (payload: JobQueuePayload) => Promise<void>;
export type RetentionHandler = () => Promise<any>;
export type FinalFailureCallback = (
  stage: Stage,
  payload: JobQueuePayload,
  error: Error
) => Promise<void> | void;

interface QueueItem {
  stage: Stage;
  payload: JobQueuePayload;
  attemptsMade: number;
  maxAttempts: number;
}

export class InProcessJobQueue implements IJobQueue {
  private queues: Record<Stage, QueueItem[]> = {
    preprocess: [],
    transcribe: [],
    persist: []
  };

  private concurrency: Record<Stage, number> = {
    preprocess: 2,
    transcribe: 1,
    persist: 2
  };

  private runningCount: Record<Stage, number> = {
    preprocess: 0,
    transcribe: 0,
    persist: 0
  };

  private handlers: Partial<Record<Stage, JobHandler>> = {};
  private retentionHandler?: RetentionHandler;
  private onFinalFailure?: FinalFailureCallback;

  private activeSessionStages = new Set<string>();
  private retentionTimer: NodeJS.Timeout | null = null;
  private isClosed = false;
  private pendingTimeouts = new Set<NodeJS.Timeout>();

  constructor(options?: { onFinalFailure?: FinalFailureCallback }) {
    this.onFinalFailure = options?.onFinalFailure;
  }

  public registerHandler(stage: Stage, handler: JobHandler): void {
    this.handlers[stage] = handler;
  }

  public registerRetentionHandler(handler: RetentionHandler): void {
    this.retentionHandler = handler;
  }

  public setFinalFailureCallback(cb: FinalFailureCallback): void {
    this.onFinalFailure = cb;
  }

  public async enqueuePreprocess(data: JobQueuePayload): Promise<void> {
    this.enqueue("preprocess", data);
  }

  public async enqueueTranscribe(data: JobQueuePayload): Promise<void> {
    this.enqueue("transcribe", data);
  }

  public async enqueuePersist(data: JobQueuePayload): Promise<void> {
    this.enqueue("persist", data);
  }

  private enqueue(stage: Stage, data: JobQueuePayload): void {
    if (this.isClosed) return;

    const key = `${stage}:${data.sessionId}`;
    if (this.activeSessionStages.has(key)) {
      // Idempotente: ya se encuentra activa o encolada para esta etapa
      return;
    }

    this.activeSessionStages.add(key);
    this.queues[stage].push({
      stage,
      payload: data,
      attemptsMade: 1,
      maxAttempts: 3
    });

    this.processNext(stage);
  }

  private processNext(stage: Stage): void {
    if (this.isClosed) return;
    if (this.runningCount[stage] >= this.concurrency[stage]) return;

    const item = this.queues[stage].shift();
    if (!item) return;

    this.runningCount[stage]++;

    (async () => {
      const handler = this.handlers[stage];
      if (!handler) {
        throw new Error(`Handler no registrado para etapa ${stage}`);
      }

      try {
        await handler(item.payload);
        this.activeSessionStages.delete(`${stage}:${item.payload.sessionId}`);
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[InProcessJobQueue] Error en etapa ${stage} (intento ${item.attemptsMade}/${item.maxAttempts}) para sesión ${item.payload.sessionId}:`,
          error.message
        );

        if (item.attemptsMade < item.maxAttempts && !this.isClosed) {
          item.attemptsMade++;
          // Backoff exponencial: intento 2 -> 2000ms, intento 3 -> 4000ms
          const delayMs = item.attemptsMade === 2 ? 2000 : 4000;
          const timer = setTimeout(() => {
            this.pendingTimeouts.delete(timer);
            if (!this.isClosed) {
              this.queues[stage].push(item);
              this.processNext(stage);
            }
          }, delayMs);
          this.pendingTimeouts.add(timer);
        } else {
          // Fallo definitivo
          this.activeSessionStages.delete(`${stage}:${item.payload.sessionId}`);
          if (this.onFinalFailure) {
            try {
              await this.onFinalFailure(stage, item.payload, error);
            } catch (failCbErr) {
              console.error("[InProcessJobQueue] Error ejecutando onFinalFailure:", failCbErr);
            }
          }
        }
      } finally {
        this.runningCount[stage]--;
        this.processNext(stage);
      }
    })();
  }

  public async scheduleRetentionJob(): Promise<void> {
    if (this.retentionTimer) return;

    // Ejecución inicial al arrancar
    if (this.retentionHandler) {
      this.retentionHandler().catch((err) => {
        console.error("[InProcessJobQueue] Error en purga de retención inicial:", err);
      });
    }

    // Intervalo de 1 hora
    this.retentionTimer = setInterval(() => {
      if (this.retentionHandler && !this.isClosed) {
        this.retentionHandler().catch((err) => {
          console.error("[InProcessJobQueue] Error en purga de retención horaria:", err);
        });
      }
    }, 60 * 60 * 1000);

    this.retentionTimer.unref();
  }

  public async close(): Promise<void> {
    this.isClosed = true;

    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }

    for (const timer of this.pendingTimeouts) {
      clearTimeout(timer);
    }
    this.pendingTimeouts.clear();

    this.queues.preprocess = [];
    this.queues.transcribe = [];
    this.queues.persist = [];
  }
}
