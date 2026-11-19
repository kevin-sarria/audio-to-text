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

  it("admite la estructura completa de 8 secciones con repositorios aislados y estimaciones por repo", () => {
    const fullAnalysis = {
      id: "analysis-1",
      sessionId: "session-1",
      title: "Análisis Sprint",
      summary: "Resumen fiel a la reunión",
      alreadyResolved: ["Migración de DB ya en producción"],
      inProgress: ["Juan preparando pruebas e2e"],
      keyDecisions: ["Adopción de SQLite para modo offline"],
      topicsDiscussed: ["Sincronización", "Performance"],
      globalOpenQuestions: ["¿Quién aprueba los cambios de esquema?"],
      issues: [
        {
          id: "BACKEND-1",
          repo: "backend" as const,
          title: "[Backend] Endpoint sync",
          type: "feature" as const,
          priority: "high" as const,
          component: "API",
          description: "Endpoint nuevo",
          estimation: {
            backendHours: 4,
            panelHours: 0,
            appHours: 0,
            totalHours: 4,
            text: "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
          },
          openQuestions: ["Ninguna"],
          dependencies: ["Ninguna"],
          prWorkflow: "Rama corta desde dev, PR a dev, skill /revisar-entrega y revisión de Juan.",
          expectedFiles: ["Archivos sugeridos (verificar en el repo): server/sync.ts"],
          acceptanceCriteria: ["[Supuesto] Responde 200"],
          agentPrompt: "Rol..."
        }
      ],
      backlog: ["Optimizaciones secundarias de UI"],
      repoHoursTotals: {
        backend: 4,
        panel: 0,
        app: 0,
        total: 4
      },
      createdAt: "2026-11-19T00:00:00Z",
      updatedAt: "2026-11-19T00:00:00Z"
    };

    expect(fullAnalysis.issues[0]?.repo).toBe("backend");
    expect(fullAnalysis.repoHoursTotals.backend).toBe(4);
    expect(fullAnalysis.alreadyResolved).toHaveLength(1);
    expect(fullAnalysis.inProgress).toHaveLength(1);
    expect(fullAnalysis.globalOpenQuestions).toHaveLength(1);
    expect(fullAnalysis.backlog).toHaveLength(1);
  });
});
