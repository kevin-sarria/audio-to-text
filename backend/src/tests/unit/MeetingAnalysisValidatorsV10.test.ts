import { describe, it, expect } from "vitest";
import { DevIssueDto } from "@audio-to-text/shared";
import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { MeetingAnalysisV10Validators } from "../../infrastructure/analysis/validators/MeetingAnalysisV10Validators.js";
import { MeetingAnalysisValidators } from "../../infrastructure/analysis/MeetingAnalysisValidators.js";
import { ExtractionPointSchema } from "../../infrastructure/analysis/MeetingAnalysisResponseParser.js";
import { DIAMANTE_PROFILE } from "../../infrastructure/analysis/profiles/diamanteProfile.js";
import { GENERIC_PROFILE } from "../../infrastructure/analysis/profiles/genericProfile.js";

const transcript = [
  "[00:10] Hablante 1: El corte de los turnos es a partir de las 7, de 6 a 7 diurnos.",
  "[00:30] Hablante 2: Se requiere reprogramar las actividades de las rutinas que no se ejecutaron.",
  "[00:50] Hablante 1: También exportar al Excel las solicitudes con filtros por periodo.",
  "[01:10] Hablante 2: Y cambiar el nombre de asignación automática en llamados."
].join("\n");

const fullPrompt = [
  "### Rol y Objetivo",
  "Actúa como desarrollador senior.",
  "### Contexto",
  "Se pidió en la reunión [00:50].",
  "### Pasos numerados",
  "1. Leer AI_CONTEXT.md y docs/REGLAS_DE_NEGOCIO.md.",
  "### Restricciones",
  "Sin alcance extra.",
  "### Criterios de Aceptación",
  "- [ ] Exporta las solicitudes filtradas.",
  "### Verificación",
  "Ejecutar las pruebas del repositorio."
].join("\n");

function issue(overrides: Partial<DevIssueDto> = {}): DevIssueDto {
  return {
    id: "BACKEND-1",
    repo: "backend",
    title: "[Backend] Exportar solicitudes a Excel",
    type: "feature",
    priority: "high",
    component: "Logic",
    description: "Exportar al Excel las solicitudes [00:50].",
    acceptanceCriteria: ["Exporta las solicitudes filtradas [00:50]."],
    agentPrompt: fullPrompt,
    estimation: { backendHours: 8, panelHours: 0, appHours: 0, totalHours: 8, text: "Backend: 8h | Panel: 0h | App: 0h | Total: 8h" },
    dependencies: ["Ninguna"],
    openQuestions: ["Ninguna"],
    ...overrides
  };
}

function analysis(issues: DevIssueDto[], extra: Partial<GeneratedMeetingData> = {}): GeneratedMeetingData {
  return {
    summary: "Reunión de requerimientos [00:10].",
    alreadyResolved: [],
    inProgress: [],
    keyDecisions: [],
    topicsDiscussed: [],
    globalOpenQuestions: [],
    issues,
    backlog: [],
    repoHoursTotals: { backend: 8, panel: 0, app: 0, total: 8 },
    ...extra
  };
}

function v10Errors(data: GeneratedMeetingData, profile = DIAMANTE_PROFILE): string[] {
  const errors: string[] = [];
  MeetingAnalysisV10Validators.validateErrors(data, transcript, errors, profile);
  return errors;
}

