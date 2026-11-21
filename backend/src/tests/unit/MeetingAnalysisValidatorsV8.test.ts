import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DevIssueDto } from "@audio-to-text/shared";
import { MeetingAnalysisValidators } from "../../infrastructure/analysis/MeetingAnalysisValidators.js";
import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { TranscriptIndex } from "../../infrastructure/analysis/TranscriptIndex.js";
import { ExtractionPointNormalizer } from "../../infrastructure/analysis/ExtractionPointNormalizer.js";
import { ExtractionPointSchema } from "../../infrastructure/analysis/MeetingAnalysisResponseParser.js";
import { MeetingAnalysisPrompts } from "../../infrastructure/analysis/MeetingAnalysisPrompts.js";
import { EvaluationRunner } from "../../infrastructure/analysis/evaluation/EvaluationRunner.js";
import { DIAMANTE_PROFILE } from "../../infrastructure/analysis/profiles/diamanteProfile.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const transcript = fs.readFileSync(
  path.join(here, "../../infrastructure/analysis/evaluation/cases/diamante/2026-11-18_08-04-57/transcript.txt"),
  "utf-8"
);

const prompt = (body: string) => `### Rol y Objetivo
Actúa como Principal Developer.

### Contexto
${body}

### Pasos numerados
1. Leer AI_CONTEXT.md y docs/REGLAS_DE_NEGOCIO.md

### Restricciones
Sin librerías nuevas.

### Criterios de Aceptación
- [ ] Cumple lo pedido.

### Verificación
Pruebas.`;

function issue(partial: Partial<DevIssueDto> & Pick<DevIssueDto, "id" | "repo" | "title">): DevIssueDto {
  const hours = partial.repo === "backend" ? { b: 8, p: 0, a: 0 } : partial.repo === "panel" ? { b: 0, p: 8, a: 0 } : { b: 0, p: 0, a: 8 };
  return {
    type: "feature",
    priority: "medium",
    component: "General",
    description: "",
    estimation: {
      backendHours: hours.b,
      panelHours: hours.p,
      appHours: hours.a,
      totalHours: 8,
      text: ""
    },
    openQuestions: ["Ninguna"],
    dependencies: ["Ninguna"],
    prWorkflow: "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura y revisión de Juan.",
    expectedFiles: ["Controllers/ (verificar en el repo)"],
    acceptanceCriteria: [],
    agentPrompt: prompt(partial.description || ""),
    ...partial
  } as DevIssueDto;
}

function analysis(issues: DevIssueDto[], extra: Partial<GeneratedMeetingData> = {}): GeneratedMeetingData {
  const totals = { backend: 0, panel: 0, app: 0, total: 0 };
  for (const i of issues) {
    totals.backend += i.estimation?.backendHours ?? 0;
    totals.panel += i.estimation?.panelHours ?? 0;
    totals.app += i.estimation?.appHours ?? 0;
  }
  totals.total = totals.backend + totals.panel + totals.app;
  return {
    summary: "Análisis parcial: faltan [01:09–04:02]. Reunión de revisión de la matriz de hallazgos.",
    alreadyResolved: [],
    inProgress: [],
    keyDecisions: [],
    topicsDiscussed: [],
    globalOpenQuestions: [],
    issues,
    backlog: [],
    repoHoursTotals: totals,
    ...extra
  };
}

const goodBackend = issue({
  id: "BACKEND-1",
  repo: "backend",
  title: "[Backend] Endpoint de exportación a Excel de solicitudes",
  description: "Exportar al Excel las solicitudes con filtros por periodos de tiempo [31:50]."
});

