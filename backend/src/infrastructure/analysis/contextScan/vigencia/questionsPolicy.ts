import { ProjectInventory } from "../ProjectInventory.js";
import { ScanResponse } from "../ContextScanSchema.js";

/**
 * Política de preguntas y contradicciones después de verificar:
 * - una contradicción que quedó «sin_resolver» pasa a preguntas abiertas, diciendo
 *   qué se revisó (el prompt ya exige agotar fechas por sección, marcas, código y git);
 * - se quitan las preguntas que especulan causas o que preguntan por carpetas que la
 *   clasificación ya explica (copias de trabajo, clones, carpetas sin git).
 */

const SPECULATION_RE = /\bfork\b|marca blanca|white[- ]?label|¿\s*ser[aá]\b|\bquiz[aá]s\b|\btal vez\b|\bposiblemente\b|\bacaso\b/i;

export function applyQuestionsPolicy(data: ScanResponse, inventory: ProjectInventory): ScanResponse {
  const out: ScanResponse = JSON.parse(JSON.stringify(data));
  const folderNames = inventory.otherFolders.flatMap((f) => [f.path, f.name]).filter(Boolean);
  const mentionsFolder = (q: string) =>
    folderNames.some((n) => new RegExp(`(?<![\\w-])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i").test(q));

  const unresolved = (out.secciones.contradicciones ?? []).filter((c) => c.motivo === "sin_resolver");
  out.secciones.contradicciones = (out.secciones.contradicciones ?? []).filter((c) => c.motivo !== "sin_resolver");

  const questions = (out.secciones.preguntas_abiertas ?? []).filter((q) => !SPECULATION_RE.test(q) && !mentionsFolder(q));
  for (const c of unresolved) {
    questions.push(
      `Contradicción sin resolver entre ${(c.fuentes ?? []).join(" y ")}: ${c.descripcion.replace(/[.\s]+$/, "")}. Se revisaron fechas por sección, marcas explícitas, código y git sin un ganador claro.`
    );
  }
  out.secciones.preguntas_abiertas = [...new Set(questions)];
  return out;
}
