import fs from "node:fs";
import path from "node:path";
import { DocumentRef } from "./ProjectInventory.js";
import { ScanBudget } from "./ScanBudget.js";
import { redactSecrets } from "./SecretRedactor.js";

/** duplicate: idéntico a otro documento ya leído; no se vuelve a enviar. */
export type ReadStatus = "complete" | "sections" | "omitted" | "duplicate";

export interface ReadLogEntry {
  path: string;
  status: ReadStatus;
  sections?: number;
  reason?: string;
}

export interface DocumentContent {
  ref: DocumentRef;
  mode: "full" | "summary";
  text: string;
  /** Otros documentos idénticos a este (no se envían de nuevo). */
  duplicates?: string[];
}

export type SummarizeFn = (
  fileLabel: string,
  sectionTitle: string,
  text: string
) => Promise<string>;

export interface MarkdownSection {
  title: string;
  level: number;
  body: string;
}

export function splitMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentTitle = "Introducción";
  let currentLevel = 1;
  let currentLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }

    if (!inCodeBlock) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        if (currentLines.length > 0 || sections.length > 0) {
          sections.push({
            title: currentTitle,
            level: currentLevel,
            body: currentLines.join("\n").trim()
          });
        }
        currentLevel = headingMatch[1].length;
        currentTitle = headingMatch[2].trim();
        currentLines = [];
        continue;
      }
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0 || sections.length === 0) {
    sections.push({
      title: currentTitle,
      level: currentLevel,
      body: currentLines.join("\n").trim()
    });
  }

  return sections.filter((s) => s.body.length > 0 || s.title !== "Introducción");
}

export function chunkSections(
  sections: Array<{ title: string; body: string }>,
  chunkChars: number
): Array<{ title: string; text: string }> {
  // Primero aplanar secciones muy grandes
  const atomicPieces: Array<{ title: string; text: string }> = [];

  for (const sec of sections) {
    const fullSecText = sec.body ? `## ${sec.title}\n\n${sec.body}` : `## ${sec.title}`;
    if (fullSecText.length <= chunkChars) {
      atomicPieces.push({ title: sec.title, text: fullSecText });
      continue;
    }

    // Partir por párrafos
    const paragraphs = sec.body.split(/\n\s*\n/);
    let currentParaChunk: string[] = [];
    let currentLen = 0;
    let pieceIndex = 1;

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      if (trimmedPara.length > chunkChars) {
        // Párrafo muy grande: partir por líneas
        if (currentParaChunk.length > 0) {
          atomicPieces.push({
            title: `${sec.title} (parte ${pieceIndex++})`,
            text: currentParaChunk.join("\n\n")
          });
          currentParaChunk = [];
          currentLen = 0;
        }

        const lines = trimmedPara.split(/\r?\n/);
        let lineChunk: string[] = [];
        let lineLen = 0;
        for (const l of lines) {
          if (lineLen + l.length + 1 > chunkChars && lineChunk.length > 0) {
            atomicPieces.push({
              title: `${sec.title} (parte ${pieceIndex++})`,
              text: lineChunk.join("\n")
            });
            lineChunk = [];
            lineLen = 0;
          }
          lineChunk.push(l);
          lineLen += l.length + 1;
        }
        if (lineChunk.length > 0) {
          atomicPieces.push({
            title: `${sec.title} (parte ${pieceIndex++})`,
            text: lineChunk.join("\n")
          });
        }
        continue;
      }

      if (currentLen + trimmedPara.length + 2 > chunkChars && currentParaChunk.length > 0) {
        atomicPieces.push({
          title: `${sec.title} (parte ${pieceIndex++})`,
          text: currentParaChunk.join("\n\n")
        });
        currentParaChunk = [];
        currentLen = 0;
      }

      currentParaChunk.push(trimmedPara);
      currentLen += trimmedPara.length + 2;
    }

    if (currentParaChunk.length > 0) {
      atomicPieces.push({
        title: pieceIndex > 1 ? `${sec.title} (parte ${pieceIndex})` : sec.title,
        text: currentParaChunk.join("\n\n")
      });
    }
  }

  // Ahora agrupar atomicPieces consecutivas hasta chunkChars
  const result: Array<{ title: string; text: string }> = [];
  let curGroup: Array<{ title: string; text: string }> = [];
  let curGroupLen = 0;

  for (const piece of atomicPieces) {
    if (curGroupLen + piece.text.length + 2 > chunkChars && curGroup.length > 0) {
      const combinedTitle = curGroup.map((p) => p.title).join(" · ");
      const combinedText = curGroup.map((p) => p.text).join("\n\n");
      result.push({ title: combinedTitle, text: combinedText });
      curGroup = [];
      curGroupLen = 0;
    }

    curGroup.push(piece);
    curGroupLen += piece.text.length + 2;
  }

  if (curGroup.length > 0) {
    const combinedTitle = curGroup.map((p) => p.title).join(" · ");
    const combinedText = curGroup.map((p) => p.text).join("\n\n");
    result.push({ title: combinedTitle, text: combinedText });
  }

  return result.length > 0 ? result : [{ title: "Documento", text: "" }];
}

/** Peso de cada prioridad al repartir el presupuesto entre documentos. */
const PRIORITY_WEIGHT: Record<number, number> = { 1: 5, 2: 4, 3: 2, 4: 1, 5: 0.5 };

