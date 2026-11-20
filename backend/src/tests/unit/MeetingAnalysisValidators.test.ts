import { describe, it, expect } from "vitest";
import path from "node:path";
import { MeetingAnalysisValidators } from "../../infrastructure/analysis/MeetingAnalysisValidators.js";
import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto } from "@audio-to-text/shared";
import { EvaluationRunner } from "../../infrastructure/analysis/evaluation/EvaluationRunner.js";

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
    acceptanceCriteria: ["Responde 200 OK [04:15]", "[Supuesto] Criterio deducido"],
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
    globalOpenQuestions: [
      "[BLOQUEANTE] Ambigüedad de corte [03:00] bloquea BACKEND-1. Si me equivoco: se rehace la lógica de corte"
    ],
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
      repoHoursTotals: { backend: 99, panel: 0, app: 0, total: 99 }
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
    expect(result.errors.some((e) => e.includes("máximo permitido: 8"))).toBe(true);
  });

  it("detecta dudas de vocabulario cuestionando términos del glosario (Regla 2 y Glosario)", () => {
    const dataWithVocabDoubt: GeneratedMeetingData = {
      ...baseValidData,
      globalOpenQuestions: ["No se entiende con certeza el término aislamientos [02:10]"]
    };

    const result = MeetingAnalysisValidators.validate(dataWithVocabDoubt);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("cuestiona el término del glosario"))).toBe(true);
  });

  it("detecta horas fijadas ambiguas sin [Interpretación] (Regla 2)", () => {
    const dataWithFixedTime: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          description: "La jornada inicia entre 06:00 y 19:00"
        }
      ]
    };

    const transcript = "A partir de las 7 se inicia la jornada.";
    const result = MeetingAnalysisValidators.validate(dataWithFixedTime, transcript);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("no aparece literal en la transcripción"))).toBe(true);
  });

  it("detecta preguntas BLOQUEANTE que no nombran issue o carecen de 'si me equivoco' (Regla 3)", () => {
    const dataWithBadBloqueante: GeneratedMeetingData = {
      ...baseValidData,
      globalOpenQuestions: ["[BLOQUEANTE] Ambigüedad en la API de Tri sin nombrar issue ni consecuencia"]
    };

    const result = MeetingAnalysisValidators.validate(dataWithBadBloqueante);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("pregunta BLOQUEANTE"))).toBe(true);
  });

  it("autocorrige degradando preguntas BLOQUEANTE no conformes a NO BLOQUEANTE", () => {
    const unanchoredData: GeneratedMeetingData = {
      ...baseValidData,
      globalOpenQuestions: ["[BLOQUEANTE] Pregunta sobre API de Tri sin anclaje"]
    };

    const cleaned = MeetingAnalysisValidators.sanitizeAndAutocorrect(unanchoredData);
    expect(cleaned.globalOpenQuestions?.[0]).toContain("[NO BLOQUEANTE]");
    expect(cleaned.globalOpenQuestions?.[0]).not.toContain("[BLOQUEANTE]");
  });

  it("detecta issue de app sin evidencia móvil como ERROR (v6 Regla 7)", () => {
    const dataWithInvalidApp: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          id: "APP-1",
          repo: "app",
          title: "Reprogramación en la interfaz",
          description: "Configurar pantalla de reprogramación",
          agentPrompt: baseValidIssue.agentPrompt.replace("Actúa como Principal Backend Developer", "Actúa como Frontend Developer")
        }
      ],
      repoHoursTotals: { backend: 0, panel: 0, app: 4, total: 4 }
    };

    const result = MeetingAnalysisValidators.validate(dataWithInvalidApp);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("carece de evidencia móvil"))).toBe(true);
  });

  it("detecta dependencias con texto libre o formato no permitido (v6)", () => {
    const dataWithTextDep: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          dependencies: ["Depende de validar en el repo..."]
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithTextDep);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Solo se permite \"Ninguna\" o IDs de issues"))).toBe(true);
  });

  it("detecta estimación con paréntesis o texto (v6 Regla 11)", () => {
    const dataWithTextEst: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          estimation: {
            backendHours: "(estimación provisional: issue BLOQUEADO)" as any,
            panelHours: 0,
            appHours: 0,
            totalHours: 4,
            text: "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
          }
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithTextEst);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("texto o paréntesis"))).toBe(true);
  });

  it("detecta frase 'detente' en issue no bloqueado por su propia pregunta bloqueante y lo autocorrige (v6)", () => {
    const dataWithStopPhrase: GeneratedMeetingData = {
      ...baseValidData,
      globalOpenQuestions: [
        "[NO BLOQUEANTE] ¿Alguna duda de parámetros? No bloquea nada."
      ],
      issues: [
        {
          ...baseValidIssue,
          agentPrompt: `${baseValidIssue.agentPrompt}\nSi esta parte no está resuelta, detente, repórtalo en el PR.`
        }
      ]
    };

    const result = MeetingAnalysisValidators.validate(dataWithStopPhrase);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("frase de detención"))).toBe(true);

    const cleaned = MeetingAnalysisValidators.sanitizeAndAutocorrect(dataWithStopPhrase);
    expect(cleaned.issues[0]?.agentPrompt).not.toContain("detente");
  });

  it("detecta pregunta bloqueante inventada sobre roles y la elimina/autocorrige si no se habló de roles (v6)", () => {
    const dataWithRolesQ: GeneratedMeetingData = {
      ...baseValidData,
      globalOpenQuestions: [
        "[BLOQUEANTE] ¿Cuáles son los roles autorizados para reprogramar? Bloquea BACKEND-1. Si me equivoco: se rehace la matriz de permisos"
      ]
    };

    const transcript = "En el minuto [04:15] acordamos crear el endpoint.";
    const result = MeetingAnalysisValidators.validate(dataWithRolesQ, transcript);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("roles/permisos"))).toBe(true);

    const cleaned = MeetingAnalysisValidators.sanitizeAndAutocorrect(dataWithRolesQ, transcript);
    expect(cleaned.globalOpenQuestions?.some((q) => q.includes("roles"))).toBe(false);
  });

  it("detecta decisión que fija hora no literal sin [Interpretación] (v6 Regla 2)", () => {
    const dataWithBadDecision: GeneratedMeetingData = {
      ...baseValidData,
      keyDecisions: ["El corte de turnos es a las 19:00 exactas."]
    };

    const transcript = "En la reunión [02:00] se dijo que el corte es a partir de las 7.";
    const result = MeetingAnalysisValidators.validate(dataWithBadDecision, transcript);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("fija la hora o rango \"19:00\""))).toBe(true);
  });

  it("detecta issue derivado de punto con acción gestion_externa o seguimiento (v6 Regla 6)", () => {
    const dataWithThirdPartyIssue: GeneratedMeetingData = {
      ...baseValidData,
      issues: [
        {
          ...baseValidIssue,
          title: "Diagnóstico de CRM para cubrimientos",
          description: "Revisar por qué el CRM no devuelve el personal requerido en cubrimientos"
        }
      ]
    };

    const extractionPoints = [
      {
        id: "P-CRM",
        cita: "el CRM no devuelve el personal requerido",
        timestamp: "21:48",
        clase: "en_curso" as const,
        accion: "gestion_externa" as const,
        repo: "ninguno" as const,
        tipo: "soporte" as const,
        quien_lo_lleva: null,
        interpretaciones: [],
        valores_ambiguos: [],
        preguntas: []
      }
    ];

    const result = MeetingAnalysisValidators.validate(dataWithThirdPartyIssue, undefined, extractionPoints);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("gestion_externa"))).toBe(true);
  });

  it("carga y evalúa el caso de referencia 2026-11-18_08-04-57 con EvaluationRunner", () => {
    const casesDir = path.resolve(__dirname, "../../infrastructure/analysis/evaluation/cases");
    const evalCase = EvaluationRunner.loadCase(casesDir, "2026-11-18_08-04-57");

    expect(evalCase.caseId).toBe("2026-11-18_08-04-57");
    expect(evalCase.transcript.length).toBeGreaterThan(1000);
    expect(evalCase.expected.expectedIssuesCount).toBe(9);
    expect(evalCase.expected.expectedRepoBreakdown.app).toBe(0);
  });
});
