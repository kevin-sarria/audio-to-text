import type { BotPlatform } from "./botSettings.dto.js";

export const BOT_SESSION_STATES = [
  "IDLE",
  "OPENING",
  "NEEDS_LOGIN",
  "WAITING_ADMISSION",
  "LISTENING",
  "ENDING",
  "ENDED",
  "FAILED"
] as const;

export type BotSessionState = (typeof BOT_SESSION_STATES)[number];

export interface BotSessionResultDto {
  /** Reuniones nuevas importadas a la biblioteca. */
  imported: number;
  /** Intervenciones captadas. */
  utterances: number;
  /** Archivo reunion_*.json escrito, o null si no hubo transcripción. */
  deliveryFile: string | null;
  /** Por qué terminó, en español. */
  reason: string;
}

export interface BotSessionDto {
  state: BotSessionState;
  message: string;
  meetingUrl: string | null;
  platform: BotPlatform | null;
  startedAt: string | null;
  error: string | null;
  result: BotSessionResultDto | null;
}

export interface BotLoginCheckDto {
  linked: boolean;
  email: string | null;
  message: string;
}

export interface BotJoinRequestDto {
  url: string;
}
