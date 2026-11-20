import { describe, it, expect } from "vitest";
import { MeetingAnalysisValidators } from "../../infrastructure/analysis/MeetingAnalysisValidators.js";
import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto } from "@audio-to-text/shared";

describe("MeetingAnalysisValidators - Validadores Deterministas en Código", () => {
  const baseValidIssue: DevIssueDto = {
    id: "BACKEND-1",
    repo: "backend",
    title: "[Backend] Endpoint de marcas",
    type: "feature",
    priority: "high",
    component: "Controllers",
    description: "Crear endpoint según [04:15]",
    estimation: {
      backendHours: 4,
      panelHours: 0,
      appHours: 0,
      totalHours: 4,
      text: "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
    },
    openQuestions: ["Ninguna"],
    dependencies: ["Ninguna"],
    prWorkflow: "Rama corta desde dev, PR a dev, skill /revisar-entrega",
    expectedFiles: ["Controllers/ (verificar en el repo)", "AI_CONTEXT.md", "docs/REGLAS_DE_NEGOCIO.md"],
    acceptanceCriteria: ["Responde 200 OK [04:15]"],
    agentPrompt: `### Rol y Objetivo
Actúa como Principal Backend Developer.

### Contexto
Implementar según reunión [04:15].

### Pasos numerados
1. Leer AI_CONTEXT.md y docs/REGLAS_DE_NEGOCIO.md
2. Desarrollar endpoint.

### Restricciones
No usar librerías externas no listadas.

### Criterios de Aceptación
- [ ] Retorna 200 OK.

### Verificación
xUnit.`
  };

  const baseValidData: GeneratedMeetingData = {
    summary: "Reunión de coordinación técnica.",
    alreadyResolved: ["Despliegue [01:00]"],
    inProgress: ["Cristian [02:00]"],
    keyDecisions: ["Usar .NET 8"],
    topicsDiscussed: ["Backend"],
    globalOpenQuestions: ["[BLOQUEANTE] Ambigüedad de corte [03:00]"],
    issues: [baseValidIssue],
    backlog: ["Mejora de logs"],
    repoHoursTotals: { backend: 4, panel: 0, app: 0, total: 4 }
  };

  it("aprueba un análisis 100% conformado", () => {
    const transcript = "En el minuto [04:15] acordamos crear el endpoint.";
    const result = MeetingAnalysisValidators.validate(baseValidData, transcript);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detecta filtraciones de mecánicas internas (Paso 1, Paso 2, análisis previo)", () => {
    const dataWithLeak: GeneratedMeetingData = {
      ...baseValidData,
      summary: "Según el Paso 1, se acordó la migración.",
      issues: [
        {
          ...baseValidIssue,
          agentPrompt: baseValidIssue.agentPrompt.replace("Contexto", "Contexto del Paso 2 según la lista extraída")
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithLeak);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("etapas internas"))).toBe(true);
    expect(result.errors.some((e) => e.includes("filtra mecánicas internas"))).toBe(true);
  });

  it("detecta nombres de documentos no permitidos o con errores tipográficos (ej. BITORACA.md)", () => {
    const dataWithInvalidDoc: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          expectedFiles: ["BITORACA.md", "README_INVENTADO.md"]
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithInvalidDoc);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("BITORACA.md"))).toBe(true);
  });

  it("detecta tecnologías o namespaces prohibidos (Diamante.API, FluentValidation, TanStack)", () => {
    const dataWithForbidden: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          title: "Implementar Diamante.API con FluentValidation",
          description: "Usar TanStack Query para el consumo"
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithForbidden);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Diamante.API"))).toBe(true);
    expect(result.errors.some((e) => e.includes("TanStack"))).toBe(true);
    expect(result.errors.some((e) => e.includes("FluentValidation"))).toBe(true);
  });

  it("detecta descuadres aritméticos entre los issues y repoHoursTotals", () => {
    const dataWithBadSum: GeneratedMeetingData = {
      ...baseValidData,
      repoHoursTotals: { backend: 99, panel: 0, app: 0, total: 99 } // real es 4
    };

    const result = MeetingAnalysisValidators.validate(dataWithBadSum);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Descuadre aritmético"))).toBe(true);
  });

  it("detecta dependencias que apuntan a issues inexistentes", () => {
    const dataWithBrokenDep: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          dependencies: ["Depende de ISSUE-999"]
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithBrokenDep);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("ISSUE-999"))).toBe(true);
  });

  it("detecta marcas de tiempo inventadas que no existen en la transcripción", () => {
    const dataWithFakeTs: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          title: "Requerimiento en [99:45]"
        }
      ]
    };

    const transcript = "Reunión corta de 10 minutos [01:00] hasta [10:00]";
    const result = MeetingAnalysisValidators.validate(dataWithFakeTs, transcript);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("[99:45]"))).toBe(true);
  });

  it("detecta más de 8 preguntas globales abiertas", () => {
    const dataWithTooManyQuestions: GeneratedMeetingData = {
      ...baseValidData,
      globalOpenQuestions: [
        "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9"
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithTooManyQuestions);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("9 preguntas globales"))).toBe(true);
  });

  it("detecta dudas de vocabulario formuladas indebidamente como preguntas globales (Regla P)", () => {
    const dataWithVocabDoubt: GeneratedMeetingData = {
      ...baseValidData,
      globalOpenQuestions: ["Duda de vocabulario: se escuchó 'Lexus' o 'Alexis' [02:10]?"]
    };

    const result = MeetingAnalysisValidators.validate(dataWithVocabDoubt);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Regla P") && e.includes("dudas de vocabulario"))).toBe(true);
  });

  it("detecta cambios de nombre redundantes o inválidos donde origen y destino son idénticos (Regla Q)", () => {
    const dataWithRedundantRename: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          title: "Renombrar campo usuario → usuario",
          description: "Cambiar nombre actual usuario → usuario"
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithRedundantRename);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Regla Q") && e.includes("origen y destino idénticos"))).toBe(true);
  });

  it("emite avisos de calidad para dependencias de terceros (Regla R) y frases sueltas (Regla S)", () => {
    const dataWithWarnings: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          id: "BACKEND-2",
          title: "[Backend] Bloqueado por configuración externa",
          description: "Depende de que el cliente cambie la base externa",
          openQuestions: ["esto está validado"]
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithWarnings);
    expect(result.warnings.some((w) => w.includes("Regla R"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Regla S"))).toBe(true);
  });

  it("autocorrige typos comunes (BITORACA.md -> BITACORA.md) y recalcula la suma aritmética", () => {
    const dirtyData: GeneratedMeetingData = {
      ...baseValidData,
      summary: "el Paso 1 indica que todo está listo.",
      issues: [
        {
          ...baseValidIssue,
          expectedFiles: ["BITORACA.md"],
          agentPrompt: "el Paso 1 indica leer BITORACA.md"
        }
      ],
      repoHoursTotals: { backend: 999, panel: 999, app: 999, total: 9999 }
    };

    const cleaned = MeetingAnalysisValidators.sanitizeAndAutocorrect(dirtyData);
    expect(cleaned.summary).not.toContain("el Paso 1 indica");
    expect(cleaned.issues[0]?.expectedFiles).toContain("BITACORA.md");
    expect(cleaned.issues[0]?.expectedFiles).not.toContain("BITORACA.md");
    expect(cleaned.issues[0]?.agentPrompt).toContain("BITACORA.md");
    expect(cleaned.repoHoursTotals?.backend).toBe(4);
    expect(cleaned.repoHoursTotals?.total).toBe(4);
  });
});
