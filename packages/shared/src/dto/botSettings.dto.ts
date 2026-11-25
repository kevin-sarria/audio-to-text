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
}

export interface MeetingBotStatusDto {
  config: MeetingBotConfigDto;
  isGoogleAccountLinked: boolean;
  linkedGoogleEmail: string | null;
  detectedBrowserName: string;
  detectedBrowserPath: string;
  isMeetingActive: boolean;
  activeSessionId?: string | null;
  activeMeetingUrl?: string | null;
}
