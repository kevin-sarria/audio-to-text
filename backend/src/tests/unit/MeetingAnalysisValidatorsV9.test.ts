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
import { detectMatrixItems } from "../../infrastructure/analysis/validators/MeetingAnalysisV9Validators.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const transcript = fs.readFileSync(
  path.join(here, "../../infrastructure/analysis/evaluation/cases/2026-11-18_08-04-57/transcript.txt"),
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
  const hours =
    partial.repo === "backend" ? { b: 8, p: 0, a: 0 } : partial.repo === "panel" ? { b: 0, p: 8, a: 0 } : { b: 0, p: 0, a: 8 };
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
    expectedFiles: ["Controllers/ (verificar en el repo)", "docs/REGLAS_DE_NEGOCIO.md"],
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

const buildGoodOutput = (): GeneratedMeetingData => {
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
      mk("BACKEND-2", "backend", "[Backend] Endpoint de reprogramación (PROPUESTO)", "Reprogramar actividades de las rutinas [30:29].", 8),
      mk("BACKEND-3", "backend", "[Backend] Endpoint de borrado masivo de ubicaciones (PROPUESTO)", "Eliminar múltiples registros [31:24].", 8),
      mk("BACKEND-4", "backend", "[Backend] Endpoint de exportación a Excel (PROPUESTO)", "Exportar al Excel las solicitudes [31:50].", 8),
      mk("PANEL-1", "panel", "[Panel] Renombrar asignación automática (nombre nuevo por definir)", "Cambiar el nombre a asignación automática en llamados [29:06].", 2),
      mk("PANEL-2", "panel", "[Panel] Selects con búsqueda", "Que se vaya filtrando [30:09].", 4),
      mk("PANEL-3", "panel", "[Panel] Reprogramación de actividades", "Botón para reprogramar actividades de las rutinas [30:29].", 8),
      mk("PANEL-4", "panel", "[Panel] Selección múltiple y borrado masivo", "Selección múltiple y eliminar [31:24].", 8),
      mk("PANEL-5", "panel", "[Panel] Botón de exportación", "Exportar con filtros al Excel [31:50].", 4)
    ],
    {
      alreadyResolved: [
        "Web y móvil responsive [05:44]",
        "Dashboard diario y parametrización en reportes [06:25]",
        "Parámetros por sector con licitaciones [07:04]",
        "Filtro en cascada de llamados, ya implementado y pendiente de pasar a Validar Diamante [27:36]",
        "Aislamientos opcional sin NA [29:19]; cierre posterior [32:58]"
      ],
      inProgress: [
        "Tres ítems por validar [05:28]",
        "Observación que cierra Juan Esteban [06:12]",
        "Metas e indicadores por cliente, Cristian [10:05]",
        "Certificaciones con Diego Meléndez (gestión externa) [11:08]",
        "Módulo de formularios, Juan Esteban [12:17]",
        "Agrupación diurno/nocturno y turnos, Cristian [16:05, 22:07]",
        "CRM no devuelve el personal requerido para el centro de costo de cubrimientos (gestión externa, [21:48])",
        "Bug del método de inicio QR en la app, Hospital San Vicente Fundación [23:33]",
        "Actualización de QA según producción [24:35]",
        "Usuarios pendientes: pedirle a Lady que envíe activos y pendientes (gestión externa) [27:17]",
        "Estados de novedad, ya van en la PR [34:10]"
      ],
      keyDecisions: [
        "Estados de novedad solo para novedades del servicio y no a insumos [31:06]",
        "Turnos solo diurno y nocturno, mixtos a diurnos, hora del corte parametrizable [22:23]",
        "La matriz de maquinaria es el mismo archivo con una columna nueva [09:33]",
        "Se pide a Lady activos y pendientes [27:17]"
      ],
      globalOpenQuestions: [
        "[NO BLOQUEANTE] Corte diurno/nocturno a partir de las 7 (sin aclarar a. m./p. m.)",
        "[NO BLOQUEANTE] Nombre nuevo para asignación automática",
        "[NO BLOQUEANTE] Canal de la reprogramación (panel o también app; valor por defecto panel)",
        "[NO BLOQUEANTE] Si el rendimiento complementa o reemplaza el cálculo de dimensionamiento y unidad de medida",
        "[NO BLOQUEANTE] Habilitar cámara para reconocer el sitio (canal ambiguo; unir al backlog de logueo automático si aplica)"
      ],
      backlog: [
        "Logueo automático NFC/QR sin parametrizar [38:51]",
        "Planes de acción y adjuntos en novedades [34:00]",
        "QR externo para llamados e insumos [42:56]"
      ]
    }
  );
};

