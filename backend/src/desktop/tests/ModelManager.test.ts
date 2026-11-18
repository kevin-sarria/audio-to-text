import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ModelManager } from "../infrastructure/settings/ModelManager.js";

describe("ModelManager", () => {
  let tempDir: string;
  let manager: ModelManager;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "model-manager-test-"));
    manager = new ModelManager(tempDir);
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("lista blanca rechaza path traversal y nombres no permitidos", async () => {
    await expect(manager.downloadModel("../hack")).rejects.toThrow(/Modelo no permitido/);
    await expect(manager.deleteModel("medium")).rejects.toThrow(/Modelo no permitido/);
  });

  it("descarga en streaming a .part y renombra al finalizar si Content-Length coincide", async () => {
    const mockContent = Buffer.from("DATOS_DEL_MODELO_WHISPER_SIMULADO");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        "content-length": String(mockContent.length)
      }),
      body: [mockContent] // Async iterable chunk
    });

    await manager.downloadModel("base");

    const finalPath = manager.getModelPath("base");
    const partPath = `${finalPath}.part`;

    expect(fs.existsSync(finalPath)).toBe(true);
    expect(fs.existsSync(partPath)).toBe(false);
    expect(await fsp.readFile(finalPath)).toEqual(mockContent);
  });

  it("cancelDownload elimina el archivo .part temporal", async () => {
    const partPath = `${manager.getModelPath("small")}.part`;
    await fsp.writeFile(partPath, "datos temporales parciales");
    expect(fs.existsSync(partPath)).toBe(true);

    await manager.cancelDownload("small");
    expect(fs.existsSync(partPath)).toBe(false);
  });
});
