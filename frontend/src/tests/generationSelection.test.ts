import { describe, it, expect } from "vitest";
import {
  resolveGenerationSelection,
  formatGenerationMeta
} from "../features/meetingAnalysis/generationSelection.js";
import type {
  AnalysisGenerationMetaDto,
  ProjectFolderDto,
  CustomAiProviderDto
} from "@audio-to-text/shared";

describe("resolveGenerationSelection", () => {
  const dummyMeta: AnalysisGenerationMetaDto = {
    provider: "openai",
    providerLabel: "OpenAI",
    model: "gpt-4o",
    profileId: "diamante",
    profileName: "DIAMANTE",
    generatedAt: "2026-11-20T10:00:00Z",
    durationMs: 41000,
    attempts: 1,
    usedFallback: false,
    partialAnalysis: false,
    validationErrors: [],
    validationWarnings: []
  };

  const dummyFolder: ProjectFolderDto = {
    id: "folder-1",
    name: "DIAMANTE",
    technicalContext: "Contexto técnico",
    defaultProvider: "groq",
    defaultModel: "llama-3.3-70b",
    profileId: "diamante-folder",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z"
  };

  const dummySettings = {
    issuesDefaultProvider: "gemini",
    issuesDefaultModel: "gemini-1.5-pro"
  };

  const dummyCustomProviders: CustomAiProviderDto[] = [
    {
      id: "custom-deepseek",
      name: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      defaultModel: "deepseek-chat",
      apiKey: "secret"
    }
  ];

  it("prioridad 1: utiliza meta sobre carpeta y ajustes (proveedor, modelo y perfil)", () => {
    const res = resolveGenerationSelection({
      meta: dummyMeta,
      folder: dummyFolder,
      settings: dummySettings,
      customProviders: dummyCustomProviders
    });

    expect(res.provider).toBe("openai");
    expect(res.model).toBe("gpt-4o");
    expect(res.profileId).toBe("diamante");
  });

  it("prioridad 2: si no hay meta, usa la carpeta vinculada", () => {
    const res = resolveGenerationSelection({
      meta: null,
      folder: dummyFolder,
      settings: dummySettings,
      customProviders: dummyCustomProviders
    });

    expect(res.provider).toBe("groq");
    expect(res.model).toBe("llama-3.3-70b");
    expect(res.profileId).toBe("diamante-folder");
  });

  it("prioridad 3: si no hay meta ni carpeta, usa los Ajustes globales", () => {
    const res = resolveGenerationSelection({
      meta: null,
      folder: null,
      settings: dummySettings,
      customProviders: dummyCustomProviders
    });

    expect(res.provider).toBe("gemini");
    expect(res.model).toBe("gemini-1.5-pro");
    expect(res.profileId).toBe("generic");
  });

  it("prioridad 4: sin meta, carpeta ni ajustes, cae a google-account y genérico", () => {
    const res = resolveGenerationSelection({
      meta: null,
      folder: null,
      settings: null,
      customProviders: dummyCustomProviders
    });

    expect(res.provider).toBe("google-account");
    expect(res.model).toBe("");
    expect(res.profileId).toBe("generic");
  });

  it("proveedor custom borrado en meta salta a la carpeta vinculada", () => {
    const metaWithDeletedCustom: AnalysisGenerationMetaDto = {
      ...dummyMeta,
      provider: "custom-old-deleted",
      model: "old-model"
    };

    const res = resolveGenerationSelection({
      meta: metaWithDeletedCustom,
      folder: dummyFolder,
      settings: dummySettings,
      customProviders: dummyCustomProviders
    });

    expect(res.provider).toBe("groq");
    expect(res.model).toBe("llama-3.3-70b");
    // El perfil sigue respetando meta si está presente
    expect(res.profileId).toBe("diamante");
  });

  it("proveedor custom existente en meta se mantiene", () => {
    const metaWithValidCustom: AnalysisGenerationMetaDto = {
      ...dummyMeta,
      provider: "custom-deepseek",
      model: "deepseek-coder"
    };

    const res = resolveGenerationSelection({
      meta: metaWithValidCustom,
      folder: dummyFolder,
      settings: dummySettings,
      customProviders: dummyCustomProviders
    });

    expect(res.provider).toBe("custom-deepseek");
    expect(res.model).toBe("deepseek-coder");
  });

  it("resuelve perfil por separado: meta -> carpeta -> generic", () => {
    // 1. Con meta.profileId
    expect(
      resolveGenerationSelection({
        meta: { ...dummyMeta, profileId: "meta-profile" },
        folder: { ...dummyFolder, profileId: "folder-profile" }
      }).profileId
    ).toBe("meta-profile");

    // 2. Sin meta.profileId, con folder.profileId
    expect(
      resolveGenerationSelection({
        meta: { ...dummyMeta, profileId: "" },
        folder: { ...dummyFolder, profileId: "folder-profile" }
      }).profileId
    ).toBe("folder-profile");

    // 3. Sin meta ni folder
    expect(
      resolveGenerationSelection({
        meta: null,
        folder: null
      }).profileId
    ).toBe("generic");
  });
});

