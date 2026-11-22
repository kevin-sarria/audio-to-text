import { describe, it, expect, vi } from "vitest";
import { pollScanJob } from "../features/projectFolders/folderModal/pollScanJob.js";
import type { ContextScanJobDto } from "@audio-to-text/shared";

function makeJob(status: "running" | "done" | "error", progress = "Progreso", error?: string): ContextScanJobDto {
  return {
    jobId: "test-job-123",
    status,
    progress,
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: status !== "running" ? "2026-01-01T00:01:00.000Z" : undefined,
    error,
    result: status === "done" ? { folderPath: "/test", technicalContext: "ctx", report: {} as any } : undefined
  };
}

describe("pollScanJob", () => {
  it("consulta hasta done", async () => {
    let callCount = 0;
    const progressList: string[] = [];

    const fetchJob = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return makeJob("running", "Leyendo documentos");
      if (callCount === 2) return makeJob("running", "Análisis con IA");
      return makeJob("done", "Completado");
    });

    const result = await pollScanJob({
      jobId: "test-job-123",
      fetchJob,
      onProgress: (job) => progressList.push(job.progress),
      sleep: () => Promise.resolve(),
      intervalMs: 10
    });

    expect(result.status).toBe("done");
    expect(callCount).toBe(3);
    expect(progressList).toEqual(["Leyendo documentos", "Análisis con IA", "Completado"]);
  });

  it("devuelve un error del servidor como resultado", async () => {
    let callCount = 0;
    const fetchJob = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return makeJob("running");
      return makeJob("error", "Error", "Error interno en el escaneo");
    });

    const result = await pollScanJob({
      jobId: "test-job-123",
      fetchJob,
      onProgress: () => {},
      sleep: () => Promise.resolve()
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("Error interno en el escaneo");
  });

  it("reintenta 2 fallos de red seguidos y sigue", async () => {
    let callCount = 0;
    const fetchJob = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Fallo de red 1");
      if (callCount === 2) throw new Error("Fallo de red 2");
      return makeJob("done", "Terminado tras reintentos");
    });

    const result = await pollScanJob({
      jobId: "test-job-123",
      fetchJob,
      onProgress: () => {},
      sleep: () => Promise.resolve(),
      maxConsecutiveErrors: 3
    });

    expect(result.status).toBe("done");
    expect(callCount).toBe(3);
  });

  it("con 3 fallos seguidos lanza el error", async () => {
    let callCount = 0;
    const fetchJob = vi.fn().mockImplementation(async () => {
      callCount++;
      throw new Error(`Fallo de red recurrente ${callCount}`);
    });

    await expect(
      pollScanJob({
        jobId: "test-job-123",
        fetchJob,
        onProgress: () => {},
        sleep: () => Promise.resolve(),
        maxConsecutiveErrors: 3
      })
    ).rejects.toThrow("Fallo de red recurrente 3");

    expect(callCount).toBe(3);
  });

  it("isCancelled corta la ejecución", async () => {
    let callCount = 0;
    let isCancelled = false;

    const fetchJob = vi.fn().mockImplementation(async () => {
      callCount++;
      isCancelled = true; // cancela después de la primera llamada
      return makeJob("running");
    });

    await expect(
      pollScanJob({
        jobId: "test-job-123",
        fetchJob,
        onProgress: () => {},
        sleep: () => Promise.resolve(),
        isCancelled: () => isCancelled
      })
    ).rejects.toThrow("Escaneo cancelado.");

    expect(callCount).toBe(1);
  });
});
