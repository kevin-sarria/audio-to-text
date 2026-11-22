import crypto from "node:crypto";
import path from "node:path";
import { ContextScanJobDto, ProjectContextScanResultDto } from "@audio-to-text/shared";

export interface ContextScanJobsDeps {
  now?: () => number;
}

interface InternalScanJobEntry extends ContextScanJobDto {
  normalizedPath: string;
}

export class ContextScanJobs {
  private jobs = new Map<string, InternalScanJobEntry>();
  private now: () => number;

  constructor(deps?: ContextScanJobsDeps) {
    this.now = deps?.now ?? (() => Date.now());
  }

  public start(
    folderPath: string,
    run: (onProgress: (msg: string) => void) => Promise<ProjectContextScanResultDto>
  ): ContextScanJobDto {
    this.cleanup();

    const normalizedPath = this.normalizeFolderPath(folderPath);

    // Si ya hay un trabajo running para la misma carpeta, devuelve ese
    for (const job of this.jobs.values()) {
      if (job.status === "running" && job.normalizedPath === normalizedPath) {
        return this.toDto(job);
      }
    }

    const jobId = crypto.randomUUID();
    const entry: InternalScanJobEntry = {
      jobId,
      status: "running",
      progress: "Inventario y lectura del código",
      startedAt: new Date(this.now()).toISOString(),
      normalizedPath
    };

    this.jobs.set(jobId, entry);

    // Enforce max 20 limit immediately if needed
    this.cleanup();

    // Ejecuta run sin esperarlo, capturando errores en el trabajo (nunca promesa rechazada sin manejar)
    run((msg: string) => {
      const current = this.jobs.get(jobId);
      if (current && current.status === "running") {
        current.progress = msg;
      }
    })
      .then((res) => {
        const current = this.jobs.get(jobId);
        if (current) {
          current.status = "done";
          current.finishedAt = new Date(this.now()).toISOString();
          current.result = {
            folderPath,
            technicalContext: res.technicalContext,
            report: res.report
          };
        }
      })
      .catch((err: any) => {
        const current = this.jobs.get(jobId);
        if (current) {
          current.status = "error";
          current.finishedAt = new Date(this.now()).toISOString();
          current.error = err instanceof Error ? err.message : String(err || "Error desconocido");
        }
      });

    return this.toDto(entry);
  }

  public get(jobId: string): ContextScanJobDto | null {
    this.cleanup();
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return this.toDto(job);
  }

  private normalizeFolderPath(p: string): string {
    const resolved = path.resolve(p);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  }

  private cleanup(): void {
    const nowMs = this.now();
    const ttlMs = 30 * 60 * 1000; // 30 minutos

    // 1. Borrar trabajos terminados hace más de 30 minutos
    for (const [id, job] of this.jobs.entries()) {
      if (job.status !== "running" && job.finishedAt) {
        const finishedMs = new Date(job.finishedAt).getTime();
        if (nowMs - finishedMs > ttlMs) {
          this.jobs.delete(id);
        }
      }
    }

    // 2. Máximo 20 trabajos guardados; si se excede, se borran los terminados más viejos
    if (this.jobs.size > 20) {
      const finished = Array.from(this.jobs.entries())
        .filter(([_, j]) => j.status !== "running" && j.finishedAt)
        .sort((a, b) => new Date(a[1].finishedAt!).getTime() - new Date(b[1].finishedAt!).getTime());

      for (const [id] of finished) {
        if (this.jobs.size <= 20) break;
        this.jobs.delete(id);
      }
    }
  }

  private toDto(entry: InternalScanJobEntry): ContextScanJobDto {
    const dto: ContextScanJobDto = {
      jobId: entry.jobId,
      status: entry.status,
      progress: entry.progress,
      startedAt: entry.startedAt
    };
    if (entry.finishedAt) dto.finishedAt = entry.finishedAt;
    if (entry.result) dto.result = { ...entry.result };
    if (entry.error !== undefined) dto.error = entry.error;
    return dto;
  }
}
