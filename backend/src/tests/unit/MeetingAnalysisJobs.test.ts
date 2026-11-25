import { describe, it, expect } from "vitest";
import { MeetingAnalysisJobs } from "../../application/services/MeetingAnalysisJobs.js";
import { MeetingAnalysisDto } from "@audio-to-text/shared";

function dummyAnalysis(sessionId: string, summary = "Resumen de prueba"): MeetingAnalysisDto {
  return {
    id: "a1",
    sessionId,
    summary,
    keyDecisions: [],
    topicsDiscussed: [],
    issues: [],
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T10:00:00.000Z"
  };
}

const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("MeetingAnalysisJobs", () => {
  it("start → running → done con el análisis como resultado", async () => {
    let nowTime = 1_000_000;
    const jobs = new MeetingAnalysisJobs({ now: () => nowTime });
    let resolveRun!: (r: MeetingAnalysisDto) => void;
    const run = new Promise<MeetingAnalysisDto>((res) => (resolveRun = res));

    const job = jobs.start("s1", () => run);
    expect(job.status).toBe("running");
    expect(job.sessionId).toBe("s1");
    expect(job.finishedAt).toBeUndefined();
    expect(jobs.get(job.jobId)?.status).toBe("running");

    nowTime += 5000;
    resolveRun(dummyAnalysis("s1", "Listo"));
    await tick();

    const done = jobs.get(job.jobId);
    expect(done?.status).toBe("done");
    expect(done?.result?.summary).toBe("Listo");
    expect(done?.finishedAt).toBe(new Date(nowTime).toISOString());
  });

  it("registra el error del trabajo sin rechazar promesas sin manejar", async () => {
    const jobs = new MeetingAnalysisJobs();
    const job = jobs.start("s1", () => Promise.reject(new Error("El proveedor de IA respondió con error 500")));
    await tick();
    const failed = jobs.get(job.jobId);
    expect(failed?.status).toBe("error");
    expect(failed?.error).toContain("500");
    expect(failed?.result).toBeUndefined();
  });

  it("captura también un run que lanza de forma síncrona", async () => {
    const jobs = new MeetingAnalysisJobs();
    const job = jobs.start("s1", () => {
      throw new Error("falla síncrona");
    });
    await tick();
    expect(jobs.get(job.jobId)?.status).toBe("error");
    expect(jobs.get(job.jobId)?.error).toBe("falla síncrona");
  });

  it("actualiza la etapa mientras corre y deja de actualizarla al terminar", async () => {
    const jobs = new MeetingAnalysisJobs();
    let report!: (msg: string) => void;
    let resolveRun!: (r: MeetingAnalysisDto) => void;
    const job = jobs.start("s1", (onProgress) => {
      report = onProgress;
      return new Promise<MeetingAnalysisDto>((res) => (resolveRun = res));
    });

    report("Etapa 1: extrayendo puntos");
    expect(jobs.get(job.jobId)?.progress).toBe("Etapa 1: extrayendo puntos");

    resolveRun(dummyAnalysis("s1"));
    await tick();
    report("tarde");
    expect(jobs.get(job.jobId)?.progress).toBe("Etapa 1: extrayendo puntos");
  });

  it("reutiliza el trabajo en curso de la misma sesión y no el de otra", async () => {
    const jobs = new MeetingAnalysisJobs();
    let calls = 0;
    const never = () => {
      calls++;
      return new Promise<MeetingAnalysisDto>(() => {});
    };

    const a = jobs.start("s1", never);
    const b = jobs.start("s1", never);
    const c = jobs.start("s2", never);

    expect(b.jobId).toBe(a.jobId);
    expect(c.jobId).not.toBe(a.jobId);
    expect(calls).toBe(2);
    expect(jobs.getRunningForSession("s1")?.jobId).toBe(a.jobId);
    expect(jobs.getRunningForSession("s3")).toBeNull();
  });

  it("tras terminar, una nueva petición de la misma sesión crea otro trabajo", async () => {
    const jobs = new MeetingAnalysisJobs();
    const first = jobs.start("s1", () => Promise.resolve(dummyAnalysis("s1")));
    await tick();
    expect(jobs.getRunningForSession("s1")).toBeNull();

    const second = jobs.start("s1", () => new Promise<MeetingAnalysisDto>(() => {}));
    expect(second.jobId).not.toBe(first.jobId);
  });

  it("borra los trabajos terminados a los 30 minutos pero no los que corren", async () => {
    let nowTime = 0;
    const jobs = new MeetingAnalysisJobs({ now: () => nowTime });
    const done = jobs.start("s1", () => Promise.resolve(dummyAnalysis("s1")));
    const running = jobs.start("s2", () => new Promise<MeetingAnalysisDto>(() => {}));
    await tick();

    nowTime += 29 * 60 * 1000;
    expect(jobs.get(done.jobId)).not.toBeNull();

    nowTime += 2 * 60 * 1000;
    expect(jobs.get(done.jobId)).toBeNull();
    expect(jobs.get(running.jobId)?.status).toBe("running");
  });

  it("conserva como máximo 20 trabajos eliminando los terminados más viejos", async () => {
    let nowTime = 0;
    const jobs = new MeetingAnalysisJobs({ now: () => nowTime });
    const ids: string[] = [];
    for (let i = 0; i < 22; i++) {
      nowTime += 1000;
      ids.push(jobs.start(`s${i}`, () => Promise.resolve(dummyAnalysis(`s${i}`))).jobId);
      await tick();
    }
    expect(jobs.get(ids[0]!)).toBeNull();
    expect(jobs.get(ids[1]!)).toBeNull();
    expect(jobs.get(ids[21]!)).not.toBeNull();
  });
});
