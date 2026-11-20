import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalStorageService } from "../../infrastructure/storage/LocalStorageService.js";

describe("LocalStorageService - contención de rutas", () => {
  let baseDir: string;
  let storage: LocalStorageService;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "a2t-storage-"));
    storage = new LocalStorageService(baseDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("resuelve claves normales dentro de la carpeta base", () => {
    expect(storage.getAbsolutePath("raw/abc.wav")).toBe(path.join(baseDir, "raw", "abc.wav"));
  });

  it("permite '..' que no sale de la carpeta base", () => {
    expect(storage.getAbsolutePath("raw/sub/../abc.wav")).toBe(path.join(baseDir, "raw", "abc.wav"));
  });

  it.each([
    ["../fuera.wav"],
    ["..\\fuera.wav"],
    ["a/../../fuera.wav"],
    ["raw/x./../../../fuera"],
    ["raw\\..\\..\\fuera.wav"],
    [path.join(os.tmpdir(), "absoluta.wav")],
    [""],
    ["."],
    ["raw/.."]
  ])("rechaza la clave %j que escapa o apunta a la propia carpeta base", (key) => {
    expect(() => storage.getAbsolutePath(key)).toThrow(/fuera del almacenamiento/);
  });

  it("no escribe fuera de la carpeta base aunque se llame a save con una clave maliciosa", async () => {
    const name = `a2t-escapado-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;
    try {
      await expect(storage.save(Buffer.from("x"), `a/../../${name}`)).rejects.toThrow(
        /fuera del almacenamiento/
      );
      await expect(fs.access(path.join(baseDir, "..", name))).rejects.toThrow();
    } finally {
      await fs.rm(path.join(baseDir, "..", name), { force: true });
    }
  });

  it("no borra fuera de la carpeta base", async () => {
    const outside = path.join(path.dirname(baseDir), `a2t-victima-${Date.now()}.txt`);
    await fs.writeFile(outside, "no borrar");
    try {
      await expect(storage.delete(`../${path.basename(outside)}`)).rejects.toThrow(
        /fuera del almacenamiento/
      );
      await expect(fs.readFile(outside, "utf-8")).resolves.toBe("no borrar");
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it("sigue funcionando el ciclo save/get/exists/delete con claves válidas", async () => {
    await storage.save(Buffer.from("audio"), "raw/ok.wav");
    expect(await storage.exists("raw/ok.wav")).toBe(true);
    expect((await storage.get("raw/ok.wav")).toString()).toBe("audio");
    await storage.delete("raw/ok.wav");
    expect(await storage.exists("raw/ok.wav")).toBe(false);
  });
});
