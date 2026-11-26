export type EndReason = "LEFT_ROOM" | "MEETING_ENDED_TEXT" | "BROWSER_CLOSED" | "ALONE_TIMEOUT";

export interface RoomSnapshot {
  browserOpen: boolean;
  urlStillInRoom: boolean;
  pageText: string;
  /** null si no se pudo leer el número de participantes. */
  participantCount: number | null;
  nowMs: number;
  /**
   * true si el bot sigue dentro de la llamada (se ve la barra de la llamada). Entonces el texto de la
   * página incluye los subtítulos y no se usa para decidir el fin. Ausente o false: se evalúa el texto.
   */
  inCall?: boolean;
}

/** El bot sale si lleva solo en la sala más de 2 minutos. */
export const ALONE_LIMIT_MS = 120_000;
/** Máxima espera para que el anfitrión admita al bot. */
export const ADMISSION_LIMIT_MS = 600_000;
/** Cada cuánto comprueba el driver si la reunión terminó. */
export const END_POLL_MS = 5000;

const END_TEXT: RegExp[] = [
  /saliste de la (llamada|reuni[oó]n)/i,
  /has salido de la (llamada|reuni[oó]n)/i,
  /la reuni[oó]n ha terminado/i,
  /el (anfitri[oó]n|organizador) (ha )?(finaliz[oó]|termin[oó])/i,
  /you(?:(?:'|’)ve| have)? left the (call|meeting)/i,
  /the meeting has ended/i,
  /the host (has )?ended/i,
  /you were removed/i,
  /te han (expulsado|eliminado)/i,
  /has sido eliminado/i
];

export class MeetingEndDetector {
  private aloneSince: number | null = null;

  public evaluate(s: RoomSnapshot): EndReason | null {
    if (!s.browserOpen) return "BROWSER_CLOSED";
    if (!s.urlStillInRoom) return "LEFT_ROOM";
    if (s.inCall !== true && END_TEXT.some((r) => r.test(s.pageText))) return "MEETING_ENDED_TEXT";

    if (s.participantCount !== null && s.participantCount <= 1) {
      if (this.aloneSince === null) this.aloneSince = s.nowMs;
      if (s.nowMs - this.aloneSince >= ALONE_LIMIT_MS) return "ALONE_TIMEOUT";
    } else {
      this.aloneSince = null;
    }
    return null;
  }
}
