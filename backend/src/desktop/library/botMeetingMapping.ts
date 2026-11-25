import type { BotMeetingDelivery } from "@audio-to-text/shared";

const PLATFORM_LABELS: Record<BotMeetingDelivery["platform"], string> = {
  GOOGLE_MEET: "Google Meet",
  MICROSOFT_TEAMS: "Microsoft Teams",
  ZOOM: "Zoom",
  LOCAL_DESKTOP: "Escritorio"
};

const WORDS_PER_SECOND = 2.5;
const MAX_TURN_SECONDS = 30;
const MIN_SEGMENT_MS = 1000;

export interface SegmentTiming {
  startMs: number;
  endMs: number;
}

/** La base exige end > start: cada segmento termina donde empieza el siguiente; si no es posible, se estima por palabras. */
export function buildSegmentTimings(utterances: BotMeetingDelivery["utterances"]): SegmentTiming[] {
  return utterances.map((u, i) => {
    const startMs = Math.round(u.offsetSec * 1000);
    const next = utterances[i + 1];
    const nextStartMs = next ? Math.round(next.offsetSec * 1000) : undefined;
    if (nextStartMs !== undefined && nextStartMs > startMs) return { startMs, endMs: nextStartMs };

    const words = u.text.trim().split(/\s+/).filter(Boolean).length;
    const estimatedMs = Math.round(Math.min(words / WORDS_PER_SECOND, MAX_TURN_SECONDS) * 1000);
    return { startMs, endMs: startMs + Math.max(MIN_SEGMENT_MS, estimatedMs) };
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatMeetingTitle(platform: BotMeetingDelivery["platform"], startedAt: string): string {
  const d = new Date(startedAt);
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Reunión ${PLATFORM_LABELS[platform]} ${date}`;
}

export function computeDurationSeconds(delivery: BotMeetingDelivery, lastEndMs: number): number {
  const seconds = (Date.parse(delivery.endedAt) - Date.parse(delivery.startedAt)) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : Math.round(lastEndMs / 1000);
}
