import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ALLOWED_MODELS } from "../infrastructure/settings/ModelManager.js";

const ProviderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.enum(["local", "api"]),
    pricing: z.enum(["free", "freemium", "paid"]),
    approxCostPerHourUsd: z.number().min(0),
    freeTier: z.string().optional(),
    supported: z.boolean(),
    quality: z.string().min(1),
    speedBasis: z.enum(["medido", "publicado", "estimado"]),
    speedByCase: z.object({ fiveMin: z.string(), oneHour: z.string(), tenHours: z.string() }),
    diarization: z.boolean(),
    privacy: z.string().min(1),
    notes: z.string().min(1),
    signupUrl: z.string()
  })
  .strict();

const FileSchema = z.object({
  updatedAt: z.string(),
  disclaimer: z.string().min(1),
  providers: z.array(ProviderSchema).min(1)
});

const raw = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../infrastructure/settings/recommendations.json"), "utf-8")
);

describe("recommendations.json", () => {
  const data = FileSchema.parse(raw);

  it("tiene la estructura esperada y ids únicos", () => {
    const ids = data.providers.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lo gratuito cuesta 0 y lo de pago/freemium tiene un precio", () => {
    for (const p of data.providers) {
      if (p.pricing === "free") expect(p.approxCostPerHourUsd).toBe(0);
      else expect(p.approxCostPerHourUsd).toBeGreaterThan(0);
    }
  });

  it("los motores locales son gratis y no salen del equipo; las APIs con capa gratuita la describen", () => {
    for (const p of data.providers) {
      if (p.kind === "local") expect(p.pricing).toBe("free");
      if (p.pricing === "freemium") expect(p.freeTier).toBeTruthy();
      if (p.kind === "api") expect(p.signupUrl).toMatch(/^https:\/\//);
    }
  });

  it("incluye los motores que la app ya puede usar", () => {
    const supported = data.providers.filter((p) => p.supported).map((p) => p.id);
    expect(supported).toEqual(expect.arrayContaining(["groq", "gemini"]));
  });
});

describe("ModelManager.ALLOWED_MODELS", () => {
  it("incluye los modelos cuantizados y turbo, y ninguno permite rutas", () => {
    expect(ALLOWED_MODELS).toEqual(
      expect.arrayContaining(["base", "small", "small-q5_1", "base-q5_1", "large-v3-turbo-q5_0"])
    );
    for (const m of ALLOWED_MODELS) expect(m).toMatch(/^[a-z0-9._-]+$/);
  });
});
