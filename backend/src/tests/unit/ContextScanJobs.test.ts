import { describe, it, expect } from "vitest";
import { ContextScanJobs } from "../../application/services/ContextScanJobs.js";
import { ProjectContextScanResultDto, ProjectContextScanReportDto } from "@audio-to-text/shared";

function createDummyResult(context = "Contexto técnico de prueba"): ProjectContextScanResultDto {
  return {
    technicalContext: context,
    report: {
      generatedAt: new Date().toISOString(),
      providerLabel: "TestProvider",
      model: "test-model",
      layout: "single-repo",
      repositories: [],
      readLog: [],
      notFullyRead: [],
      verification: { verified: 1, unconfirmed: 0, discarded: 0 },
      discarded: [],
      openQuestions: [],
      contradictions: 0,
      notFound: [],
      redactions: 0,
      skippedSecretFiles: 0,
      llmCalls: 1
    } as ProjectContextScanReportDto
  };
}

describe("ContextScanJobs", () => {
  it("start → running → done con resultado", async () => {
    let nowTime = 1000000;
    const jobs = new ContextScanJobs({ now: () => nowTime });

    let resolveRun!: (res: ProjectContextScanResultDto) => void;
    const runPromise = new Promise<ProjectContextScanResultDto>((resolve) => {
      resolveRun = resolve;
    });

    const job = jobs.start("C:/proyectos/mi-app", (_onProgress) => runPromise);

    expect(job.status).toBe("running");
    expect(job.jobId).toBeDefined();
    expect(job.progress).toBe("Inventario y lectura del código");
    expect(job.startedAt).toBeDefined();
    expect(job.finishedAt).toBeUndefined();

    // Consultar mientras corre
    const runningJob = jobs.get(job.jobId);
    expect(runningJob?.status).toBe("running");

    // Completar el trabajo
    nowTime += 5000;
    resolveRun(createDummyResult("Resultado exitoso"));
    await Promise.resolve(); // dejar que se procese el .then
    await Promise.resolve();

    const doneJob = jobs.get(job.jobId);
    expect(doneJob?.status).toBe("done");
    expect(doneJob?.finishedAt).toBe(new Date(nowTime).toISOString());
    expect(doneJob?.result?.technicalContext).toBe("Resultado exitoso");
    expect(doneJob?.result?.folderPath).toBe("C:/proyectos/mi-app");
    expect(doneJob?.error).toBeUndefined();
  });

  it("error capturado como status: 'error' con el mensaje y sin dejar promesa rechazada", async () => {
    const jobs = new ContextScanJobs();

    let rejectRun!: (err: Error) => void;
    const runPromise = new Promise<ProjectContextScanResultDto>((_, reject) => {
      rejectRun = reject;
    });

    const job = jobs.start("C:/proyectos/error-app", () => runPromise);
    expect(job.status).toBe("running");

    rejectRun(new Error("Fallo en la conexión con el LLM"));
    await Promise.resolve();
    await Promise.resolve();

    const failedJob = jobs.get(job.jobId);
    expect(failedJob?.status).toBe("error");
    expect(failedJob?.error).toBe("Fallo en la conexión con el LLM");
    expect(failedJob?.finishedAt).toBeDefined();
    expect(failedJob?.result).toBeUndefined();
  });

  it("misma carpeta mientras corre devuelve el mismo jobId", () => {
    const jobs = new ContextScanJobs();
    const pendingPromise = new Promise<ProjectContextScanResultDto>(() => {});

    // En Windows las rutas son case-insensitive y se normalizan con path.resolve
    const job1 = jobs.start("C:/proyectos/App1", () => pendingPromise);
    const job2 = jobs.start("c:/proyectos/app1", () => pendingPromise);

    expect(job1.jobId).toBe(job2.jobId);
    expect(job2.status).toBe("running");
  });

  it("limpieza a los 30 min con reloj inyectado", async () => {
    let nowTime = 1000000;
    const jobs = new ContextScanJobs({ now: () => nowTime });

    const job1 = jobs.start("C:/app1", async () => createDummyResult());
    await Promise.resolve();
    await Promise.resolve();

    expect(jobs.get(job1.jobId)?.status).toBe("done");

    // Avanzar 29 minutos: todavía existe
    nowTime += 29 * 60 * 1000;
    expect(jobs.get(job1.jobId)).not.toBeNull();

    // Avanzar a 31 minutos desde la finalización: se limpia
    nowTime += 2 * 60 * 1000;
    expect(jobs.get(job1.jobId)).toBeNull();
  });

  it("tope de 20 trabajos: si se excede, se borran los terminados más viejos", async () => {
    let nowTime = 1000000;
    const jobs = new ContextScanJobs({ now: () => nowTime });

    const jobIds: string[] = [];

    // Crear 20 trabajos terminados espaciados en el tiempo
    for (let i = 0; i < 20; i++) {
      nowTime += 1000;
      const job = jobs.start(`C:/app${i}`, async () => createDummyResult(`Contexto ${i}`));
      jobIds.push(job.jobId);
      await Promise.resolve();
      await Promise.resolve();
    }

    // Los 20 trabajos existen
    for (const id of jobIds) {
      expect(jobs.get(id)).not.toBeNull();
    }

    // Agregar el trabajo 21
    nowTime += 1000;
    const job21 = jobs.start("C:/app21", async () => createDummyResult("Contexto 21"));
    await Promise.resolve();
    await Promise.resolve();

    // El más viejo (jobIds[0]) debió ser eliminado para no pasar de 20
    expect(jobs.get(jobIds[0]!)).toBeNull();
    expect(jobs.get(jobIds[1]!)).not.toBeNull();
    expect(jobs.get(job21.jobId)).not.toBeNull();
  });
});
