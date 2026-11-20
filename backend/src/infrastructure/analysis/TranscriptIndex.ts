import { TranscriptCoverageDetector, MissingAudioGap } from "./TranscriptCoverageDetector.js";
import { GLOSSARY_DOMAIN_TERMS } from "./glossary/ProjectGlossary.js";

export interface TranscriptSegment {
  sec: number;
  text: string;
  /** Texto en minúsculas y sin tildes, para comparaciones robustas. */
  norm: string;
}

export interface LaterClosure {
  topic: string;
  sec: number;
  cita: string;
}

/** Duración máxima que se le atribuye a un segmento cuando el siguiente tarda en llegar. */
const MAX_SEGMENT_SPAN_SEC = 30;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Raíz simple para comparar plurales ("aislamientos" ↔ "aislamiento"). */
export function stem(word: string): string {
  const n = normalizeText(word).trim();
  if (n.length > 5 && n.endsWith("es")) return n.slice(0, -2);
  if (n.length > 4 && n.endsWith("s")) return n.slice(0, -1);
  return n;
}

/**
 * Índice de segmentos de la transcripción ("[mm:ss] Hablante N: texto").
 * Lo usan los validadores para comprobar marcas de tiempo, citas, responsables,
 * evidencia de app y cierres posteriores sin depender del prompt.
 */
export class TranscriptIndex {
  public readonly segments: TranscriptSegment[];
  public readonly gaps: MissingAudioGap[];

  constructor(transcript: string) {
    const segments: TranscriptSegment[] = [];
    for (const line of (transcript || "").split(/\r?\n/)) {
      const m = line.match(/^\s*\[(\d{1,3}):(\d{2})\]\s*(.*)$/);
      if (!m || !m[1] || !m[2]) continue;
      // La etiqueta "Hablante N:" no es identidad (regla 2): se descarta del texto del segmento.
      const text = (m[3] || "").replace(/^Hablante\s*\d+\s*:\s*/i, "");
      if (/\[Audio no disponible/i.test(text)) continue;
      segments.push({ sec: parseInt(m[1], 10) * 60 + parseInt(m[2], 10), text, norm: normalizeText(text) });
    }
    // Formato libre (marcas en medio del texto): cada "[mm:ss]" abre un segmento.
    if (segments.length === 0) {
      const inline = /\[(\d{1,3}):(\d{2})\]([^[]*)/g;
      let m: RegExpExecArray | null;
      while ((m = inline.exec(transcript || "")) !== null) {
        if (!m[1] || !m[2]) continue;
        const text = (m[3] || "").trim();
        segments.push({ sec: parseInt(m[1], 10) * 60 + parseInt(m[2], 10), text, norm: normalizeText(text) });
      }
    }
    segments.sort((a, b) => a.sec - b.sec);
    this.segments = segments;
    this.gaps = TranscriptCoverageDetector.analyze(transcript || "").gaps;
  }

  public get isEmpty(): boolean {
    return this.segments.length === 0;
  }

  /**
   * Una marca existe si cae dentro de un segmento real: entre el inicio de un segmento y el
   * inicio del siguiente (máximo 30 s), y fuera de un tramo sin audio. Tolera las variaciones
   * de unos segundos entre transcripciones de la misma reunión, pero rechaza marcas inventadas
   * en zonas sin diálogo.
   */
  public timestampExists(sec: number): boolean {
    if (TranscriptCoverageDetector.isInsideGap(sec, this.gaps) && !this.segments.some((s) => s.sec === sec)) {
      return false;
    }
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]!;
      const next = this.segments[i + 1];
      const end = Math.min(next ? next.sec : seg.sec + MAX_SEGMENT_SPAN_SEC, seg.sec + MAX_SEGMENT_SPAN_SEC);
      if (sec >= seg.sec && sec <= Math.max(end, seg.sec)) return true;
    }
    return false;
  }

  /** Texto normalizado de los segmentos que empiezan dentro de [sec - before, sec + after]. */
  public windowText(sec: number, before: number, after: number = before): string {
    return this.segments
      .filter((s) => s.sec >= sec - before && s.sec <= sec + after)
      .map((s) => s.norm)
      .join(" ");
  }

