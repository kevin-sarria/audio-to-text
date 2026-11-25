import { SummaryUtterance } from "../domain/models/MeetingSummary.js";

const LINE_PATTERN = /^\s*(?:\[[^\]]*\]\s*)?([^:\n[\]]{1,60}):\s*(.+)$/;
const URL_SCHEMES = new Set(["https", "http", "ftp", "file"]);

function isValidSpeaker(candidate: string): boolean {
  if (candidate.length === 0) return false;
  if (/^\d+$/.test(candidate)) return false;
  if (URL_SCHEMES.has(candidate.toLowerCase())) return false;
  if (candidate.includes("/")) return false;
  return true;
}

/** Convierte texto plano "[mm:ss] Nombre: texto" en intervenciones (sin offsets). */
export function parseTranscriptLines(transcript: string): SummaryUtterance[] {
  const utterances: SummaryUtterance[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const match = LINE_PATTERN.exec(line);
    const speaker = match?.[1]?.trim();
    const text = match?.[2]?.trim();
    if (speaker && text && isValidSpeaker(speaker)) {
      utterances.push({ speakerName: speaker, text });
    } else {
      utterances.push({ speakerName: "Participante", text: line.trim() });
    }
  }
  return utterances;
}
