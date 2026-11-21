import fs from "node:fs";
import path from "node:path";
import { DocumentRef } from "./ProjectInventory.js";
import { ScanBudget } from "./ScanBudget.js";
import { redactSecrets } from "./SecretRedactor.js";

export type ReadStatus = "complete" | "sections" | "omitted";

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

export async function readDocuments(
  rootPath: string,
  docs: DocumentRef[],
  budget: ScanBudget,
  summarize: SummarizeFn
): Promise<{
  contents: DocumentContent[];
  readLog: ReadLogEntry[];
  summaryCalls: number;
  redactions: number;
}> {
  let docBudget = Math.floor(budget.maxInputChars * 0.55);
  const contents: DocumentContent[] = [];
  const readLog: ReadLogEntry[] = [];
  let totalSummaryCalls = 0;
  let totalRedactions = 0;

  for (const doc of docs) {
    const fullPath = path.join(rootPath, doc.path);
    let rawText = "";
    try {
      rawText = fs.readFileSync(fullPath, "utf-8");
    } catch {
      readLog.push({
        path: doc.path,
        status: "omitted",
        reason: "no se pudo leer el archivo de disco"
      });
      continue;
    }

    const { text: redactedText, redactions } = redactSecrets(rawText);
    totalRedactions += redactions;

    // Caso 1: Cabe completo en lo que queda del presupuesto
    if (redactedText.length <= docBudget && docBudget > 0) {
      contents.push({
        ref: doc,
        mode: "full",
        text: redactedText
      });
      readLog.push({
        path: doc.path,
        status: "complete"
      });
      docBudget -= redactedText.length;
      continue;
    }

    // Caso 2: No cabe completo
    // Si ya no quedan llamadas de resumen o no hay presupuesto
    if (totalSummaryCalls >= budget.maxSummaryCalls) {
      readLog.push({
        path: doc.path,
        status: "omitted",
        reason: "límite de llamadas de resumen"
      });
      continue;
    }

    if (docBudget <= 0) {
      readLog.push({
        path: doc.path,
        status: "omitted",
        reason: "sin presupuesto del modelo"
      });
      continue;
    }

    // Partir en secciones y agrupar en chunks
    const rawSections = splitMarkdownSections(redactedText);
    const chunks = chunkSections(rawSections, budget.chunkChars);

    // Resumir cada chunk
    const summaryParts: string[] = [];
    let summaryFailed = false;
    let failReason = "";

    for (const chunk of chunks) {
      if (totalSummaryCalls >= budget.maxSummaryCalls) {
        summaryFailed = true;
        failReason = "límite de llamadas de resumen";
        break;
      }

      try {
        totalSummaryCalls++;
        const summary = await summarize(doc.path, chunk.title, chunk.text);
        summaryParts.push(`### ${chunk.title}\n${summary.trim()}`);
      } catch (err: any) {
        summaryFailed = true;
        failReason = `falló el resumen: ${err?.message || String(err)}`;
        break;
      }
    }

    if (summaryFailed) {
      readLog.push({
        path: doc.path,
        status: "omitted",
        reason: failReason
      });
      continue;
    }

    const combinedSummary = summaryParts.join("\n\n");
    contents.push({
      ref: doc,
      mode: "summary",
      text: combinedSummary
    });
    readLog.push({
      path: doc.path,
      status: "sections",
      sections: chunks.length
    });
    docBudget -= combinedSummary.length;
  }

  return {
    contents,
    readLog,
    summaryCalls: totalSummaryCalls,
    redactions: totalRedactions
  };
}
