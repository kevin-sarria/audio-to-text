import { SummaryParticipant, SummaryUtterance } from "../models/MeetingSummary.js";

const WORDS_PER_SECOND = 2.5;
const MAX_TURN_SECONDS = 30;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateTurnSeconds(text: string): number {
  return Math.min(countWords(text) / WORDS_PER_SECOND, MAX_TURN_SECONDS);
}

export function calculateParticipants(utterances: SummaryUtterance[]): SummaryParticipant[] {
  const totals = new Map<string, number>();

  utterances.forEach((u, i) => {
    let seconds = estimateTurnSeconds(u.text);
    const next = utterances[i + 1];
    if (u.offsetSec !== undefined && next?.offsetSec !== undefined) {
      seconds = Math.min(Math.max(next.offsetSec - u.offsetSec, 0), MAX_TURN_SECONDS);
    }
    totals.set(u.speakerName, (totals.get(u.speakerName) ?? 0) + seconds);
  });

  const sum = Array.from(totals.values()).reduce((a, b) => a + b, 0);

  return Array.from(totals.entries())
    .map(([name, seconds]) => ({
      name,
      speakingSeconds: Math.round(seconds),
      speakingPercent: sum > 0 ? Math.round((seconds / sum) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.speakingSeconds - a.speakingSeconds);
}

/** Duración estimada en segundos; undefined si las intervenciones no traen offsets. */
export function estimateDurationSec(utterances: SummaryUtterance[]): number | undefined {
  const last = utterances[utterances.length - 1];
  if (!last || last.offsetSec === undefined) return undefined;
  return Math.ceil(last.offsetSec + estimateTurnSeconds(last.text));
}
