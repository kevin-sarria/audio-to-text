import { ProjectInventory } from "./ProjectInventory.js";
import { DATA_SECTION_KEYS, ScanItem, ScanResponse, parseScanResponse } from "./ContextScanSchema.js";
import { verifyScanResponse } from "./SourceVerifier.js";
import { buildTopicsPrompt } from "./ContextScanPrompts.js";

export type LlmCall = (systemPrompt: string, userPrompt: string) => Promise<string>;

export interface TopicRefinement {
  data: ScanResponse;
  /** Hechos de la primera respuesta que sobrevivieron a la verificación de fuentes. */
  firstAnswerFacts: number;
  /** De esos, cuántos nombraban el tema sin dar el dato. */
  firstAnswerTopics: number;
  /** true si hizo la llamada de re-pedido. */
  called: boolean;
  /** Hechos nuevos que trajo el re-pedido (antes de verificarlos). */
  replacementsAdded: number;
}

/**
 * Detecta las líneas que nombran el tema sin responderlo (verificación previa, sin IA)
 * y le pide al modelo, una sola vez, el dato concreto que las reemplace. Lo que siga
 * siendo tema lo descarta después la verificación final.
 */
export async function refineTopics(
  scanData: ScanResponse,
  inventory: ProjectInventory,
  rootPath: string,
  llm: LlmCall,
  systemPrompt: string,
  userPrompt: string
): Promise<TopicRefinement> {
  const pre = verifyScanResponse(scanData, inventory, rootPath);
  const topics: Array<{ section: string; valor: string; fuente: string }> = [];
  let firstAnswerFacts = 0;

  for (const sec of DATA_SECTION_KEYS) {
    for (const item of (pre.data.secciones[sec] as ScanItem[]) ?? []) {
      firstAnswerFacts++;
      if (item.tema) topics.push({ section: sec, valor: item.valor, fuente: item.fuente });
    }
  }

  const base = { firstAnswerFacts, firstAnswerTopics: topics.length };
  if (topics.length === 0) return { data: scanData, ...base, called: false, replacementsAdded: 0 };

  let raw = "";
  try {
    raw = await llm(systemPrompt, `${userPrompt}\n\n${buildTopicsPrompt(topics)}`);
  } catch {
    return { data: scanData, ...base, called: true, replacementsAdded: 0 };
  }
  const parsed = parseScanResponse(raw);
  if (!parsed.ok) return { data: scanData, ...base, called: true, replacementsAdded: 0 };

  // Los temas originales se quedan: la verificación final los descarta y los cuenta.
  // Los reemplazos se agregan y pasan por la misma verificación.
  const merged: ScanResponse = JSON.parse(JSON.stringify(scanData));
  let replacementsAdded = 0;
  for (const sec of new Set(topics.map((t) => t.section))) {
    const current = ((merged.secciones as Record<string, unknown>)[sec] as ScanItem[]) ?? [];
    const replacements = ((parsed.data.secciones as Record<string, unknown>)[sec] as ScanItem[] | undefined) ?? [];
    const seen = new Set(current.map((i) => i.valor));
    const fresh = replacements.filter((r) => r.valor?.trim() && !seen.has(r.valor));
    replacementsAdded += fresh.length;
    (merged.secciones as Record<string, unknown>)[sec] = [...current, ...fresh];
  }
  return { data: merged, ...base, called: true, replacementsAdded };
}
