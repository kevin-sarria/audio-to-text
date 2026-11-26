export type BotPlatform = "GOOGLE_MEET" | "MICROSOFT_TEAMS";

/** Plataformas con driver de entrada automática. Zoom no tiene driver. */
export const BOT_PLATFORMS: readonly BotPlatform[] = ["GOOGLE_MEET", "MICROSOFT_TEAMS"];

export const DEFAULT_BOT_ALLOWED_DOMAINS: readonly string[] = [
  "meet.google.com",
  "teams.microsoft.com",
  "teams.live.com"
];

export interface MeetingBotConfigDto {
  botDisplayName: string;
  botAvatarUrl: string;
  botPreferredBrowser: "auto" | "brave" | "chrome" | "msedge";
  botGoogleAccountEmail: string;
  botAutoRecord: boolean;
  botMuteOnJoin: boolean;
  botGenerateDocx: boolean;
  botGenerateExcel: boolean;
  botDefaultPlatform: "AUTO" | "GOOGLE_MEET" | "MICROSOFT_TEAMS" | "ZOOM";
  botLanguage: string;
  /** Carpeta donde el bot deja las reuniones; vacío = la carpeta `output` del bot. */
  botOutputDir?: string;
  /** Plataformas a las que el bot puede entrar; ausente = todas las soportadas. */
  botAllowedPlatforms?: BotPlatform[];
  /** Dominios permitidos (host exacto o subdominio); ausente = DEFAULT_BOT_ALLOWED_DOMAINS. */
  botAllowedDomains?: string[];
}

export interface MeetingBotStatusDto {
  config: MeetingBotConfigDto;
  isGoogleAccountLinked: boolean;
  linkedGoogleEmail: string | null;
  detectedBrowserName: string;
  detectedBrowserPath: string;
  isMeetingActive: boolean;
  /** true si ya se verificó el login en esta ejecución de la app. */
  loginChecked?: boolean;
  activeSessionId?: string | null;
  activeMeetingUrl?: string | null;
}
