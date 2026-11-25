import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { MeetingAnalysisController } from "../../interfaces/http/controllers/MeetingAnalysisController.js";
import { MeetingAnalysisJobs } from "../../application/services/MeetingAnalysisJobs.js";
import { NotFoundError } from "../../domain/errors/NotFoundError.js";
import { ValidationError } from "../../domain/errors/ValidationError.js";
import { ForbiddenError } from "../../domain/errors/ForbiddenError.js";

function mockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    }
  };
  return res;
}

function fakeAnalysisEntity(sessionId: string) {
  return {
    id: "an-1",
    sessionId,
    title: "Análisis de prueba",
    projectContext: null,
    summary: "Resumen listo",
    alreadyResolved: [],
    inProgress: [],
    keyDecisions: ["Decisión 1"],
    topicsDiscussed: [],
    globalOpenQuestions: [],
    issues: [],
    backlog: [],
    repoHoursTotals: null,
    generationMeta: null,
    createdAt: new Date("2026-11-25T10:00:00.000Z"),
    updatedAt: new Date("2026-11-25T10:00:00.000Z")
  };
}

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function setup(execute: (input: any) => Promise<any>) {
  const generateUseCase: any = {
    assertCanGenerate: vi.fn().mockResolvedValue(undefined),
    assertCanAccess: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(execute)
  };
  const jobs = new MeetingAnalysisJobs();
  const controller = new MeetingAnalysisController(generateUseCase, {} as any, undefined, jobs);
  return { controller, generateUseCase, jobs };
}