describe("TranscriptIndex (v8)", () => {
  const index = new TranscriptIndex(transcript);

  it("acepta marcas que caen dentro de un segmento real y rechaza las inventadas", () => {
    expect(index.timestampExists(29 * 60 + 19)).toBe(true); // [29:19] exacta
    expect(index.timestampExists(29 * 60 + 25)).toBe(true); // dentro del segmento 29:19–29:37
    expect(index.timestampExists(2 * 60 + 30)).toBe(false); // hueco 01:09–04:02, sin diálogo
    expect(index.timestampExists(99 * 60)).toBe(false);
  });

  it("no confunde [1:23] con [11:23] (antes se usaba transcript.includes)", () => {
    const tiny = new TranscriptIndex("[11:23] Hablante 1: hola");
    expect(tiny.timestampExists(60 + 23)).toBe(false);
  });

  it("detecta el cierre posterior de aislamientos ([29:37] y [32:58])", () => {
    const topics = index.findLaterClosures().map((c) => c.topic);
    expect(topics).toContain("aislamiento");
  });
});

describe("ExtractionPointNormalizer (v8, antes de la etapa 2)", () => {
  const point = (raw: Record<string, unknown>) => ExtractionPointSchema.parse(raw);

  it("reclasifica aislamientos como cerrado y elimina su pregunta de ambigüedad", () => {
    const { points } = ExtractionPointNormalizer.normalize(
      [
        point({
          id: "P1",
          cita: "lo del campo de los aislamientos en los llamados por ubicación no deben de ser obligatorios",
          timestamp: "29:19",
          clase: "nuevo",
          accion: "codigo",
          repo: "panel",
          preguntas: [{ texto: "¿Qué significa aislamientos?", bloqueante: true, si_me_equivoco: "se rehace" }]
        })
      ],
      transcript
    );
    expect(points[0]?.clase).toBe("cerrado");
    expect(points[0]?.preguntas).toHaveLength(0);
  });

  it("convierte los usuarios pendientes de Lady y el CRM en gestión externa", () => {
    const { points } = ExtractionPointNormalizer.normalize(
      [
        point({ id: "P2", cita: "digámosle a Lady que nos traiga los activos y los pendientes", timestamp: "27:17", clase: "nuevo", accion: "codigo", repo: "backend" }),
        point({ id: "P3", cita: "el CRM no devuelve el personal requerido", timestamp: "21:48", clase: "nuevo", accion: "codigo", repo: "backend" })
      ],
      transcript
    );
    expect(points.map((p) => p.accion)).toEqual(["gestion_externa", "gestion_externa"]);
    expect(points.every((p) => p.clase !== "nuevo")).toBe(true);
  });

  it("anula responsables no nombrados (Alexis) y 'Hablante N'", () => {
    const { points } = ExtractionPointNormalizer.normalize(
      [
        point({ id: "P4", cita: "Configuración y personalización del dashboard", timestamp: "06:38", clase: "nuevo", accion: "codigo", repo: "panel", quien_lo_lleva: "Alexis" }),
        point({ id: "P5", cita: "turnos", timestamp: "16:01", clase: "en_curso", accion: "seguimiento", repo: "backend", quien_lo_lleva: "Hablante 2" })
      ],
      transcript
    );
    expect(points.map((p) => p.quien_lo_lleva)).toEqual([null, null]);
  });

  it("no acepta la frase móvil de la fila anterior ([30:23]) como evidencia de app para reprogramación", () => {
    const { points } = ExtractionPointNormalizer.normalize(
      [point({ id: "P6", cita: "reprogramar actividades de las rutinas", timestamp: "30:29", clase: "nuevo", accion: "codigo", repo: "app" })],
      transcript
    );
    expect(points[0]?.repo).toBe("panel");
  });

  it("degrada a NO BLOQUEANTE una pregunta sin 'si me equivoco'", () => {
    const { points } = ExtractionPointNormalizer.normalize(
      [point({ id: "P7", cita: "dimensionamiento con rendimiento", timestamp: "09:21", clase: "nuevo", accion: "codigo", repo: "backend", preguntas: [{ texto: "¿unidad?", bloqueante: true }] })],
      transcript
    );
    expect(points[0]?.preguntas[0]?.bloqueante).toBe(false);
  });
});

