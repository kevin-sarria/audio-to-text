import { MeetingSummary, SummaryUtterance } from "../../domain/models/MeetingSummary.js";
import { IMeetingSummarizer, SummarizeInput } from "../../domain/services/IMeetingSummarizer.js";
import {
  calculateParticipants,
  estimateDurationSec
} from "../../domain/services/SpeakingStatsCalculator.js";
import { formatOffset } from "../../domain/timeFormat.js";
import { LlmSummaryParts, parseLlmSummary } from "./MeetingSummaryValidator.js";

export type LlmCaller = (system: string, user: string) => Promise<string>;

export interface MeetingSummaryOptions {
  maxChunkChars?: number;
}

export const DEFAULT_MAX_CHUNK_CHARS = 24000;

const RETRY_HINT =
  "Tu respuesta anterior no fue un JSON válido o no cumplía el esquema. Responde SOLO con el objeto JSON, sin texto adicional.";

const SYSTEM_PROMPT = `Eres un asistente experto en redactar actas de reunión. Recibes una transcripción con líneas "[mm:ss] Nombre: texto" (la marca de tiempo puede faltar).
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "language": "código de idioma dominante, por ejemplo es o en",
  "executiveSummary": "resumen ejecutivo de 3 a 5 líneas",
  "topics": [{ "title": "tema", "summary": "una línea" }],
  "decisions": [{ "text": "decisión tomada", "evidence": "cita textual" }],
  "actionItems": [{ "task": "tarea", "owner": "responsable", "dueDate": "fecha límite", "evidence": "cita textual" }],
  "openQuestions": [{ "text": "pregunta sin resolver", "askedBy": "quién la hizo" }],
  "chapters": [{ "title": "capítulo", "startSec": 0, "endSec": 120 }]
}
Reglas estrictas:
- "evidence" es una cita contigua copiada TAL CUAL de lo que dijo alguien, sin el nombre ni la marca de tiempo. Si no puedes citar la frase, no incluyas la decisión ni la tarea.
- "owner" y "dueDate" solo si se dijeron en la reunión. Si no, omite esas claves. Nunca los adivines.
- No inventes información que no esté en la transcripción.
- "chapters": segundos desde el inicio de la reunión, ordenados, sin solaparse y dentro de la duración indicada. Si no hay marcas de tiempo, devuelve [].
- Escribe en el idioma dominante de la transcripción.`;

export function formatTranscript(utterances: SummaryUtterance[]): string {
  return utterances
    .map((u) => {
      const tag = u.offsetSec !== undefined ? `[${formatOffset(u.offsetSec)}] ` : "";
      return `${tag}${u.speakerName}: ${u.text}`;
    })
    .join("\n");
}

export function splitIntoChunks(utterances: SummaryUtterance[], maxChars: number): SummaryUtterance[][] {
  const chunks: SummaryUtterance[][] = [];
  let current: SummaryUtterance[] = [];
  let size = 0;

  for (const u of utterances) {
    const length = formatTranscript([u]).length + 1;
    if (current.length > 0 && size + length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(u);
    size += length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function durationLine(durationSec: number | undefined): string {
  return durationSec === undefined
    ? "Duración: desconocida (sin marcas de tiempo)."
    : `Duración de la reunión: ${durationSec} segundos.`;
}

export class MeetingSummaryLlmService implements IMeetingSummarizer {
  constructor(
    private callLlm?: LlmCaller,
    private options: MeetingSummaryOptions = {}
  ) {}

  public async summarize(input: SummarizeInput): Promise<MeetingSummary> {
    const participants = calculateParticipants(input.utterances);
    const base = { sessionId: input.sessionId, generatedAt: new Date().toISOString() };

    if (!this.callLlm || input.utterances.length === 0) {
      return this.minimalSummary(base, participants, "no hay un modelo de IA configurado o la reunión no tiene intervenciones");
    }

    try {
      const parts = await this.generateWithRetry(input.utterances);
      return { ...base, ...parts, participants };
    } catch (err) {
      console.warn("[MeetingSummaryLlmService] No se pudo generar el resumen con IA:", err);
      return this.minimalSummary(base, participants, "el modelo de IA falló o devolvió una respuesta inválida");
    }
  }

  private async generateWithRetry(utterances: SummaryUtterance[]): Promise<LlmSummaryParts> {
    try {
      return await this.generate(utterances, undefined);
    } catch (first) {
      console.warn("[MeetingSummaryLlmService] Primer intento fallido, reintentando:", first);
      return await this.generate(utterances, RETRY_HINT);
    }
  }

  private async generate(utterances: SummaryUtterance[], hint: string | undefined): Promise<LlmSummaryParts> {
    const call = this.callLlm!;
    const fullText = formatTranscript(utterances);
    const durationSec = estimateDurationSec(utterances);
    const maxChars = this.options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
    const chunks = splitIntoChunks(utterances, maxChars);
    const suffix = hint ? `\n\n${hint}` : "";

    if (chunks.length <= 1) {
      const user = `${durationLine(durationSec)}\n\nTranscripción:\n${fullText}\n\nGenera el resumen en JSON estricto.${suffix}`;
      return parseLlmSummary(await call(SYSTEM_PROMPT, user), fullText, durationSec);
    }

    const partials: string[] = [];
    for (const chunk of chunks) {
      const text = formatTranscript(chunk);
      const user = `${durationLine(durationSec)}\n\nEsta es SOLO una parte de la reunión.\n\nTranscripción (parte):\n${text}\n\nGenera el resumen parcial en JSON estricto.${suffix}`;
      const parts = parseLlmSummary(await call(SYSTEM_PROMPT, user), text, durationSec);
      partials.push(JSON.stringify(parts));
    }

    const mergeUser = `${durationLine(durationSec)}\n\nA continuación están los resúmenes parciales (JSON) de cada parte de la reunión, en orden. Fusiónalos en UN solo resumen final: elimina duplicados, conserva las citas "evidence" tal cual y reconstruye capítulos coherentes.\n\n${partials.join("\n")}\n\nDevuelve el resumen final en JSON estricto.${suffix}`;
    return parseLlmSummary(await call(SYSTEM_PROMPT, mergeUser), fullText, durationSec);
  }

  private minimalSummary(
    base: { sessionId: string; generatedAt: string },
    participants: MeetingSummary["participants"],
    reason: string
  ): MeetingSummary {
    return {
      ...base,
      language: "es",
      executiveSummary: "El resumen con IA no está disponible para esta reunión.",
      topics: [],
      decisions: [],
      actionItems: [],
      openQuestions: [],
      participants,
      chapters: [],
      note: `El resumen con IA no se pudo generar: ${reason}. Se muestran solo los participantes y su tiempo de habla.`
    };
  }
}