describe("MeetingAnalysisController - análisis en segundo plano", () => {
  it("POST responde 202 con jobId de inmediato aunque el análisis siga corriendo", async () => {
    const { controller, generateUseCase } = setup(() => new Promise(() => {})); // nunca termina
    const req: any = { params: { id: "s1" }, body: { provider: "gemini", model: "m" }, user: { userId: "u1" } };
    const res = mockResponse();
    const next = vi.fn();

    await controller.generate(req, res, next);

    expect(res.statusCode).toBe(202);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.jobId).toBe("string");
    expect(next).not.toHaveBeenCalled();
    expect(generateUseCase.assertCanGenerate).toHaveBeenCalledWith({ sessionId: "s1", userId: "u1", guestTokenHash: null });
    expect(generateUseCase.execute).toHaveBeenCalledTimes(1);
    expect(generateUseCase.execute.mock.calls[0][0]).toMatchObject({
      sessionId: "s1",
      userId: "u1",
      provider: "gemini",
      model: "m"
    });
    expect(typeof generateUseCase.execute.mock.calls[0][0].onProgress).toBe("function");
  });

  it("pasa el hash del token de invitado al caso de uso", async () => {
    const { controller, generateUseCase } = setup(() => new Promise(() => {}));
    const req: any = { params: { id: "s1" }, body: {}, guestToken: "token-invitado" };

    await controller.generate(req, mockResponse(), vi.fn());

    const expected = crypto.createHash("sha256").update("token-invitado").digest("hex");
    expect(generateUseCase.assertCanGenerate).toHaveBeenCalledWith({ sessionId: "s1", userId: null, guestTokenHash: expected });
    expect(generateUseCase.execute.mock.calls[0][0].guestTokenHash).toBe(expected);
  });

  it("si la validación falla responde con el error al instante y no arranca ningún trabajo", async () => {
    const { controller, generateUseCase, jobs } = setup(() => new Promise(() => {}));
    const error = new ValidationError("La sesión debe estar en estado COMPLETED");
    generateUseCase.assertCanGenerate.mockRejectedValue(error);
    const req: any = { params: { id: "s1" }, body: {} };
    const res = mockResponse();
    const next = vi.fn();

    await controller.generate(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.body).toBeNull();
    expect(generateUseCase.execute).not.toHaveBeenCalled();
    expect(jobs.getRunningForSession("s1")).toBeNull();
  });

  it("una segunda petición mientras corre reutiliza el mismo trabajo y no vuelve a gastar tokens", async () => {
    const { controller, generateUseCase } = setup(() => new Promise(() => {}));
    const req: any = { params: { id: "s1" }, body: {} };
    const res1 = mockResponse();
    const res2 = mockResponse();

    await controller.generate(req, res1, vi.fn());
    await controller.generate(req, res2, vi.fn());

    expect(res2.body.data.jobId).toBe(res1.body.data.jobId);
    expect(generateUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("GET job: refleja la etapa, y al terminar entrega el análisis como DTO", async () => {
    let resolveRun!: (v: unknown) => void;
    let reportProgress!: (msg: string) => void;
    const { controller } = setup((input) => {
      reportProgress = input.onProgress;
      return new Promise((res) => (resolveRun = res));
    });
    const genRes = mockResponse();
    await controller.generate({ params: { id: "s1" }, body: {} } as any, genRes, vi.fn());
    const jobId = genRes.body.data.jobId;

    reportProgress("Etapa 2: redactando los issues");
    const running = mockResponse();
    await controller.getJob({ params: { id: "s1", jobId } } as any, running, vi.fn());
    expect(running.body.data.status).toBe("running");
    expect(running.body.data.progress).toBe("Etapa 2: redactando los issues");

    resolveRun(fakeAnalysisEntity("s1"));
    await tick();

    const done = mockResponse();
    await controller.getJob({ params: { id: "s1", jobId } } as any, done, vi.fn());
    expect(done.body.data.status).toBe("done");
    expect(done.body.data.result.summary).toBe("Resumen listo");
    expect(done.body.data.result.createdAt).toBe("2026-11-25T10:00:00.000Z");
    expect(done.body.data.result.keyDecisions).toEqual(["Decisión 1"]);
  });

  it("GET job: si el análisis falla entrega el mensaje de error del proveedor", async () => {
    const { controller } = setup(() => Promise.reject(new Error("El proveedor de IA respondió con error 402: saldo insuficiente")));
    const genRes = mockResponse();
    await controller.generate({ params: { id: "s1" }, body: {} } as any, genRes, vi.fn());
    await tick();

    const res = mockResponse();
    await controller.getJob({ params: { id: "s1", jobId: genRes.body.data.jobId } } as any, res, vi.fn());

    expect(res.body.data.status).toBe("error");
    expect(res.body.data.error).toContain("402");
  });

  it("GET job: id desconocido o de otra sesión → NotFoundError", async () => {
    const { controller } = setup(() => new Promise(() => {}));
    const genRes = mockResponse();
    await controller.generate({ params: { id: "s1" }, body: {} } as any, genRes, vi.fn());

    const next1 = vi.fn();
    await controller.getJob({ params: { id: "s1", jobId: "no-existe" } } as any, mockResponse(), next1);
    expect(next1.mock.calls[0]?.[0]).toBeInstanceOf(NotFoundError);

    const next2 = vi.fn();
    await controller.getJob({ params: { id: "otra-sesion", jobId: genRes.body.data.jobId } } as any, mockResponse(), next2);
    expect(next2.mock.calls[0]?.[0]).toBeInstanceOf(NotFoundError);
  });

  it("GET job y GET job activo exigen acceso a la sesión", async () => {
    const { controller, generateUseCase } = setup(() => new Promise(() => {}));
    const forbidden = new ForbiddenError("No tiene permisos para acceder a esta sesión.");
    generateUseCase.assertCanAccess.mockRejectedValue(forbidden);

    const next1 = vi.fn();
    const res1 = mockResponse();
    await controller.getJob({ params: { id: "s1", jobId: "x" } } as any, res1, next1);
    expect(next1).toHaveBeenCalledWith(forbidden);
    expect(res1.body).toBeNull();

    const next2 = vi.fn();
    const res2 = mockResponse();
    await controller.getActiveJob({ params: { id: "s1" } } as any, res2, next2);
    expect(next2).toHaveBeenCalledWith(forbidden);
    expect(res2.body).toBeNull();
  });

  it("GET job activo: devuelve el trabajo en curso o null", async () => {
    const { controller } = setup(() => new Promise(() => {}));

    const none = mockResponse();
    await controller.getActiveJob({ params: { id: "s1" } } as any, none, vi.fn());
    expect(none.body).toEqual({ success: true, data: null });

    const genRes = mockResponse();
    await controller.generate({ params: { id: "s1" }, body: {} } as any, genRes, vi.fn());

    const active = mockResponse();
    await controller.getActiveJob({ params: { id: "s1" } } as any, active, vi.fn());
    expect(active.body.data.jobId).toBe(genRes.body.data.jobId);
    expect(active.body.data.status).toBe("running");

    const otherSession = mockResponse();
    await controller.getActiveJob({ params: { id: "s2" } } as any, otherSession, vi.fn());
    expect(otherSession.body.data).toBeNull();
  });
});
