import crypto from "node:crypto";
import { MeetingAnalysisDto, MeetingAnalysisJobDto } from "@audio-to-text/shared";

export interface MeetingAnalysisJobsDeps {
  now?: () => number;
}

const TTL_MS = 30 * 60 * 1000; // 30 minutos
const MAX_JOBS = 20;

/**
 * Trabajos en memoria que generan el análisis de una reunión sin mantener una petición HTTP abierta
 * (el servidor local cierra los sockets inactivos a los 8 minutos y un análisis largo los supera).
 * Mismo patrón que ContextScanJobs.
 */
export class MeetingAnalysisJobs {
  private jobs = new Map<string, MeetingAnalysisJobDto>();
  private now: () => number;

  constructor(deps?: MeetingAnalysisJobsDeps) {
    this.now = deps?.now ?? (() => Date.now());
  }

  public start(
    sessionId: string,
    run: (onProgress: (msg: string) => void) => Promise<MeetingAnalysisDto>
  ): MeetingAnalysisJobDto {
    this.cleanup();

    // Si ya hay un trabajo corriendo para la misma sesión, se reutiliza (evita gastar tokens dos veces)
    const running = this.getRunningForSession(sessionId);
    if (running) return running;

    const jobId = crypto.randomUUID();
    const entry: MeetingAnalysisJobDto = {
      jobId,
      sessionId,
      status: "running",
      progress: "Preparando el análisis",
      startedAt: new Date(this.now()).toISOString()
    };
    this.jobs.set(jobId, entry);
    this.cleanup();

    // Se ejecuta sin esperarlo; cualquier error queda registrado en el trabajo (nunca una promesa rechazada sin manejar)
    let started: Promise<MeetingAnalysisDto>;
    try {
      started = run((msg: string) => {
        const current = this.jobs.get(jobId);
        if (current && current.status === "running") current.progress = msg;
      });
    } catch (err) {
      started = Promise.reject(err);
    }

    started
      .then((result) => {
        const current = this.jobs.get(jobId);
        if (!current) return;
        current.status = "done";
        current.finishedAt = new Date(this.now()).toISOString();
        current.result = result;
      })
      .catch((err: unknown) => {
        const current = this.jobs.get(jobId);
        if (!current) return;
        current.status = "error";
        current.finishedAt = new Date(this.now()).toISOString();
        current.error = err instanceof Error ? err.message : String(err || "Error desconocido");
      });

    return { ...entry };
  }

  public get(jobId: string): MeetingAnalysisJobDto | null {
    this.cleanup();
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  /** Trabajo en curso de una sesión, si lo hay. */
  public getRunningForSession(sessionId: string): MeetingAnalysisJobDto | null {
    for (const job of this.jobs.values()) {
      if (job.status === "running" && job.sessionId === sessionId) return { ...job };
    }
    return null;
  }

  private cleanup(): void {
    const nowMs = this.now();

    for (const [id, job] of this.jobs.entries()) {
      if (job.status !== "running" && job.finishedAt && nowMs - new Date(job.finishedAt).getTime() > TTL_MS) {
        this.jobs.delete(id);
      }
    }

    if (this.jobs.size > MAX_JOBS) {
      const finished = Array.from(this.jobs.entries())
        .filter(([, j]) => j.status !== "running" && j.finishedAt)
        .sort((a, b) => new Date(a[1].finishedAt!).getTime() - new Date(b[1].finishedAt!).getTime());
      for (const [id] of finished) {
        if (this.jobs.size <= MAX_JOBS) break;
        this.jobs.delete(id);
      }
    }
  }
}
