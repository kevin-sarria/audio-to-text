import type { ContextScanJobDto } from "@audio-to-text/shared";

export async function pollScanJob(opts: {
  jobId: string;
  fetchJob: (jobId: string) => Promise<ContextScanJobDto>;
  onProgress: (job: ContextScanJobDto) => void;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;         // 2000
  maxConsecutiveErrors?: number; // 3
  isCancelled?: () => boolean;
}): Promise<ContextScanJobDto> {
  const sleepFn = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const interval = opts.intervalMs ?? 2000;
  const maxErrors = opts.maxConsecutiveErrors ?? 3;

  let consecutiveErrors = 0;

  while (true) {
    if (opts.isCancelled?.()) {
      throw new Error("Escaneo cancelado.");
    }

    let job: ContextScanJobDto | null = null;
    try {
      job = await opts.fetchJob(opts.jobId);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      if (consecutiveErrors >= maxErrors) {
        throw err;
      }
    }

    if (job) {
      opts.onProgress(job);
      if (job.status === "done" || job.status === "error") {
        return job;
      }
    }

    if (opts.isCancelled?.()) {
      throw new Error("Escaneo cancelado.");
    }

    await sleepFn(interval);
  }
}
