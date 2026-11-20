import { z } from "zod";
import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto } from "@audio-to-text/shared";
import { MeetingAnalysisValidators } from "./MeetingAnalysisValidators.js";

export const ExtractionPointSchema = z.object({
  id: z.string().default(() => `P${Math.floor(Math.random() * 900 + 100)}`),
  cita: z.string().default(""),
  timestamp: z.string().default("00:00"),
  clase: z.preprocess((val) => {
    if (typeof val !== "string") return "nuevo";
    const v = val.toLowerCase().trim();
    if (v.includes("cerrad") || v.includes("resuelt")) return "cerrado";
    if (v.includes("en_curso") || v.includes("curso") || v.includes("proceso")) return "en_curso";
    if (v.includes("backlog") || v.includes("desestim") || v.includes("futur")) return "backlog";
    return "nuevo";
  }, z.enum(["cerrado", "en_curso", "nuevo", "backlog"]).default("nuevo")),
  accion: z.preprocess((val) => {
    if (typeof val !== "string") return "codigo";
    const v = val.toLowerCase().trim();
    if (v.includes("gestion") || v.includes("extern") || v.includes("tercer") || v.includes("crm") || v.includes("acces")) return "gestion_externa";
    if (v.includes("decis")) return "decision";
    if (v.includes("seguim") || v.includes("valid") || v.includes("revis")) return "seguimiento";
    return "codigo";
  }, z.enum(["codigo", "gestion_externa", "decision", "seguimiento"]).default("codigo")),
  repo: z.preprocess((val) => {
    if (typeof val !== "string") return "ninguno";
    const v = val.toLowerCase().trim();
    if (v.includes("back") || v.includes("api") || v.includes("server")) return "backend";
    if (v.includes("panel") || v.includes("front") || v.includes("web")) return "panel";
    if (v.includes("app") || v.includes("movil") || v.includes("mobile")) return "app";
    if (v.includes("vari")) return "varios";
    return "ninguno";
  }, z.enum(["backend", "panel", "app", "varios", "ninguno"]).default("ninguno")),
  quien_lo_lleva: z.preprocess((val) => (typeof val === "string" && val.trim() && val.trim().toLowerCase() !== "null" ? val : null), z.string().nullable()).default(null),
  cierre_posterior: z.preprocess(
    (val) => (val && typeof val === "object" && typeof (val as any).cita === "string" ? val : null),
    z.object({ cita: z.string(), timestamp: z.string().optional() }).nullable()
  ).optional(),
  tipo: z.string().default("mejora"),
  interpretaciones: z.preprocess((val) => (Array.isArray(val) ? val : []), z.array(z.any())).default([]),
  valores_ambiguos: z.preprocess((val) => (Array.isArray(val) ? val : []), z.array(z.any())).default([]),
  preguntas: z.preprocess((val) => (Array.isArray(val) ? val : []), z.array(z.any())).default([])
});

export type ExtractionPointDto = z.infer<typeof ExtractionPointSchema>;

export const ExtractionResultSchema = z.object({
  summary: z.string().default("Resumen ejecutivo"),
  puntos: z.array(ExtractionPointSchema).default([]),
  decisiones: z.preprocess((val) => (Array.isArray(val) ? val : []), z.array(z.any())).default([]),
  alreadyResolved: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  inProgress: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  keyDecisions: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  globalOpenQuestions: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  topicsDiscussed: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  backlog: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([])
});

export type Step1ExtractionDto = z.infer<typeof ExtractionResultSchema>;