describe("MeetingAnalysisValidators v9", () => {
  // Test 1: findLaterClosures sobre el transcript de referencia
  it("1. findLaterClosures no devuelve cierres con sec=29:37 ni 32:45; sí devuelve aislamientos (32:58). findQuestionClosures incluye 29:37", () => {
    const index = new TranscriptIndex(transcript);
    const closures = index.findLaterClosures();
    const sec2937 = 29 * 60 + 37;
    const sec3245 = 32 * 60 + 45;

    expect(closures.some((c) => c.sec === sec2937)).toBe(false);
    expect(closures.some((c) => c.sec === sec3245)).toBe(false);

    const aislamientosClosure = closures.find((c) => c.topic.includes("aislamiento"));
    expect(aislamientosClosure).toBeDefined();
    expect(aislamientosClosure?.sec).toBe(32 * 60 + 58);

    const questionClosures = index.findQuestionClosures();
    expect(questionClosures.some((c) => c.sec === sec2937)).toBe(true);
  });

  // Test 2: Normalizador
  it("2. Normalizador: renombre sigue nuevo; aislamientos queda cerrado; punto con cierre pregunta no se cierra", () => {
    const point = (raw: Record<string, unknown>) => ExtractionPointSchema.parse(raw);

    const renombrePoint = point({
      id: "P1",
      timestamp: "29:06",
      cita: "cambiar el nombre a asignación automática en llamados",
      clase: "nuevo",
      accion: "codigo",
      repo: "panel"
    });

    const aislamientosPoint = point({
      id: "P2",
      timestamp: "29:19",
      cita: "lo del campo de los aislamientos en los llamados por ubicación no deben de ser obligatorios",
      clase: "nuevo",
      accion: "codigo",
      repo: "panel"
    });

    const questionClosurePoint = point({
      id: "P3",
      timestamp: "29:19",
      cita: "lo del campo de los aislamientos",
      clase: "nuevo",
      accion: "codigo",
      repo: "panel",
      cierre_posterior: {
        cita: "Eh ya está solucionado, ¿no?",
        timestamp: "29:37"
      }
    });

    const normRenombre = ExtractionPointNormalizer.normalize([renombrePoint], transcript);
    expect(normRenombre.points[0]?.clase).toBe("nuevo");

    const normAislamientos = ExtractionPointNormalizer.normalize([aislamientosPoint], transcript);
    expect(normAislamientos.points[0]?.clase).toBe("cerrado");

    // Probar que una cita con pregunta no cierra el punto (incluso con transcripción vacía)
    const normQuestion = ExtractionPointNormalizer.normalize([questionClosurePoint], "");
    expect(normQuestion.points[0]?.clase).toBe("nuevo");
    expect(normQuestion.changes.some((c) => c.change.includes("cierre descartado (pregunta:"))).toBe(true);
  });

  // Test 3: detectMatrixItems(transcript)
  it("3. detectMatrixItems(transcript) devuelve exactamente los inicios 15:45, 24:35, 30:29, 30:44, 31:24, 31:50 (31:40 no)", () => {
    const items = detectMatrixItems(transcript);
    const inicios = items.map((i) => i.timestamp);
    expect(inicios).toEqual(["15:45", "24:35", "30:29", "30:44", "31:24", "31:50"]);
  });

  // Test 4: Salida buena → 0 errores v9
  it("4. Salida buena construida a partir de expected.json → 0 errores v9", () => {
    const good = buildGoodOutput();
    const result = MeetingAnalysisValidators.validate(good, transcript);
    const v9Errors = result.errors.filter((e) => e.includes("Regla 23") || e.includes("Regla 21"));
    expect(v9Errors).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  // Test 5: Renombre [29:06] en alreadyResolved
  it("5. Renombre [29:06] en alreadyResolved (y sin issue) produce error de cierre-pregunta y no error de pedido sin issue", () => {
    const data = buildGoodOutput();
    data.issues = data.issues.filter((i) => !i.description.includes("29:06") && !i.title.includes("Renombrar"));
    data.alreadyResolved = [...(data.alreadyResolved || []), "Renombrar asignación automática en llamados [29:06]"];

    const extractionPoints = [
      ExtractionPointSchema.parse({
        id: "P_RENOMBRE",
        timestamp: "29:06",
        cita: "cambiar el nombre a asignación automática en llamados",
        clase: "cerrado",
        accion: "codigo",
        repo: "panel"
      })
    ];

    const result = MeetingAnalysisValidators.validate(data, transcript, extractionPoints);
    expect(result.errors.some((e) => e.includes("Regla 21") && e.includes("pregunta, no un cierre"))).toBe(true);
    // Como tiene destino en alreadyResolved, no debe disparar pedido de código sin issue
    expect(result.errors.some((e) => e.includes("29:06") && e.includes("contiene un pedido de código pero no genera ningún issue"))).toBe(false);
  });

  // Test 6: Salida buena sin issues de [31:24] y [31:50]
  it("6. Salida buena sin los issues de [31:24] y [31:50] produce errores de cobertura (validador 1/2) citando 31:24 y 31:50", () => {
    const data = buildGoodOutput();
    data.issues = data.issues.filter((i) => !i.description.includes("31:24") && !i.description.includes("31:50"));

    const result = MeetingAnalysisValidators.validate(data, transcript);
    expect(result.errors.some((e) => e.includes("31:24") && e.includes("no tiene salida"))).toBe(true);
    expect(result.errors.some((e) => e.includes("31:50") && e.includes("no tiene salida"))).toBe(true);
    expect(result.errors.some((e) => e.includes("31:24") && e.includes("contiene un pedido de código"))).toBe(true);
    expect(result.errors.some((e) => e.includes("31:50") && e.includes("contiene un pedido de código"))).toBe(true);
  });

  // Test 7: Mismo ítem en alreadyResolved e inProgress y texto truncado
  it("7. Mismo ítem en alreadyResolved e inProgress produce error (validador 5); entrada resuelta terminada en '…' produce error", () => {
    const data = buildGoodOutput();
    data.alreadyResolved = [...(data.alreadyResolved || []), "Item duplicado [27:36]…"];
    data.inProgress = [...(data.inProgress || []), "Item duplicado en progreso [27:36]"];

    const result = MeetingAnalysisValidators.validate(data, transcript);
    expect(result.errors.some((e) => e.includes("resuelto y en curso a la vez"))).toBe(true);
    expect(result.errors.some((e) => e.includes("texto truncado"))).toBe(true);
  });

  // Test 8: Issue de panel de cámara
  it("8. Issue de panel 'Reconocer el sitio con cámara [30:00]' produce error (validador 6)", () => {
    const data = buildGoodOutput();
    data.issues.push(
      issue({
        id: "PANEL-99",
        repo: "panel",
        title: "[Panel] Reconocer el sitio con cámara [30:00]",
        description: "Habilitar la cámara para reconocer el sitio [30:00]."
      })
    );

    const result = MeetingAnalysisValidators.validate(data, transcript);
    expect(result.errors.some((e) => e.includes("[PANEL-99]") && e.includes("canal ambiguo"))).toBe(true);
  });

  // Test 9: Decisiones con horas respaldadas vs no respaldadas
  it("9. Decisión con 19:00 produce error (validador 4); con 7 (sin aclarar a. m./p. m.) y a las 8:30 no producen error", () => {
    const badDecision = buildGoodOutput();
    badDecision.keyDecisions = ["Corte nocturno a partir de las 19:00 [16:21]"];
    const resultBad = MeetingAnalysisValidators.validate(badDecision, transcript);
    expect(resultBad.errors.some((e) => e.includes("19:00") && e.includes("Regla 23"))).toBe(true);

    const goodParamDecision = buildGoodOutput();
    goodParamDecision.keyDecisions = ["Corte nocturno a partir de las 7 (sin aclarar a. m./p. m.) [16:21]"];
    const resultGoodParam = MeetingAnalysisValidators.validate(goodParamDecision, transcript);
    expect(resultGoodParam.errors.filter((e) => e.includes("Regla 23") && e.includes("hora o cifra"))).toEqual([]);

    const goodLiteralDecision = buildGoodOutput();
    goodLiteralDecision.keyDecisions = ["Reunión a las 8:30 [23:26]"];
    const resultGoodLiteral = MeetingAnalysisValidators.validate(goodLiteralDecision, transcript);
    expect(resultGoodLiteral.errors.filter((e) => e.includes("Regla 23") && e.includes("hora o cifra"))).toEqual([]);
  });
});
