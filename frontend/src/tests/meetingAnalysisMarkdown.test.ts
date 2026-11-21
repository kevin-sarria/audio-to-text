import { describe, it, expect } from "vitest";
import { buildStructuredMarkdown } from "../features/meetingAnalysis/components/MeetingAnalysisMarkdown.js";
import type { MeetingAnalysisDto, AnalysisGenerationMetaDto } from "@audio-to-text/shared";

describe("buildStructuredMarkdown", () => {
  const dummyAnalysis: MeetingAnalysisDto = {
    id: "analysis-1",
    sessionId: "session-1",
    title: "Reunión de prueba",
    summary: "Resumen de la reunión",
    keyDecisions: ["Decisión 1"],
    topicsDiscussed: ["Tema 1"],
    issues: [],
    createdAt: "2026-11-20T10:00:00Z",
    updatedAt: "2026-11-20T10:00:00Z"
  };

  const dummyMeta: AnalysisGenerationMetaDto = {
    provider: "custom-deepseek",
    providerLabel: "DeepSeek",
    model: "deepseek-chat",
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

  it("incluye la línea 'Generado con ...' cuando hay generationMeta", () => {
    const analysisWithMeta: MeetingAnalysisDto = {
      ...dummyAnalysis,
      generationMeta: dummyMeta
    };

    const md = buildStructuredMarkdown(analysisWithMeta, "Reunión de prueba");
    expect(md).toContain("> Generado con DeepSeek · deepseek-chat · perfil DIAMANTE · 2026-11-20T10:00:00Z");
  });

  it("usa 'modelo predeterminado' cuando meta.model está vacío", () => {
    const analysisWithEmptyModel: MeetingAnalysisDto = {
      ...dummyAnalysis,
      generationMeta: {
        ...dummyMeta,
        model: ""
      }
    };

    const md = buildStructuredMarkdown(analysisWithEmptyModel, "Reunión de prueba");
    expect(md).toContain("> Generado con DeepSeek · modelo predeterminado · perfil DIAMANTE · 2026-11-20T10:00:00Z");
  });

  it("no incluye la línea 'Generado con ...' cuando generationMeta es null o undefined", () => {
    const analysisWithoutMeta: MeetingAnalysisDto = {
      ...dummyAnalysis,
      generationMeta: null
    };

    const md = buildStructuredMarkdown(analysisWithoutMeta, "Reunión de prueba");
    expect(md).not.toContain("> Generado con");
  });
});