export const DevIssueSchema = z.object({
  id: z.string().default(() => `ISSUE-${Math.floor(Math.random() * 900 + 100)}`),
  repo: z.preprocess((val) => {
    if (typeof val !== "string") return "backend";
    const v = val.toLowerCase().trim();
    if (v.includes("back") || v.includes("api") || v.includes("server")) return "backend";
    if (v.includes("panel") || v.includes("front") || v.includes("web")) return "panel";
    if (v.includes("app") || v.includes("mobile") || v.includes("movil")) return "app";
    return "otro";
  }, z.enum(["backend", "panel", "app", "otro"]).default("backend")),
  title: z.string().default("Tarea técnica"),
  type: z.preprocess((val) => {
    if (typeof val !== "string") return "feature";
    const v = val.toLowerCase().trim();
    if (v.includes("bug") || v.includes("fix") || v.includes("error") || v.includes("defecto")) return "bug";
    if (v.includes("refactor") || v.includes("clean") || v.includes("mejora")) return "refactor";
    if (v.includes("chore") || v.includes("tarea") || v.includes("config")) return "chore";
    if (v.includes("spike") || v.includes("investig")) return "spike";
    return "feature";
  }, z.enum(["feature", "bug", "refactor", "chore", "spike"]).default("feature")),
  priority: z.preprocess((val) => {
    if (typeof val !== "string") return "medium";
    const v = val.toLowerCase().trim();
    if (v.includes("high") || v.includes("alta") || v.includes("crit") || v.includes("urg")) return "high";
    if (v.includes("low") || v.includes("baja")) return "low";
    return "medium";
  }, z.enum(["high", "medium", "low"]).default("medium")),
  component: z.string().default("General"),
  description: z.string().default(""),
  estimation: z
    .preprocess((val) => {
      if (!val || typeof val !== "object") {
        return { backendHours: 0, panelHours: 0, appHours: 0, totalHours: 0, text: "" };
      }
      const obj = val as Record<string, any>;
      const b = typeof obj.backendHours === "number" ? obj.backendHours : Number(obj.backendHours) || 0;
      const p = typeof obj.panelHours === "number" ? obj.panelHours : Number(obj.panelHours) || 0;
      const a = typeof obj.appHours === "number" ? obj.appHours : Number(obj.appHours) || 0;
      const t = typeof obj.totalHours === "number" ? obj.totalHours : Number(obj.totalHours) || (b + p + a);
      const text = typeof obj.text === "string" ? obj.text : `Backend: ${b}h | Panel: ${p}h | App: ${a}h | Total: ${t}h`;
      return { backendHours: b, panelHours: p, appHours: a, totalHours: t, text };
    }, z.object({
      backendHours: z.number().default(0),
      panelHours: z.number().default(0),
      appHours: z.number().default(0),
      totalHours: z.number().default(0),
      text: z.string().default("")
    }))
    .default({ backendHours: 0, panelHours: 0, appHours: 0, totalHours: 0, text: "" }),
  openQuestions: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return ["Ninguna"];
  }, z.array(z.string())).default(["Ninguna"]),
  dependencies: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return ["Ninguna"];
  }, z.array(z.string())).default(["Ninguna"]),
  prWorkflow: z
    .string()
    .default("Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan."),
  expectedFiles: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return [];
  }, z.array(z.string())).default([]),
  acceptanceCriteria: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return [];
  }, z.array(z.string())).default([]),
  agentPrompt: z.string().default("")
});

export const RepoHoursTotalsSchema = z.preprocess((val) => {
  if (!val || typeof val !== "object") {
    return { backend: 0, panel: 0, app: 0, total: 0 };
  }
  const obj = val as Record<string, any>;
  const b = Number(obj.backend) || 0;
  const p = Number(obj.panel) || 0;
  const a = Number(obj.app) || 0;
  const t = Number(obj.total) || (b + p + a);
  return { backend: b, panel: p, app: a, total: t };
}, z.object({
  backend: z.number().default(0),
  panel: z.number().default(0),
  app: z.number().default(0),
  total: z.number().default(0)
})).default({ backend: 0, panel: 0, app: 0, total: 0 });

export const MeetingAnalysisJsonSchema = z.object({
  summary: z.string().default("Resumen de la reunión"),
  alreadyResolved: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  inProgress: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  keyDecisions: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  topicsDiscussed: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  globalOpenQuestions: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  issues: z.array(DevIssueSchema).default([]),
  backlog: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  repoHoursTotals: RepoHoursTotalsSchema
});