describe("formatGenerationMeta", () => {
  it("maneja meta null devolviendo valores seguros", () => {
    const res = formatGenerationMeta(null);
    expect(res.modelText).toBe("modelo predeterminado");
    expect(res.whenText).toBe("");
    expect(res.durationText).toBe("");
    expect(res.statusKind).toBe("ok");
    expect(res.statusText).toBe("");
  });

  it("formatea modelo vacío como 'modelo predeterminado'", () => {
    const meta: AnalysisGenerationMetaDto = {
      provider: "google-account",
      providerLabel: "Cuenta de Google",
      model: "",
      profileId: "generic",
      profileName: "Genérico",
      generatedAt: new Date().toISOString(),
      durationMs: 41000,
      attempts: 1,
      usedFallback: false,
      partialAnalysis: false,
      validationErrors: [],
      validationWarnings: []
    };

    expect(formatGenerationMeta(meta).modelText).toBe("modelo predeterminado");

    const metaWithSpace = { ...meta, model: "   " };
    expect(formatGenerationMeta(metaWithSpace).modelText).toBe("modelo predeterminado");

    const metaWithModel = { ...meta, model: "gemini-1.5-pro" };
    expect(formatGenerationMeta(metaWithModel).modelText).toBe("gemini-1.5-pro");
  });

  it("formatea tiempos relativos: segundos, minutos, horas y días", () => {
    const baseTime = new Date("2026-11-20T12:00:00Z").getTime();

    const makeMeta = (isoString: string): AnalysisGenerationMetaDto => ({
      provider: "openai",
      providerLabel: "OpenAI",
      model: "gpt-4o",
      profileId: "generic",
      profileName: "Genérico",
      generatedAt: isoString,
      durationMs: 10000,
      attempts: 1,
      usedFallback: false,
      partialAnalysis: false,
      validationErrors: [],
      validationWarnings: []
    });

    // 30 segundos antes -> hace un momento
    const t30s = new Date(baseTime - 30 * 1000).toISOString();
    expect(formatGenerationMeta(makeMeta(t30s), baseTime).whenText).toBe("hace un momento");

    // 5 minutos antes -> hace 5 min
    const t5m = new Date(baseTime - 5 * 60 * 1000).toISOString();
    expect(formatGenerationMeta(makeMeta(t5m), baseTime).whenText).toBe("hace 5 min");

    // 2 horas antes -> hace 2 h
    const t2h = new Date(baseTime - 2 * 3600 * 1000).toISOString();
    expect(formatGenerationMeta(makeMeta(t2h), baseTime).whenText).toBe("hace 2 h");

    // 1 día antes -> hace 1 día
    const t1d = new Date(baseTime - 24 * 3600 * 1000).toISOString();
    expect(formatGenerationMeta(makeMeta(t1d), baseTime).whenText).toBe("hace 1 día");

    // 3 días antes -> hace 3 días
    const t3d = new Date(baseTime - 3 * 24 * 3600 * 1000).toISOString();
    expect(formatGenerationMeta(makeMeta(t3d), baseTime).whenText).toBe("hace 3 días");
  });

  it("formatea duración en segundos y minutos", () => {
    const makeMeta = (ms: number): AnalysisGenerationMetaDto => ({
      provider: "openai",
      providerLabel: "OpenAI",
      model: "gpt-4o",
      profileId: "generic",
      profileName: "Genérico",
      generatedAt: new Date().toISOString(),
      durationMs: ms,
      attempts: 1,
      usedFallback: false,
      partialAnalysis: false,
      validationErrors: [],
      validationWarnings: []
    });

    expect(formatGenerationMeta(makeMeta(41000)).durationText).toBe("41 s");
    expect(formatGenerationMeta(makeMeta(125000)).durationText).toBe("2 min 5 s");
    expect(formatGenerationMeta(makeMeta(120000)).durationText).toBe("2 min");
  });

  it("calcula statusKind y statusText para ok, warnings y errors", () => {
    const base: AnalysisGenerationMetaDto = {
      provider: "openai",
      providerLabel: "OpenAI",
      model: "gpt-4o",
      profileId: "generic",
      profileName: "Genérico",
      generatedAt: new Date().toISOString(),
      durationMs: 41000,
      attempts: 1,
      usedFallback: false,
      partialAnalysis: false,
      validationErrors: [],
      validationWarnings: []
    };

    // OK
    const okRes = formatGenerationMeta(base);
    expect(okRes.statusKind).toBe("ok");
    expect(okRes.statusText).toBe("validado ✓");

    // Warnings
    const warnRes = formatGenerationMeta({
      ...base,
      validationWarnings: ["Aviso 1", "Aviso 2", "Aviso 3"]
    });
    expect(warnRes.statusKind).toBe("warnings");
    expect(warnRes.statusText).toBe("⚠ 3 avisos para revisar");

    // Errors (prioritarios sobre warnings)
    const errRes = formatGenerationMeta({
      ...base,
      validationErrors: ["Error 1"],
      validationWarnings: ["Aviso 1"]
    });
    expect(errRes.statusKind).toBe("errors");
    expect(errRes.statusText).toBe("✕ 1 error sin corregir");
  });
});
