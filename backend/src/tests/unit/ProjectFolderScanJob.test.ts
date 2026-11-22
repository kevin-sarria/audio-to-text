import { describe, it, expect, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { ProjectFolderController } from "../../interfaces/http/controllers/ProjectFolderController.js";
import { ContextScanJobs } from "../../application/services/ContextScanJobs.js";
import { IMeetingAnalysisService } from "../../domain/services/IMeetingAnalysisService.js";

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

describe("ProjectFolderController - Escaneo en segundo plano", () => {
  const dummyUseCases: any = {
    create: {} as any,
    list: {} as any,
    get: {} as any,
    update: {} as any,
    delete: {} as any
  };

  it("POST /scan-context sin ruta → 400", async () => {
    const controller = new ProjectFolderController(
      dummyUseCases.create,
      dummyUseCases.list,
      dummyUseCases.get,
      dummyUseCases.update,
      dummyUseCases.delete
    );

    const req: any = { body: { folderPath: "   " } };
    const res = mockResponse();
    const next = vi.fn();

    await controller.scanContext(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("obligatoria");
  });

  it("POST /scan-context con carpeta inexistente → 400", async () => {
    const fakeAnalysisService: IMeetingAnalysisService = {
      generateAnalysis: vi.fn(),
      generateContextFromRepo: vi.fn()
    };

    const controller = new ProjectFolderController(
      dummyUseCases.create,
      dummyUseCases.list,
      dummyUseCases.get,
      dummyUseCases.update,
      dummyUseCases.delete,
      fakeAnalysisService
    );

    const nonExistentPath = path.join(os.tmpdir(), "no-existe-carpeta-" + Date.now());
    const req: any = { body: { folderPath: nonExistentPath } };
    const res = mockResponse();
    const next = vi.fn();

    await controller.scanContext(req, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("no existe o no es una carpeta válida");
  });

  it("POST válido → 202 con jobId; GET desconocido → 404; GET tras terminar → done con contexto", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-scan-job-"));
    try {
      let resolveRepoScan!: (res: any) => void;
      const scanPromise = new Promise((resolve) => {
        resolveRepoScan = resolve;
      });

      const fakeAnalysisService: IMeetingAnalysisService = {
        generateAnalysis: vi.fn(),
        generateContextFromRepo: vi.fn().mockImplementation((_p, _opts, onProgress) => {
          onProgress?.("Leyendo documentos");
          return scanPromise;
        })
      };

      const scanJobs = new ContextScanJobs();
      const controller = new ProjectFolderController(
        dummyUseCases.create,
        dummyUseCases.list,
        dummyUseCases.get,
        dummyUseCases.update,
        dummyUseCases.delete,
        fakeAnalysisService,
        scanJobs
      );

      // 1. Iniciar escaneo válido
      const postReq: any = { body: { folderPath: tempDir, provider: "google-account" } };
      const postRes = mockResponse();
      await controller.scanContext(postReq, postRes, vi.fn());

      expect(postRes.statusCode).toBe(202);
      expect(postRes.body.success).toBe(true);
      expect(postRes.body.data.status).toBe("running");
      const jobId = postRes.body.data.jobId;
      expect(jobId).toBeDefined();

      // 2. GET con jobId desconocido → 404
      const unknownGetReq: any = { params: { jobId: "id-inexistente" } };
      const unknownGetRes = mockResponse();
      await controller.getScanJob(unknownGetReq, unknownGetRes, vi.fn());

      expect(unknownGetRes.statusCode).toBe(404);
      expect(unknownGetRes.body.success).toBe(false);
      expect(unknownGetRes.body.error).toContain("No se encontró el escaneo");

      // 3. GET mientras corre
      const runningGetReq: any = { params: { jobId } };
      const runningGetRes = mockResponse();
      await controller.getScanJob(runningGetReq, runningGetRes, vi.fn());

      expect(runningGetRes.statusCode).toBe(200);
      expect(runningGetRes.body.data.status).toBe("running");
      expect(runningGetRes.body.data.progress).toBe("Leyendo documentos");

      // 4. Completar escaneo
      resolveRepoScan({
        technicalContext: "## 1. Contexto generado",
        report: { verified: 10 }
      });
      await Promise.resolve();
      await Promise.resolve();

      // 5. GET tras terminar → done con el contexto
      const doneGetRes = mockResponse();
      await controller.getScanJob(runningGetReq, doneGetRes, vi.fn());

      expect(doneGetRes.statusCode).toBe(200);
      expect(doneGetRes.body.data.status).toBe("done");
      expect(doneGetRes.body.data.result.technicalContext).toBe("## 1. Contexto generado");
      expect(doneGetRes.body.data.result.folderPath).toBe(tempDir);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