export class MeetingAnalysisResponseParser {
  public static cleanJsonString(raw: string): string {
    let clean = raw.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*\n?/i, "");
      clean = clean.replace(/\n?\s*```\s*$/i, "");
    }
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
    return clean;
  }

  public static parseStep1Extraction(raw: string): Step1ExtractionDto {
    const clean = this.cleanJsonString(raw);
    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch (parseError: any) {
      throw new Error(
        `Error al parsear JSON de extracción de Etapa 1: ${parseError.message}`
      );
    }
    return ExtractionResultSchema.parse(parsed);
  }

  public static recalculateHoursTotals(issues: DevIssueDto[]): {
    backend: number;
    panel: number;
    app: number;
    total: number;
  } {
    let backend = 0;
    let panel = 0;
    let app = 0;

    for (const issue of issues) {
      const b = Number(issue.estimation?.backendHours) || 0;
      const p = Number(issue.estimation?.panelHours) || 0;
      const a = Number(issue.estimation?.appHours) || 0;
      const t = Number(issue.estimation?.totalHours) || (b + p + a);

      if (issue.repo === "backend") {
        backend += b > 0 ? b : t;
      } else if (issue.repo === "panel") {
        panel += p > 0 ? p : t;
      } else if (issue.repo === "app") {
        app += a > 0 ? a : t;
      } else {
        backend += b;
        panel += p;
        app += a;
      }
    }

    return {
      backend,
      panel,
      app,
      total: backend + panel + app
    };
  }

  public static parseAndValidate(
    raw: string,
    transcript?: string,
    extractionPoints?: ExtractionPointDto[]
  ): GeneratedMeetingData {
    const clean = this.cleanJsonString(raw);
    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch (parseError: any) {
      throw new Error(
        `El modelo de IA devolvió una respuesta no válida o incompleta (JSON inválido): ${parseError.message}`
      );
    }

    const issuesInput = Array.isArray(parsed?.issues) ? parsed.issues : [];
    const validIssues: DevIssueDto[] = [];
    for (const item of issuesInput) {
      const res = DevIssueSchema.safeParse(item);
      if (res.success) {
        validIssues.push(res.data as DevIssueDto);
      } else {
        console.warn("[MeetingAnalysisResponseParser] Descartando issue no conformante:", res.error.issues);
      }
    }

    const sanitizedPayload = {
      ...parsed,
      issues: validIssues
    };

    const validated = MeetingAnalysisJsonSchema.parse(sanitizedPayload);
    const verifiedTotals = this.recalculateHoursTotals(validated.issues as DevIssueDto[]);

    const initialResult: GeneratedMeetingData = {
      summary: validated.summary,
      alreadyResolved: validated.alreadyResolved,
      inProgress: validated.inProgress,
      keyDecisions: validated.keyDecisions,
      topicsDiscussed: validated.topicsDiscussed,
      globalOpenQuestions: validated.globalOpenQuestions,
      issues: validated.issues as DevIssueDto[],
      backlog: validated.backlog,
      repoHoursTotals: verifiedTotals
    };

    // Saneamiento y autocorrección determinista
    // Se pasa la transcripción para que también apliquen la cobertura y las reglas 21–22.
    const sanitizedResult = MeetingAnalysisValidators.sanitizeAndAutocorrect(initialResult, transcript);

    // Validaciones deterministas
    const validation = MeetingAnalysisValidators.validate(sanitizedResult, transcript, extractionPoints);
    if (!validation.isValid) {
      console.warn(
        `[MeetingAnalysisResponseParser] Validaciones deterministas con errores: ${validation.errors.join("; ")}`
      );
    }
    if (validation.warnings.length > 0) {
      console.info(
        `[MeetingAnalysisResponseParser] Avisos de calidad de generación: ${validation.warnings.join("; ")}`
      );
    }

    return sanitizedResult;
  }
}