describe("MeetingAnalysisValidators v8 sobre la transcripción de referencia", () => {
  it("una salida limpia no produce errores v8", () => {
    const result = MeetingAnalysisValidators.validate(analysis([goodBackend]), transcript);
    const v8 = result.errors.filter((e) => e.includes("Regla A5") || e.includes("Regla 22"));
    expect(v8).toEqual([]);
  });

  it("rechaza issue y pregunta sobre aislamientos (cerrado más adelante)", () => {
    const data = analysis(
      [goodBackend, issue({ id: "PANEL-1", repo: "panel", title: "[Panel] Aislamientos opcionales", description: "Campo de aislamientos opcional [29:19]." })],
      { globalOpenQuestions: ["[BLOQUEANTE] El término aislamientos es ambiguo"] }
    );
    const result = MeetingAnalysisValidators.validate(data, transcript);
    expect(result.errors.filter((e) => e.includes("Regla A5")).length).toBeGreaterThanOrEqual(2);
  });

  it("rechaza a Alexis como responsable y un responsable que no aparece en el segmento", () => {
    const data = analysis([goodBackend], {
      inProgress: ["Dashboard diario, responsable: Alexis [06:38]", "Formularios, a cargo de Valeria [12:17]"]
    });
    const result = MeetingAnalysisValidators.validate(data, transcript);
    expect(result.errors.some((e) => e.includes("Alexis") && e.includes("usuario de QA"))).toBe(true);
    expect(result.errors.some((e) => e.includes("Valeria") && e.includes("segmento citado"))).toBe(true);
  });

  it("rechaza preguntas sobre roles/límites y citar REGLAS_DE_NEGOCIO como fuente", () => {
    const data = analysis([goodBackend], {
      globalOpenQuestions: ["[NO BLOQUEANTE] ¿Qué roles pueden reprogramar y cuál es el límite de registros a borrar?"],
      keyDecisions: ["Según docs/REGLAS_DE_NEGOCIO.md la reprogramación ya existe"]
    });
    const result = MeetingAnalysisValidators.validate(data, transcript);
    expect(result.errors.some((e) => e.includes("roles"))).toBe(true);
    expect(result.errors.some((e) => e.includes("límites"))).toBe(true);
    expect(result.errors.some((e) => e.includes("REGLAS_DE_NEGOCIO"))).toBe(true);
  });

  it("rechaza issue de app de reprogramación sin frase de app y /api/mobile sin issue de app", () => {
    const appIssue = issue({ id: "APP-1", repo: "app", title: "[App] Mostrar actividades reprogramadas", description: "Reprogramar actividades de las rutinas [30:29]." });
    const withApp = MeetingAnalysisValidators.validate(analysis([goodBackend, appIssue]), transcript);
    expect(withApp.errors.some((e) => e.includes("[APP-1]") && e.includes("carece de evidencia móvil"))).toBe(true);
    expect(withApp.errors.some((e) => e.includes("[APP-1]") && e.includes("reprogram"))).toBe(true);

    const mobileEndpoint = issue({ id: "BACKEND-2", repo: "backend", title: "[Backend] Reprogramación", description: "Exponer /api/mobile/reprogramacion [30:29]." });
    const noApp = MeetingAnalysisValidators.validate(analysis([goodBackend, mobileEndpoint]), transcript);
    expect(noApp.errors.some((e) => e.includes("/api/mobile"))).toBe(true);
  });

  it("rechaza pantalla de dimensionamiento en el panel mientras el alcance esté pendiente", () => {
    const panelDim = issue({ id: "PANEL-1", repo: "panel", title: "[Panel] Pantalla de carga de la matriz de dimensionamiento", description: "Cargar matriz [09:21]." });
    const result = MeetingAnalysisValidators.validate(analysis([goodBackend, panelDim]), transcript);
    expect(result.errors.some((e) => e.includes("[PANEL-1]") && e.includes("PENDIENTE"))).toBe(true);
  });

  it("rechaza una pregunta BLOQUEANTE que nombra un issue inexistente", () => {
    const data = analysis([goodBackend], {
      globalOpenQuestions: ["[BLOQUEANTE] ¿Unidad del rendimiento? Bloquea BACKEND-9. Si me equivoco: se rehace el cálculo."]
    });
    const result = MeetingAnalysisValidators.validate(data, transcript);
    expect(result.errors.some((e) => e.includes("BACKEND-9") && e.includes("no existe"))).toBe(true);
  });

  it("el saneamiento elimina preguntas de roles y de temas cerrados y degrada BLOQUEANTE sin issue existente", () => {
    const data = analysis([goodBackend], {
      globalOpenQuestions: [
        "[NO BLOQUEANTE] ¿Qué roles autorizan la reprogramación?",
        "[BLOQUEANTE] ¿Aislamientos aplica a todas las ubicaciones? Bloquea PANEL-1. Si me equivoco: se rehace el formulario.",
        "[BLOQUEANTE] ¿Unidad del rendimiento? Bloquea BACKEND-9. Si me equivoco: se rehace el cálculo.",
        "[NO BLOQUEANTE] Corte diurno/nocturno: \"a partir de las 7\" ¿a.m. o p.m.?"
      ]
    });
    const sanitized = MeetingAnalysisValidators.sanitizeAndAutocorrect(data, transcript);
    expect(sanitized.globalOpenQuestions).toHaveLength(2);
    expect(sanitized.globalOpenQuestions?.[0]).toContain("[NO BLOQUEANTE] ¿Unidad del rendimiento?");
  });

  it("no avisa por ERP (corrección del glosario) pero sí por una sigla ajena", () => {
    const erp = MeetingAnalysisValidators.validate(analysis([goodBackend], { summary: "Análisis parcial: faltan [01:09–04:02]. Integración con el ERP." }), transcript);
    expect(erp.warnings.some((w) => w.includes('"ERP"'))).toBe(false);
    const sap = MeetingAnalysisValidators.validate(analysis([goodBackend], { summary: "Análisis parcial: faltan [01:09–04:02]. Integración con SAP." }), transcript);
    expect(sap.warnings.some((w) => w.includes('"SAP"'))).toBe(true);
  });
});

