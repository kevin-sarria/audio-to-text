import { describe, it, expect } from "vitest";
import { z } from "zod";

const SettingsSchema = z
  .object({
    engine: z.enum(["whisper-local", "groq", "gemini"]).default("whisper-local"),
    language: z.string().default("es"),
    whisperModel: z.enum(["base", "small"]).default("small"),
    whisperThreads: z.number().int().min(1).max(32).default(4),
    retentionHours: z.number().int().min(0).max(8760).default(48),
    groqModel: z.string().default("whisper-large-v3-turbo"),
    geminiModel: z.string().default("gemini-2.5-flash")
  })
  .strict();

describe("Frontend SettingsSchema", () => {
  it("aplica defaults correctamente", () => {
    const parsed = SettingsSchema.parse({});
    expect(parsed.engine).toBe("whisper-local");
    expect(parsed.language).toBe("es");
    expect(parsed.whisperModel).toBe("small");
    expect(parsed.retentionHours).toBe(48);
  });

  it("rechaza hilos de CPU fuera del rango 1..32", () => {
    expect(() => SettingsSchema.parse({ whisperThreads: 0 })).toThrow();
    expect(() => SettingsSchema.parse({ whisperThreads: 33 })).toThrow();
  });

  it("rechaza horas de retención negativas", () => {
    expect(() => SettingsSchema.parse({ retentionHours: -1 })).toThrow();
  });

  it("rechaza campos no permitidos en el esquema estricto", () => {
    expect(() => SettingsSchema.parse({ apiKey: "secreta" })).toThrow();
  });
});
