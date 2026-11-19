import { describe, it, expect } from "vitest";
import {
  GenerateMeetingAnalysisSchema,
  UpdateMeetingAnalysisTitleSchema
} from "@audio-to-text/shared";

describe("Meeting Analysis DTO & Schemas Validation", () => {
  it("acepta identificadores dinámicos de proveedores personalizados (ej. custom-deepseek-5876)", () => {
    const validCustomPayload = {
      projectContext: "Stack: Express + React",
      provider: "custom-deepseek-5876",
      model: "deepseek-flash",
      baseUrl: "https://api.deepseek.com"
    };

    const parsed = GenerateMeetingAnalysisSchema.safeParse(validCustomPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.provider).toBe("custom-deepseek-5876");
      expect(parsed.data.model).toBe("deepseek-flash");
    }
  });

  it("acepta proveedores integrados por defecto (google-account, gemini, openai, groq)", () => {
    const builtinProviders = ["google-account", "gemini", "openai", "groq"];
    for (const p of builtinProviders) {
      const parsed = GenerateMeetingAnalysisSchema.safeParse({ provider: p });
      expect(parsed.success).toBe(true);
    }
  });

  it("valida y limpia el título editable del análisis", () => {
    const validTitle = UpdateMeetingAnalysisTitleSchema.safeParse({
      title: "  Reunión de Planificación Sprint 4   "
    });
    expect(validTitle.success).toBe(true);
    if (validTitle.success) {
      expect(validTitle.data.title).toBe("Reunión de Planificación Sprint 4");
    }

    const emptyTitle = UpdateMeetingAnalysisTitleSchema.safeParse({
      title: "   "
    });
    expect(emptyTitle.success).toBe(false);
  });
});