describe("Validadores v10", () => {
  it("una salida limpia no produce errores v10", () => {
    expect(v10Errors(analysis([issue()]))).toEqual([]);
  });

  it("1. rechaza términos internos (B7) en issues y en secciones", () => {
    const errors = v10Errors(
      analysis([issue({ description: "Según la tabla de referencia son 8 h [00:50]." })], {
        inProgress: ["Tema pendiente de openQuestions [00:10]"]
      })
    );
    expect(errors.some((e) => e.includes("tabla de referencia"))).toBe(true);
    expect(errors.some((e) => e.includes("En curso") && e.includes("openQuestions"))).toBe(true);
  });

  it("2. rechaza un prompt sin secciones o que termina en un conector suelto", () => {
    const missing = v10Errors(analysis([issue({ agentPrompt: "### Rol y Objetivo\nHaz algo." })]));
    expect(missing.some((e) => e.includes("secciones obligatorias"))).toBe(true);

    const cut = v10Errors(analysis([issue({ agentPrompt: `${fullPrompt}\nRevisar el resultado de` })]));
    expect(cut.some((e) => e.includes("incompleto"))).toBe(true);

    const colon = v10Errors(analysis([issue({ agentPrompt: `${fullPrompt}\nAdemás:` })]));
    expect(colon.some((e) => e.includes("incompleto"))).toBe(true);
  });

  it("3. acepta el prefijo [Backend] pero rechaza etiquetas o paréntesis en el título", () => {
    expect(v10Errors(analysis([issue({ title: "[Backend] Exportar solicitudes" })]))).toEqual([]);

    for (const title of [
      "[Panel] Renombrar asignación automática (PROPUESTO)",
      "[Panel] Renombrar asignación automática → PROPUESTO",
      "[Backend] Exportar [Supuesto] solicitudes",
      "[Panel] Renombrar (por confirmar)"
    ]) {
      const errors = v10Errors(analysis([issue({ title })]));
      expect(errors.some((e) => e.includes("etiquetas prohibidas o paréntesis")), title).toBe(true);
    }
  });

  it("4. rechaza una hora no literal aunque vaya dentro de [Supuesto] o [Interpretación]", () => {
    const inSupuesto = v10Errors(
      analysis([issue()], { globalOpenQuestions: ['[NO BLOQUEANTE] Corte de turnos. [Supuesto] el corte es a las 19:00 [00:10]'] })
    );
    expect(inSupuesto.some((e) => e.includes('"19:00"'))).toBe(true);

    const inInterpretation = v10Errors(
      analysis([issue({ description: "[Interpretación: a partir de las 7 → 19:00] Corte parametrizable [00:10]." })])
    );
    expect(inInterpretation.some((e) => e.includes('"19:00"'))).toBe(true);

    const pm = v10Errors(analysis([issue({ description: "El corte es a las 7 p. m. [00:10]." })]));
    expect(pm.some((e) => e.includes("7 p. m"))).toBe(true);
  });

  it("4b. no confunde marcas de tiempo citadas con horas del día", () => {
    const errors = v10Errors(
      analysis([issue({ description: "Exportar al Excel las solicitudes [00:50, 01:10] y [00:10–00:30]." })], {
        inProgress: ["Turnos, revisión [00:10, cierre 00:30]"]
      })
    );
    expect(errors.filter((e) => e.includes("hora o rango"))).toEqual([]);
  });

  it("5. rechaza alcance extra (centralizar, refactorizar) en el título si no se habló", () => {
    const errors = v10Errors(analysis([issue({ title: "[Panel] Centralizar etiqueta de llamados" })]));
    expect(errors.some((e) => e.includes("alcance no solicitado"))).toBe(true);
  });

  it("6. avisa si el issue cambia 'actividades de las rutinas' por 'rutinas'", () => {
    const points = [
      ExtractionPointSchema.parse({
        id: "P1",
        timestamp: "00:30",
        cita: "reprogramar las actividades de las rutinas que no se ejecutaron",
        clase: "nuevo",
        accion: "codigo",
        repo: "panel"
      })
    ];
    const changed = analysis([issue({ id: "PANEL-1", repo: "panel", title: "[Panel] Reprogramar rutinas", description: "Reprogramar rutinas [00:30]." })]);
    const warnings: string[] = [];
    MeetingAnalysisV10Validators.validateWarnings(changed, transcript, warnings, DIAMANTE_PROFILE, points);
    expect(warnings.some((w) => w.includes("actividades de las rutinas"))).toBe(true);

    const kept = analysis([
      issue({ id: "PANEL-1", repo: "panel", title: "[Panel] Reprogramar actividades de las rutinas", description: "Reprogramar actividades de las rutinas [00:30]." })
    ]);
    const okWarnings: string[] = [];
    MeetingAnalysisV10Validators.validateWarnings(kept, transcript, okWarnings, DIAMANTE_PROFILE, points);
    expect(okWarnings).toEqual([]);
  });

  it("7. rechaza rutas de un issue de app fuera del prefijo móvil del perfil", () => {
    const appIssue = issue({ id: "APP-1", repo: "app", title: "[App] Ver solicitudes", description: "Consumir /api/solicitudes/export [00:50]." });
    expect(v10Errors(analysis([appIssue])).some((e) => e.includes("prefijo móvil"))).toBe(true);

    const okApp = issue({ id: "APP-1", repo: "app", title: "[App] Ver solicitudes", description: "Consumir /api/mobile/solicitudes [00:50]." });
    expect(v10Errors(analysis([okApp])).some((e) => e.includes("prefijo móvil"))).toBe(false);
  });

  it("8. rechaza roles, permisos o límites que no se hablaron, también en preguntas y decisiones", () => {
    const errors = v10Errors(
      analysis([issue()], {
        globalOpenQuestions: ["[NO BLOQUEANTE] ¿Qué rol puede exportar y cuál es el límite de filas?"],
        keyDecisions: ["Solo el administrador tiene permisos de exportación"]
      })
    );
    expect(errors.some((e) => e.includes("la pregunta") && e.includes("roles"))).toBe(true);
    expect(errors.some((e) => e.includes("la pregunta") && e.includes("límites"))).toBe(true);
    expect(errors.some((e) => e.includes("la decisión") && e.includes("permisos"))).toBe(true);
  });

  it("9. antepone 'Análisis parcial' cuando hay huecos de más de 60 s con cobertura suficiente", () => {
    const lines: string[] = [];
    for (let m = 0; m < 30; m++) lines.push(`[${String(m).padStart(2, "0")}:00] Hablante 1: Seguimos revisando el punto ${m}.`);
    // Hueco de 90 s entre 30:00 y 31:30
    lines.push("[31:30] Hablante 2: Retomamos.");
    for (let m = 32; m < 40; m++) lines.push(`[${m}:00] Hablante 1: Punto ${m}.`);
    const gapTranscript = lines.join("\n");
    const data = MeetingAnalysisV10Validators.sanitizeAndAutocorrect(analysis([]), gapTranscript);
    expect(data.summary.startsWith("Análisis parcial")).toBe(true);
  });
});

