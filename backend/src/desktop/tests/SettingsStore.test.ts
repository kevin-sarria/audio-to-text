import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { SettingsStore, SettingsSchema } from "../infrastructure/settings/SettingsStore.js";

describe("SettingsStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "settings-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("inicializa con defaults válidos", () => {
    const store = new SettingsStore(tempDir);
    const settings = store.getSettings();

    expect(settings.engine).toBe("whisper-local");
    expect(settings.language).toBe("es");
    expect(settings.whisperModel).toBe("small");
    expect(settings.retentionHours).toBe(48);
    expect(settings.whisperThreads).toBeGreaterThanOrEqual(1);
  });

  it("validación Zod rechaza campos desconocidos (.strict) y fuera de rango", () => {
    // Campo desconocido
    expect(() =>
      SettingsSchema.parse({
        engine: "groq",
        unknownField: "invalido"
      })
    ).toThrow();

    // Hilos fuera de rango (>32 o <1)
    expect(() =>
      SettingsSchema.parse({
        whisperThreads: 0
      })
    ).toThrow();
    expect(() =>
      SettingsSchema.parse({
        whisperThreads: 33
      })
    ).toThrow();

    // Motor inválido
    expect(() =>
      SettingsSchema.parse({
        engine: "motor-inexistente"
      })
    ).toThrow();
  });

  it("actualización y persistencia atómica en disco", async () => {
    const store = new SettingsStore(tempDir);
    await store.updateSettings({
      engine: "groq",
      retentionHours: 0
    });

    const settingsFilePath = path.join(tempDir, "settings.json");
    const content = await fsp.readFile(settingsFilePath, "utf-8");
    const onDisk = JSON.parse(content);

    expect(onDisk.engine).toBe("groq");
    expect(onDisk.retentionHours).toBe(0);
    // Jamás debe almacenar claves de API
    expect(onDisk.apiKey).toBeUndefined();
    expect(onDisk.groqKey).toBeUndefined();
  });
});
