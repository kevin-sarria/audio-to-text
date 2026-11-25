import { describe, it, expect, vi } from "vitest";
import { followAnalysisJob } from "../features/meetingAnalysis/followAnalysisJob.js";
import type { MeetingAnalysisDto, MeetingAnalysisJobDto } from "@audio-to-text/shared";

const analysis: MeetingAnalysisDto = {
  id: "a1",
  sessionId: "s1",
  summary: "Resumen listo",
  keyDecisions: [],
  topicsDiscussed: [],
  issues: [],
  createdAt: "2026-11-25T10:00:00.000Z",
  updatedAt: "2026-11-25T10:00:00.000Z"
};

function makeJob(status: MeetingAnalysisJobDto["status"], extra: Partial<MeetingAnalysisJobDto> = {}): MeetingAnalysisJobDto {
  return {
    jobId: "j1",
    sessionId: "s1",
    status,
    progress: "Etapa 1: extrayendo y clasificando los puntos de la reunión",
    startedAt: "2026-11-25T10:00:00.000Z",
    ...extra
  };
}

const noSleep = async () => {};

describe("followAnalysisJob", () => {
  it("consulta hasta que termina y devuelve el análisis, informando el avance", async () => {
    const stages: string[] = [];
    const fetchJob = vi
      .fn()
      .mockResolvedValueOnce(makeJob("running", { progress: "Etapa 1" }))
      .mockResolvedValueOnce(makeJob("running", { progress: "Etapa 2" }))
      .mockResolvedValueOnce(makeJob("done", { progress: "Listo", result: analysis }));

    const result = await followAnalysisJob({
      jobId: "j1",
      fetchJob,
      onProgress: (j) => stages.push(j.progress),
      sleep: noSleep
    });

    expect(result.summary).toBe("Resumen listo");
    expect(stages).toEqual(["Etapa 1", "Etapa 2", "Listo"]);
    expect(fetchJob).toHaveBeenCalledTimes(3);
  });

  it("si el trabajo falló lanza el mensaje de error del proveedor", async () => {
    const fetchJob = vi
      .fn()
      .mockResolvedValue(makeJob("error", { error: "El proveedor de IA respondió con error 402: saldo insuficiente" }));

    await expect(followAnalysisJob({ jobId: "j1", fetchJob, sleep: noSleep })).rejects.toThrow("402");
  });

  it("si termina sin resultado lanza un error claro", async () => {
    const fetchJob = vi.fn().mockResolvedValue(makeJob("done"));
    await expect(followAnalysisJob({ jobId: "j1", fetchJob, sleep: noSleep })).rejects.toThrow("sin devolver resultado");
  });

  it("tolera errores de red aislados y sigue consultando", async () => {
    const fetchJob = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(makeJob("done", { result: analysis }));

    const result = await followAnalysisJob({ jobId: "j1", fetchJob, sleep: noSleep });
    expect(result.id).toBe("a1");
    expect(fetchJob).toHaveBeenCalledTimes(3);
  });

  it("se rinde tras 3 errores de red seguidos y propaga el último", async () => {
    const fetchJob = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    await expect(followAnalysisJob({ jobId: "j1", fetchJob, sleep: noSleep })).rejects.toThrow("Failed to fetch");
    expect(fetchJob).toHaveBeenCalledTimes(3);
  });

  it("deja de consultar cuando se cancela", async () => {
    let cancelled = false;
    const fetchJob = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return makeJob("running");
    });

    await expect(
      followAnalysisJob({ jobId: "j1", fetchJob, isCancelled: () => cancelled, sleep: noSleep })
    ).rejects.toThrow();
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });
});