describe("Validadores alimentados por el perfil (tabla 2)", () => {
  const withProfileTerms = analysis([
    issue({
      description: "Implementar en Diamante.API [00:50].",
      agentPrompt: fullPrompt.replace("1. Leer AI_CONTEXT.md y docs/REGLAS_DE_NEGOCIO.md.", "1. Leer OTRO.md.")
    })
  ]);

  it("con el perfil DIAMANTE rechaza el namespace inventado y el documento fuera de la lista", () => {
    const result = MeetingAnalysisValidators.validate(withProfileTerms, transcript, undefined, DIAMANTE_PROFILE);
    expect(result.errors.some((e) => e.includes("Diamante.API"))).toBe(true);
    expect(result.errors.some((e) => e.includes("OTRO.md"))).toBe(true);
  });

  it("con el perfil genérico esas listas están vacías y no generan errores", () => {
    const result = MeetingAnalysisValidators.validate(withProfileTerms, transcript, undefined, GENERIC_PROFILE);
    expect(result.errors.some((e) => e.includes("Diamante.API"))).toBe(false);
    expect(result.errors.some((e) => e.includes("OTRO.md"))).toBe(false);
  });

  it("ClosedXML solo se acepta rotulado '(verificar en el repo)'", () => {
    const bare = analysis([issue({ description: "Generar el archivo con ClosedXML [00:50]." })]);
    const labeled = analysis([issue({ description: "Generar el archivo con ClosedXML (verificar en el repo) [00:50]." })]);
    expect(MeetingAnalysisValidators.validate(bare, transcript).errors.some((e) => e.includes("ClosedXML"))).toBe(true);
    expect(MeetingAnalysisValidators.validate(labeled, transcript).errors.some((e) => e.includes("ClosedXML"))).toBe(false);
  });
});
