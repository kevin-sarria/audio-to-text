import type { BotSessionState } from "@audio-to-text/shared";

export const STEPS = ["Abriendo navegador", "Esperando admisión", "Escuchando", "Guardando reunión"] as const;

const STEP_BY_STATE: Partial<Record<BotSessionState, number>> = {
  OPENING: 0,
  NEEDS_LOGIN: 0,
  WAITING_ADMISSION: 1,
  LISTENING: 2,
  ENDING: 3,
  ENDED: 3
};

/** Paso del asistente para un estado; -1 si no corresponde a ninguno. */
export function stepIndexFor(state: BotSessionState): number {
  return STEP_BY_STATE[state] ?? -1;
}

export function isActiveState(state: BotSessionState): boolean {
  return ["OPENING", "NEEDS_LOGIN", "WAITING_ADMISSION", "LISTENING", "ENDING"].includes(state);
}

export function canJoin(state: BotSessionState, url: string): boolean {
  return !isActiveState(state) && url.trim().length > 0;
}

type ChipColor = "default" | "info" | "warning" | "success" | "error";

const DESCRIPTIONS: Record<BotSessionState, { label: string; color: ChipColor }> = {
  IDLE: { label: "En espera", color: "default" },
  OPENING: { label: "Abriendo navegador", color: "info" },
  NEEDS_LOGIN: { label: "Necesita iniciar sesión", color: "warning" },
  WAITING_ADMISSION: { label: "Esperando admisión", color: "warning" },
  LISTENING: { label: "Escuchando", color: "success" },
  ENDING: { label: "Guardando reunión", color: "info" },
  ENDED: { label: "Terminada", color: "success" },
  FAILED: { label: "Falló", color: "error" }
};

export function describeState(state: BotSessionState): { label: string; color: ChipColor } {
  return DESCRIPTIONS[state];
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Convierte lo escrito (con o sin https:// y ruta) en un dominio limpio, o null si no lo es. */
export function parseDomainInput(text: string): string | null {
  const host = text.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0] ?? "";
  return DOMAIN_RE.test(host) ? host : null;
}
