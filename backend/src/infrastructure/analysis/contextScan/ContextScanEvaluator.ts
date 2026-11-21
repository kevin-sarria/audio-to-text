import { ProjectContextScanResultDto } from "@audio-to-text/shared";
import { ProjectInventory } from "./ProjectInventory.js";

export interface ExpectedFact {
  id: string;
  descripcion: string;
  tipo: "inventory" | "context-contains" | "context-not-contains" | "report";
  path?: string;
  valor?: any;
  texto?: string;
}

export interface EvaluationResult {
  found: number;
  total: number;
  missing: string[];
  falseFacts: string[];
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
  const missing: string[] = [];
  const falseFacts: string[] = [];

  const contextText = result.technicalContext || "";

  for (const fact of expected) {
    if (fact.tipo === "inventory") {
      const val = fact.path ? getByPath(inventory, fact.path) : undefined;
      const matches =
        JSON.stringify(val) === JSON.stringify(fact.valor) ||
        (typeof fact.valor === "string" && String(val).toLowerCase() === fact.valor.toLowerCase());
      if (matches) {
        found++;
      } else {
        missing.push(`${fact.id}: ${fact.descripcion} (esperado ${JSON.stringify(fact.valor)}, obtenido ${JSON.stringify(val)})`);
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
        missing.push(`${fact.id}: ${fact.descripcion} (esperado ${JSON.stringify(fact.valor)}, obtenido ${JSON.stringify(val)})`);
      }
    } else if (fact.tipo === "context-contains") {
      const target = (fact.texto || fact.valor || "").toLowerCase();
      if (contextText.toLowerCase().includes(target)) {
        found++;
      } else {
        missing.push(`${fact.id}: ${fact.descripcion} (no contiene "${target}")`);
      }
    } else if (fact.tipo === "context-not-contains") {
      const target = (fact.texto || fact.valor || "").toLowerCase();
      if (!contextText.toLowerCase().includes(target)) {
        found++;
      } else {
        falseFacts.push(`${fact.id}: ${fact.descripcion} (aparece indebidamente "${target}" en el contexto)`);
      }
    }
  }

  return {
    found,
    total: expected.length,
    missing,
    falseFacts
  };
}
