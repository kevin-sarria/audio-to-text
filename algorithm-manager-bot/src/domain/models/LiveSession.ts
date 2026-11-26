export type LiveState = "OPENING" | "NEEDS_LOGIN" | "WAITING_ADMISSION" | "LISTENING";

export type LiveStatusCallback = (state: LiveState, message: string) => void;

export type BotJoinErrorCode = "NEEDS_LOGIN" | "ADMISSION_TIMEOUT" | "ROOM_UNAVAILABLE" | "BROWSER_FAILED";

/** Fallo real al entrar a la sala; el mensaje está en español y se muestra tal cual al usuario. */
export class BotJoinError extends Error {
  constructor(
    public readonly code: BotJoinErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BotJoinError";
  }
}