/**
 * Reparte el presupuesto entre los documentos según su prioridad («llenado por agua»):
 * los que caben en su parte se leen completos y lo que sobra se reparte entre el resto.
 * Así un documento enorme se resume por secciones sin dejar sin lectura a los demás.
 */
export function allocateQuotas(
  docs: Array<{ path: string; size: number; priority: number }>,
  total: number
): Map<string, number> {
  const quota = new Map<string, number>();
  let remaining = Math.max(0, total);
  let pending = [...docs];
  const weight = (p: number) => PRIORITY_WEIGHT[p] ?? 1;

  while (pending.length > 0) {
    const totalWeight = pending.reduce((acc, d) => acc + weight(d.priority), 0);
    const fits = pending.filter((d) => d.size <= (remaining * weight(d.priority)) / totalWeight);
    if (fits.length === 0) {
      for (const d of pending) quota.set(d.path, Math.floor((remaining * weight(d.priority)) / totalWeight));
      break;
    }
    for (const d of fits) {
      quota.set(d.path, d.size);
      remaining -= d.size;
    }
    const fitSet = new Set(fits);
    pending = pending.filter((d) => !fitSet.has(d));
  }
  return quota;
}

export async function readDocuments(
  rootPath: string,
  docs: DocumentRef[],
  budget: ScanBudget,
  summarize: SummarizeFn,
  identicalGroups: string[][] = []
): Promise<{
  contents: DocumentContent[];
  readLog: ReadLogEntry[];
  summaryCalls: number;
  redactions: number;
}> {
  const contents: DocumentContent[] = [];
  const readLog: ReadLogEntry[] = [];
  let totalSummaryCalls = 0;
  let totalRedactions = 0;

  // Idénticos: se lee el primero (en orden de prioridad) y los demás se anotan.
  const representativeOf = new Map<string, string>();
  const duplicatesOf = new Map<string, string[]>();
  const order = new Map(docs.map((d, i) => [d.path, i]));
  for (const group of identicalGroups) {
    const sorted = group.filter((p) => order.has(p)).sort((a, b) => order.get(a)! - order.get(b)!);
    const [rep, ...rest] = sorted;
    if (!rep || rest.length === 0) continue;
    duplicatesOf.set(rep, rest);
    for (const p of rest) representativeOf.set(p, rep);
  }

  // Leer y redactar todo primero para conocer los tamaños reales.
  const texts = new Map<string, string>();
  for (const doc of docs) {
    if (representativeOf.has(doc.path)) continue;
    try {
      const raw = fs.readFileSync(path.join(rootPath, doc.path), "utf-8");
      const { text, redactions } = redactSecrets(raw);
      totalRedactions += redactions;
      texts.set(doc.path, text);
    } catch {}
  }

  const quotas = allocateQuotas(
    docs.filter((d) => texts.has(d.path)).map((d) => ({ path: d.path, size: texts.get(d.path)!.length, priority: d.priority })),
    Math.floor(budget.maxInputChars * 0.55)
  );

  for (const doc of docs) {
    const rep = representativeOf.get(doc.path);
    if (rep) {
      readLog.push({ path: doc.path, status: "duplicate", reason: `idéntico a ${rep}` });
      continue;
    }
    const redactedText = texts.get(doc.path);
    if (redactedText === undefined) {
      readLog.push({ path: doc.path, status: "omitted", reason: "no se pudo leer el archivo de disco" });
      continue;
    }
    const duplicates = duplicatesOf.get(doc.path);
    const quota = quotas.get(doc.path) ?? 0;

    // Caso 1: cabe completo en su cupo
    if (redactedText.length <= quota) {
      contents.push({ ref: doc, mode: "full", text: redactedText, duplicates });
      readLog.push({ path: doc.path, status: "complete" });
      continue;
    }

    // Caso 2: no cabe completo → resumen por secciones, si quedan llamadas
    if (totalSummaryCalls >= budget.maxSummaryCalls) {
      readLog.push({ path: doc.path, status: "omitted", reason: "límite de llamadas de resumen" });
      continue;
    }
    if (quota <= 0) {
      readLog.push({ path: doc.path, status: "omitted", reason: "sin presupuesto del modelo" });
      continue;
    }

    const chunks = chunkSections(splitMarkdownSections(redactedText), budget.chunkChars);
    const summaryParts: string[] = [];
    let failReason = "";

    for (const chunk of chunks) {
      if (totalSummaryCalls >= budget.maxSummaryCalls) {
        failReason = "límite de llamadas de resumen";
        break;
      }
      try {
        totalSummaryCalls++;
        const summary = await summarize(doc.path, chunk.title, chunk.text);
        summaryParts.push(`### ${chunk.title}\n${summary.trim()}`);
      } catch (err: any) {
        failReason = `falló el resumen: ${err?.message || String(err)}`;
        break;
      }
    }

    if (failReason) {
      readLog.push({ path: doc.path, status: "omitted", reason: failReason });
      continue;
    }

    contents.push({ ref: doc, mode: "summary", text: summaryParts.join("\n\n"), duplicates });
    readLog.push({ path: doc.path, status: "sections", sections: chunks.length });
  }

  return { contents, readLog, summaryCalls: totalSummaryCalls, redactions: totalRedactions };
}