  public containsAnywhere(term: string): boolean {
    const n = normalizeText(term);
    return this.segments.some((s) => s.norm.includes(n));
  }

  public containsWord(regex: RegExp): boolean {
    return this.segments.some((s) => regex.test(s.norm));
  }

  private isQuestionSegment(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.endsWith("?") || /¿no\?/i.test(trimmed);
  }

  /**
   * Cierres posteriores (regla 21): frases que afirman que un ítem ya está resuelto.
   * - Con tema explícito: "El de los aislamientos también", "lo de X ya está solucionado".
   * - Sin tema ("Ya está solucionado"): el tema es el término del dominio leído en los
   *   segmentos inmediatamente anteriores (regla 18: se refiere a la fila que se está leyendo).
   * Frases que son preguntas (terminan en '?' o contienen '¿no?') se descartan (regla 21 v9).
   */
  public findLaterClosures(): LaterClosure[] {
    return this.detectClosures(false);
  }

  /** Frases de cierre que tienen forma de pregunta (duda o confirmación pendiente, regla 21 v9). */
  public findQuestionClosures(): LaterClosure[] {
    return this.detectClosures(true);
  }

  private detectClosures(onlyQuestions: boolean): LaterClosure[] {
    const closures: LaterClosure[] = [];
    const explicitTopic = /\b(?:el|lo|la) de (?:los |las |la |el )?([a-z]+(?: [a-z]+)?)\s*,?\s*(?:tambien|ya (?:esta|quedo) (?:solucionad|resuelt|cerrad|list))/;
    const bareClosure =
      /\b(?:ya (?:esta|quedo|te habia|lo habia|se habia) (?:solucionad|resuelt|cerrad|list)|ya te habia solucionado|ya (?:va|esta) en la pr)\w*/;
    // Solo términos de una palabra ("centro de costo" es demasiado genérico como tema de cierre).
    const domainStems = GLOSSARY_DOMAIN_TERMS.map((t) => (t.split(" (")[0] || t).trim())
      .filter((t) => !t.includes(" "))
      .map((t) => stem(t))
      .filter((t) => t.length >= 5);

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i]!;
      const isQ = this.isQuestionSegment(seg.text);
      if (onlyQuestions ? !isQ : isQ) continue;

      const explicit = seg.norm.match(explicitTopic);
      if (explicit && explicit[1]) {
        closures.push({ topic: stem(explicit[1].split(" ").pop() || explicit[1]), sec: seg.sec, cita: seg.text });
        continue;
      }
      if (!bareClosure.test(seg.norm)) continue;

      // Tema implícito: término del dominio del mismo segmento o de los anteriores (≤ 45 s).
      const candidates = [seg, ...this.segments.slice(Math.max(0, i - 3), i).reverse()].filter(
        (s) => seg.sec - s.sec <= 45
      );
      for (const cand of candidates) {
        // El tema es el término del dominio que aparece primero en el segmento leído.
        const found = domainStems
          .map((d) => ({ d, pos: cand.norm.indexOf(d) }))
          .filter((x) => x.pos >= 0)
          .sort((a, b) => a.pos - b.pos)[0];
        if (found) {
          closures.push({ topic: found.d, sec: seg.sec, cita: seg.text });
          break;
        }
      }
    }

    const seen = new Set<string>();
    return closures.filter((c) => (seen.has(c.topic) ? false : (seen.add(c.topic), true)));
  }
}

export function parseCitedSeconds(text: string): number[] {
  const out: number[] = [];
  // Acepta [mm:ss], rangos [mm:ss–mm:ss] y listas [mm:ss, mm:ss].
  const bracket = /\[([^\]]*?\d{1,3}:\d{2}[^\]]*?)\]/g;
  let b: RegExpExecArray | null;
  while ((b = bracket.exec(text)) !== null) {
    for (const m of (b[1] || "").matchAll(/(\d{1,3}):(\d{2})/g)) {
      if (m[1] && m[2]) out.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
    }
  }
  return out;
}
