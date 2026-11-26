import type { BotSessionDto, BotSessionState } from "@audio-to-text/shared";

export interface BotNotice {
  title: string;
  body: string;
}

/** Aviso del sistema para una transición de estado; null si no merece aviso. */
export function noticeFor(session: BotSessionDto, previous: BotSessionState): BotNotice | null {
  if (session.state === previous) return null;
  switch (session.state) {
    case "LISTENING":
      return { title: "El bot entró a la reunión", body: "Ya está captando la conversación." };
    case "NEEDS_LOGIN":
      return { title: "El bot necesita iniciar sesión", body: session.message };
    case "ENDED":
      return session.result && session.result.imported > 0
        ? { title: "Reunión guardada", body: "Ya está en tu biblioteca." }
        : { title: "La reunión terminó", body: session.message };
    case "FAILED":
      return { title: "El bot no pudo completar la reunión", body: session.error ?? session.message };
    default:
      return null;
  }
}

const TRAY_LABEL: Record<BotSessionState, string> = {
  IDLE: "Bot en espera",
  OPENING: "Bot abriendo el navegador",
  NEEDS_LOGIN: "Bot necesita iniciar sesión",
  WAITING_ADMISSION: "Bot esperando que lo admitan",
  LISTENING: "Bot escuchando la reunión",
  ENDING: "Bot generando la reunión",
  ENDED: "Reunión guardada",
  FAILED: "El bot falló"
};

export function trayInfo(session: BotSessionDto): { tooltip: string; canLeave: boolean } {
  const label = TRAY_LABEL[session.state];
  const canLeave = ["OPENING", "NEEDS_LOGIN", "WAITING_ADMISSION", "LISTENING"].includes(session.state);
  return { tooltip: `Audio2Text — ${label}`, canLeave };
}
