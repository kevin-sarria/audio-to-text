import { describe, it, expect } from "vitest";
import {
  buildScanSummaryText,
  formatLayoutSpanish
} from "../features/projectFolders/ContextScanReport.js";
import { ProjectContextScanReportDto } from "@audio-to-text/shared";

describe("ContextScanReport frontend helper", () => {
  it("formatLayoutSpanish traduce adecuadamente los tipos de layout", () => {
    expect(formatLayoutSpanish("multi-repo")).toBe("repositorios separados");
    expect(formatLayoutSpanish("monorepo")).toBe("monorepo");
    expect(formatLayoutSpanish("single-repo")).toBe("un solo repositorio");
    expect(formatLayoutSpanish("no-git")).toBe("sin git");
  });

  it("buildScanSummaryText genera la línea de resumen completa con estadísticas", () => {
    const report: ProjectContextScanReportDto = {
      generatedAt: "2026-11-21T10:00:00Z",
      providerLabel: "OpenAI",
      model: "gpt-4o-mini",
      layout: "multi-repo",
      repositories: [
        { path: "frontend-app", name: "frontend-app", headCommit: "abc1234" },
        { path: "backend-api", name: "backend-api", headCommit: "def5678" }
      ],
      readLog: [
        { path: "backend-api/docs/REGLAS.md", status: "sections", sections: 4 }
      ],
      notFullyRead: ["backend-api/docs/REGLAS.md"],
      verification: {
        verified: 15,
        unconfirmed: 2,
        discarded: 3
      },
      discarded: [
        { section: "capas_estructura", dato: "Capa inexistente", fuente: "src/foo", reason: "la carpeta no existe" }
      ],
      openQuestions: ["¿Dónde está el balance contable?"],
      contradictions: 1,
      notFound: ["Roles y permisos"],
      redactions: 4,
      skippedSecretFiles: 2,
      llmCalls: 6
    };

    const text = buildScanSummaryText(report);
    expect(text).toBe(
      "2 repositorio(s) · repositorios separados · 15 datos verificados · 2 sin confirmar · 3 descartados por falta de evidencia · 6 llamadas a la IA"
    );
  });
});
