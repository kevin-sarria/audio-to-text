import { describe, it, expect } from "vitest";
import { MeetingAnalysisValidators } from "../../infrastructure/analysis/MeetingAnalysisValidators.js";
import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto } from "@audio-to-text/shared";

describe("MeetingAnalysisValidators - Reglas y Validadores de Cobertura v7", () => {
  const baseValidIssue: DevIssueDto = {
    id: "BACKEND-1",
    repo: "backend",
    title: "[Backend] Endpoint de marcas",
    type: "feature",
    priority: "high",
    component: "Controllers",
    description: "Crear endpoint según [01:15]",
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
    acceptanceCriteria: ["Responde 200 OK [01:15]"],
    agentPrompt: `### Rol y Objetivo
Actúa como Principal Backend Developer.

### Contexto
Implementar según reunión [01:15].

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
    alreadyResolved: ["Despliegue [00:30]"],
    inProgress: ["Cristian [01:00]"],
    keyDecisions: ["Usar .NET 8"],
    topicsDiscussed: ["Backend"],
    globalOpenQuestions: [],
    issues: [baseValidIssue],
    backlog: ["Mejora de logs"],
    repoHoursTotals: { backend: 4, panel: 0, app: 0, total: 4 }
  };

  const transcriptWithGaps = `[00:00] Hablante 1: Inicio de la reunión.
[00:45] Hablante 1: Revisando pendientes iniciales.
[01:15] Hablante 1: Definimos el endpoint de marcas.
[01:50] Hablante 2: De acuerdo.
[02:30] Hablante 1: Ajustar antes de la pausa.
[02:45] Hablante 2: Ajustar estados antes de cortar [02:45].
[03:00] [Audio no disponible en este tramo por congestión temporal de servidores: 03:00–06:00]
[06:05] Hablante 2: Retomamos tras la interrupción.
[06:45] Hablante 1: Seguimos con las pruebas.
[07:30] Hablante 2: Revisión de panel.
[08:15] Hablante 1: Cierre técnico.
[09:00] Hablante 2: Todo preparado.
[10:00] Hablante 1: Fin.`;

  it("exige el encabezado 'Análisis parcial' si hay tramos sin audio en la transcripción (v7 Regla 20)", () => {
    const result = MeetingAnalysisValidators.validate(baseValidData, transcriptWithGaps);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Análisis parcial"))).toBe(true);

    const dataWithPartialNotice: GeneratedMeetingData = {
      ...baseValidData,
      summary: "Análisis parcial: faltan [03:00–06:00] (30% de la reunión sin audio). Reunión técnica."
    };
    const validResult = MeetingAnalysisValidators.validate(dataWithPartialNotice, transcriptWithGaps);
    expect(validResult.errors.some((e) => e.includes("Análisis parcial"))).toBe(false);
  });

  it("bloquea la generación de issues si la cobertura es menor al 90% (v7)", () => {
    // Transcripción con 40% de hueco (03:00-06:00, 15:00-18:00, 24:00-27:00, 30:00-39:00 de 45m)
    const transcriptSevereGap = `[00:00] Hablante 1: Inicio.
[03:00] [Audio no disponible en este tramo por congestión temporal de servidores: 03:00–06:00]
[15:00] [Audio no disponible en este tramo por congestión temporal de servidores: 15:00–18:00]
[24:00] [Audio no disponible en este tramo por congestión temporal de servidores: 24:00–27:00]
[30:00] [Audio no disponible en este tramo por congestión temporal de servidores: 30:00–39:00]
[45:00] Hablante 1: Fin.`;

    const dataWithPartialNotice: GeneratedMeetingData = {
      ...baseValidData,
      summary: "Análisis parcial: faltan [03:00–06:00, 15:00–18:00, 24:00–27:00, 30:00–39:00] (40% de la reunión sin audio)."
    };

    const result = MeetingAnalysisValidators.validate(dataWithPartialNotice, transcriptSevereGap);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Cobertura de audio insuficiente"))).toBe(true);
  });

  it("detecta marcas de tiempo citadas que caen dentro de un tramo sin audio (v7)", () => {
    const dataWithInsideCitation: GeneratedMeetingData = {
      ...baseValidData,
      summary: "Análisis parcial: faltan [03:00–06:00] (30% de la reunión sin audio).",
      issues: [
        {
          ...baseValidIssue,
          description: "Requerimiento discutido en [04:30]"
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithInsideCitation, transcriptWithGaps);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("cae dentro del tramo sin audio [03:00–06:00]"))).toBe(true);
  });

  it("emite aviso si una decisión o cierre cita a menos de 30s del inicio de un tramo sin audio (v7)", () => {
    const dataWithNearGapCitation: GeneratedMeetingData = {
      ...baseValidData,
      summary: "Análisis parcial: faltan [03:00–06:00] (30% de la reunión sin audio).",
      keyDecisions: ["Ajustar estados antes de cortar [02:45]"]
    };

    const result = MeetingAnalysisValidators.validate(dataWithNearGapCitation, transcriptWithGaps);
    expect(result.warnings.some((w) => w.includes("a menos de 30 s antes del tramo sin audio"))).toBe(true);
  });

  it("rechaza issues con repo 'otro', 0 horas o clasificados como backlog (v7)", () => {
    const dataWithBacklogIssue: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          id: "BACKLOG-1",
          repo: "otro" as any,
          title: "[Backlog] Logueo automático NFC/QR",
          priority: "backlog" as any,
          estimation: {
            backendHours: 0,
            panelHours: 0,
            appHours: 0,
            totalHours: 0,
            text: "Total: 0h"
          }
        }
      ],
      repoHoursTotals: { backend: 0, panel: 0, app: 0, total: 0 }
    };

    const result = MeetingAnalysisValidators.validate(dataWithBacklogIssue);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("clasificado como backlog, con 0 horas o repo no permitido"))).toBe(true);
  });

  it("rechaza si se usa 'Hablante N' como persona responsable (v7)", () => {
    const dataWithSpeakerResponsibility: GeneratedMeetingData = {
      ...baseValidData,
      inProgress: ["Hablante 2 liderando el módulo de novedades"]
    };

    const result = MeetingAnalysisValidators.validate(dataWithSpeakerResponsibility);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("usa \"Hablante 2\" como persona responsable"))).toBe(true);
  });

  it("autocorrige anteponiendo 'Análisis parcial', moviendo issues de backlog a backlog y saneando 'Hablante N' (v7)", () => {
    const transcriptMildGap = `[00:00] Hablante 1: Inicio.
[00:30] Hablante 1: Punto A.
[01:00] Hablante 2: Punto B.
[01:30] Hablante 1: Punto C.
[02:00] Hablante 2: Punto D.
[02:30] Hablante 1: Previo a corte.
[03:00] [Audio no disponible en este tramo por congestión temporal de servidores: 03:00–04:00]
[04:05] Hablante 1: Reanudamos.
[05:00] Hablante 2: Punto E.
[06:00] Hablante 1: Punto F.
[07:00] Hablante 2: Punto G.
[08:00] Hablante 1: Punto H.
[09:00] Hablante 2: Punto I.
[10:00] Hablante 1: Punto J.
[11:00] Hablante 2: Fin.`;

    const dataToClean: GeneratedMeetingData = {
      ...baseValidData,
      summary: "Reunión técnica normal.",
      inProgress: ["Hablante 1 a cargo de formularios"],
      issues: [
        baseValidIssue,
        {
          ...baseValidIssue,
          id: "BACKLOG-1",
          repo: "otro" as any,
          title: "[Backlog] QR externo",
          priority: "backlog" as any,
          estimation: {
            backendHours: 0,
            panelHours: 0,
            appHours: 0,
            totalHours: 0,
            text: "Total: 0h"
          }
        }
      ]
    };

    const cleaned = MeetingAnalysisValidators.sanitizeAndAutocorrect(dataToClean, transcriptMildGap);
    expect(cleaned.summary).toContain("Análisis parcial: faltan [03:00–04:00]");
    expect(cleaned.inProgress?.[0]).toContain("sin identificar");
    expect(cleaned.issues).toHaveLength(1);
    expect(cleaned.issues[0]?.id).toBe("BACKEND-1");
    expect(cleaned.backlog?.some((b) => b.includes("QR externo"))).toBe(true);
  });
});
