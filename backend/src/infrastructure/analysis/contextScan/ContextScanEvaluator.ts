import { ProjectContextScanResultDto } from "@audio-to-text/shared";
import { ProjectInventory } from "./ProjectInventory.js";
import {
  answerQuestion,
  computeContextMetrics,
  ContextMetrics,
  QuestionResult
} from "./ContextScanMetrics.js";

export interface ExpectedFact {
  id: string;
  descripcion?: string;
  tipo: "inventory" | "context-contains" | "context-not-contains" | "report" | "pregunta";
  path?: string;
  valor?: any;
  texto?: string;
  /** tipo "pregunta": clave(s) de sección donde debe estar la respuesta. */
  seccion?: string | string[];
  /** tipo "pregunta": la pregunta fija, en lenguaje natural. */
  pregunta?: string;
  /** tipo "pregunta": términos que deben aparecer juntos en una misma línea. */
  respuesta?: string[];
  /** tipo "pregunta": fase del plan que debería responderla (informativo). */
  fase?: number;
}

export interface EvaluationResult {
  /** Hechos inventory/report/context-* encontrados (las preguntas van aparte). */
  found: number;
  total: number;
  missing: string[];
  falseFacts: string[];
  questions: {
    answered: number;
    total: number;
    results: QuestionResult[];
  };
  metrics: ContextMetrics;
}

function getByPath(obj: any, pathStr: string): any {
  if (!obj || !pathStr) return undefined;
  const parts = pathStr.replace(/\[(\w+)\]/g, ".$1").split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function evaluateScan(
  result: ProjectContextScanResultDto,
  inventory: ProjectInventory,
  expected: ExpectedFact[]
): EvaluationResult {
  let found = 0;
  let total = 0;
  const missing: string[] = [];
  const falseFacts: string[] = [];
  const questionResults: QuestionResult[] = [];

  const contextText = result.technicalContext || "";

  for (const fact of expected) {
    const label = `${fact.id}: ${fact.descripcion ?? fact.pregunta ?? ""}`;

    if (fact.tipo === "pregunta") {
      questionResults.push(
        answerQuestion(contextText, {
          id: fact.id,
          pregunta: fact.pregunta ?? fact.descripcion ?? fact.id,
          seccion: fact.seccion ?? [],
          respuesta: fact.respuesta ?? []
        })
      );
      continue;
    }

    total++;
    if (fact.tipo === "inventory") {
      const val = fact.path ? getByPath(inventory, fact.path) : undefined;
      const matches =
        JSON.stringify(val) === JSON.stringify(fact.valor) ||
        (typeof fact.valor === "string" && String(val).toLowerCase() === fact.valor.toLowerCase());
      if (matches) {
        found++;
      } else {
        missing.push(`${label} (esperado ${JSON.stringify(fact.valor)}, obtenido ${JSON.stringify(val)})`);
      }
    } else if (fact.tipo === "report") {
      const val = fact.path ? getByPath(result.report, fact.path) : undefined;
      const matches =
        JSON.stringify(val) === JSON.stringify(fact.valor) ||
        (Array.isArray(val) && typeof fact.valor === "string" && val.some((item) => String(item).includes(fact.valor!))) ||
        (typeof fact.valor === "number" && val === fact.valor);
      if (matches) {
        found++;
      } else {
        missing.push(`${label} (esperado ${JSON.stringify(fact.valor)}, obtenido ${JSON.stringify(val)})`);
      }
    } else if (fact.tipo === "context-contains") {
      const target = (fact.texto || fact.valor || "").toLowerCase();
      if (contextText.toLowerCase().includes(target)) {
        found++;
      } else {
        missing.push(`${label} (no contiene "${target}")`);
      }
    } else if (fact.tipo === "context-not-contains") {
      const target = (fact.texto || fact.valor || "").toLowerCase();
      if (!contextText.toLowerCase().includes(target)) {
        found++;
      } else {
        falseFacts.push(`${label} (aparece indebidamente "${target}" en el contexto)`);
      }
    }
  }

  return {
    found,
    total,
    missing,
    falseFacts,
    questions: {
      answered: questionResults.filter((q) => q.answered).length,
      total: questionResults.length,
      results: questionResults
    },
    metrics: computeContextMetrics(contextText)
  };
}
