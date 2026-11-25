import type { MeetingAnalysisDto, MeetingAnalysisJobDto } from "@audio-to-text/shared";
import { pollScanJob } from "../projectFolders/folderModal/pollScanJob.js";

/**
 * Sigue un trabajo de análisis en segundo plano hasta que termina y devuelve el análisis.
 * Lanza Error con el mensaje del proveedor si el trabajo falló.
 */
export async function followAnalysisJob(opts: {
  jobId: string;
  fetchJob: (jobId: string) => Promise<MeetingAnalysisJobDto>;
  onProgress?: (job: MeetingAnalysisJobDto) => void;
  isCancelled?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxConsecutiveErrors?: number;
}): Promise<MeetingAnalysisDto> {
  const job = await pollScanJob<MeetingAnalysisJobDto>({
    jobId: opts.jobId,
    fetchJob: opts.fetchJob,
    onProgress: (j) => opts.onProgress?.(j),
    ...(opts.isCancelled ? { isCancelled: opts.isCancelled } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    ...(opts.intervalMs !== undefined ? { intervalMs: opts.intervalMs } : {}),
    ...(opts.maxConsecutiveErrors !== undefined ? { maxConsecutiveErrors: opts.maxConsecutiveErrors } : {})
  });

  if (job.status === "error") {
    throw new Error(job.error || "Error al generar el análisis con IA.");
  }
  if (!job.result) {
    throw new Error("El análisis terminó sin devolver resultado.");
  }
  return job.result;
}
