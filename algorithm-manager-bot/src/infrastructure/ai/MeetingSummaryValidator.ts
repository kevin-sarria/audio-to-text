import {
  SummaryActionItem,
  SummaryChapter,
  SummaryDecision,
  SummaryOpenQuestion,
  SummaryTopic
} from "../../domain/models/MeetingSummary.js";

export interface LlmSummaryParts {
  language: string;
  executiveSummary: string;
  topics: SummaryTopic[];
  decisions: SummaryDecision[];
  actionItems: SummaryActionItem[];
  openQuestions: SummaryOpenQuestion[];
  chapters: SummaryChapter[];
}

type Raw = Record<string, unknown>;

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function objects(v: unknown): Raw[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Raw => typeof x === "object" && x !== null);
}

function parseChapters(v: unknown, durationSec: number | undefined): SummaryChapter[] {
  if (durationSec === undefined) return [];

  const candidates: SummaryChapter[] = [];
  for (const c of objects(v)) {
    const title = str(c["title"]);
    const startSec = Number(c["startSec"]);
    const endSec = Number(c["endSec"]);
    if (!title || !Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    if (startSec < 0 || endSec <= startSec || endSec > durationSec) continue;
    candidates.push({ title, startSec, endSec });
  }

  candidates.sort((a, b) => a.startSec - b.startSec);

  const result: SummaryChapter[] = [];
  for (const c of candidates) {
    const prev = result[result.length - 1];
    if (!prev || c.startSec >= prev.endSec) result.push(c);
  }
  return result;
}

export function parseLlmSummary(
  raw: string,
  transcriptText: string,
  durationSec: number | undefined
): LlmSummaryParts {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("La respuesta del LLM no contiene un objeto JSON.");
  }

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Raw;
  const executiveSummary = str(parsed["executiveSummary"]);
  if (!executiveSummary) {
    throw new Error("La respuesta del LLM no incluye executiveSummary.");
  }

  const haystack = normalizeText(transcriptText);
  const evidenceOf = (v: unknown): string | undefined => {
    const e = str(v);
    return e && haystack.includes(normalizeText(e)) ? e : undefined;
  };

  const topics: SummaryTopic[] = [];
  for (const t of objects(parsed["topics"])) {
    const title = str(t["title"]);
    const summary = str(t["summary"]);
    if (title && summary) topics.push({ title, summary });
  }

  const decisions: SummaryDecision[] = [];
  for (const d of objects(parsed["decisions"])) {
    const text = str(d["text"]);
    const evidence = evidenceOf(d["evidence"]);
    if (text && evidence) decisions.push({ text, evidence });
  }

  const actionItems: SummaryActionItem[] = [];
  for (const a of objects(parsed["actionItems"])) {
    const task = str(a["task"]);
    const evidence = evidenceOf(a["evidence"]);
    if (!task || !evidence) continue;
    const item: SummaryActionItem = { task, evidence };
    const owner = str(a["owner"]);
    const dueDate = str(a["dueDate"]);
    if (owner) item.owner = owner;
    if (dueDate) item.dueDate = dueDate;
    actionItems.push(item);
  }

  const openQuestions: SummaryOpenQuestion[] = [];
  for (const q of objects(parsed["openQuestions"])) {
    const text = str(q["text"]);
    if (!text) continue;
    const item: SummaryOpenQuestion = { text };
    const askedBy = str(q["askedBy"]);
    if (askedBy) item.askedBy = askedBy;
    openQuestions.push(item);
  }

  return {
    language: str(parsed["language"]) ?? "es",
    executiveSummary,
    topics,
    decisions,
    actionItems,
    openQuestions,
    chapters: parseChapters(parsed["chapters"], durationSec)
  };
}