describe("Prompt desplegado (v10: Parte A + perfil DIAMANTE)", () => {
  const step1 = MeetingAnalysisPrompts.buildStep1Prompt(undefined, DIAMANTE_PROFILE);
  const step2 = MeetingAnalysisPrompts.buildStep2Prompt(undefined, DIAMANTE_PROFILE);
  const single = MeetingAnalysisPrompts.buildSingleStepPrompt(undefined, DIAMANTE_PROFILE);

  it("contiene las reglas A1–A15 y el glosario con Alexis no responsable y Lady externa en las tres variantes", () => {
    for (const p of [step1, step2, single]) {
      for (let n = 1; n <= 15; n++) expect(p).toContain(`== A${n}. `);
      expect(p).toContain("Alexis (usuario de QA, no responsable)");
      expect(p).toContain("Lady (fuente de usuarios; externa)");
      expect(p).toContain("aislamientos");
      expect(p).toContain("== B4. DECISIÓN PENDIENTE");
    }
    expect(step1).toContain('"cierre"');
  });
});

describe("EvaluationRunner con el caso de referencia (v8)", () => {
  const casesDir = path.join(here, "../../infrastructure/analysis/evaluation/cases");

  const golden = (): GeneratedMeetingData => {
    const mk = (id: string, repo: "backend" | "panel", title: string, description: string, h: number) =>
      issue({
        id,
        repo,
        title,
        description,
        estimation: {
          backendHours: repo === "backend" ? h : 0,
          panelHours: repo === "panel" ? h : 0,
          appHours: 0,
          totalHours: h,
          text: ""
        }
      });
    return analysis(
      [
        mk("BACKEND-1", "backend", "[Backend] Dimensionamiento con la columna de rendimiento", "Inyectar la matriz con rendimiento en dimensionamiento [09:21].", 8),
        mk("BACKEND-2", "backend", "[Backend] Endpoint de reprogramación", "Reprogramar actividades de las rutinas [30:29].", 8),
        mk("BACKEND-3", "backend", "[Backend] Endpoint de borrado masivo de ubicaciones", "Eliminar múltiples registros [31:24].", 8),
        mk("BACKEND-4", "backend", "[Backend] Endpoint de exportación a Excel", "Exportar al Excel las solicitudes [31:50].", 8),
        mk("PANEL-1", "panel", "[Panel] Renombrar asignación automática en llamados", "Cambiar el nombre [29:06].", 2),
        mk("PANEL-2", "panel", "[Panel] Selects con búsqueda", "Que se vaya filtrando [30:09].", 4),
        mk("PANEL-3", "panel", "[Panel] Reprogramación de actividades", "Botón para reprogramar [30:29].", 8),
        mk("PANEL-4", "panel", "[Panel] Selección múltiple y borrado masivo", "Selección múltiple [31:24].", 8),
        mk("PANEL-5", "panel", "[Panel] Botón de exportación", "Exportar con filtros [31:50].", 4)
      ],
      {
        alreadyResolved: ["Aislamientos opcional sin NA [29:19]"],
        inProgress: [
          "Tres ítems por validar [05:27]",
          "Observación de Juan Esteban [06:23]",
          "Formularios, Juan Esteban [12:17]",
          "Agrupación diurno/nocturno y turnos, Cristian [16:05, 22:07]",
          "CRM no devuelve el personal requerido, Cubrimientos Cali (gestión externa) [17:45]",
          "Actualización de QA según producción [24:35]"
        ],
        keyDecisions: [
          "Turnos solo diurno y nocturno [22:23]",
          "Rutinas asociadas a Oficina Regional Cali, no a Cubrimientos Cali [20:36]",
          "Estados de novedad solo para novedades del servicio [30:58]",
          "\"máquina descripción\" es la misma matriz con una columna nueva [09:33]"
        ],
        globalOpenQuestions: ['[NO BLOQUEANTE] Corte diurno/nocturno ("a partir de las 7": ¿a.m. o p.m.?)'],
        backlog: ["Logueo automático NFC/QR [29:43]", "Planes de acción y adjuntos en novedades [34:00]", "QR externo para llamados e insumos [42:56]"]
      }
    );
  };

  it("una salida igual al resultado esperado pasa todas las verificaciones", () => {
    const evalCase = EvaluationRunner.loadCase(casesDir, "diamante/2026-11-18_08-04-57");
    const report = EvaluationRunner.evaluate(evalCase, golden());
    expect(report.details).toEqual([]);
    expect(report.validation.errors).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("una salida tipo Gemini v8 (aislamientos bloqueante, Alexis responsable, pregunta de roles) no pasa", () => {
    const evalCase = EvaluationRunner.loadCase(casesDir, "diamante/2026-11-18_08-04-57");
    const bad = golden();
    bad.globalOpenQuestions = ["[BLOQUEANTE] ¿Qué roles pueden borrar y aislamientos es obligatorio? Bloquea PANEL-4. Si me equivoco: se rehace."];
    bad.inProgress = ["Dashboard, responsable: Alexis [06:38]"];
    const report = EvaluationRunner.evaluate(evalCase, bad);
    expect(report.passed).toBe(false);
    expect(report.checks.noForbiddenQuestionTopics).toBe(false);
    expect(report.checks.noForbiddenResponsibles).toBe(false);
  });
});
