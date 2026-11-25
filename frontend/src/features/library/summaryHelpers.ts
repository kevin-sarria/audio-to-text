import type { ActionItemDto, MeetingSummaryDto } from "@audio-to-text/shared";

export function formatSeconds(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Segmento que contiene la cita textual de una tarea o decisión. */
export function findSegmentIdByQuote(segments: { id: string; content: string }[], quote: string): string | null {
  const needle = normalizeForMatch(quote);
  if (!needle) return null;
  const hit = segments.find((seg) => normalizeForMatch(seg.content).includes(needle));
  return hit ? hit.id : null;
}

/** Segmento en curso en un instante: el último que ya empezó (o el primero si aún no empezó ninguno). */
export function findSegmentIdAtSeconds(segments: { id: string; startTimeMs: number }[], sec: number): string | null {
  if (segments.length === 0) return null;
  const ms = sec * 1000;
  let found = segments[0]!;
  for (const seg of segments) {
    if (seg.startTimeMs <= ms) found = seg;
    else break;
  }
  return found.id;
}

export function applyActionItemDone(
  summary: MeetingSummaryDto,
  itemId: string,
  done: boolean,
  doneAt: string | null
): MeetingSummaryDto {
  return {
    ...summary,
    actionItems: summary.actionItems.map((item) => (item.id === itemId ? { ...item, done, doneAt } : item))
  };
}

export type SessionTab = "summary" | "transcript" | "analysis";

/** Pestaña que realmente se muestra: sin resumen, la pestaña "summary" no existe y se cae a la transcripción. */
export function effectiveTab(activeTab: SessionTab, hasSummary: boolean): SessionTab {
  return activeTab === "summary" && !hasSummary ? "transcript" : activeTab;
}

/** Restaura un punto de acción a un estado previo exacto (done y doneAt), sin mutar el original. */
export function restoreActionItem(summary: MeetingSummaryDto, snapshot: ActionItemDto): MeetingSummaryDto {
  return {
    ...summary,
    actionItems: summary.actionItems.map((item) => (item.id === snapshot.id ? { ...snapshot } : item))
  };
}
