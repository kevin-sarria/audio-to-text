export type MeetingType = "INTERNAL" | "COMMERCIAL_CLIENT";

export type BotConnectionMode = "HEADLESS_BOT" | "LOCAL_CAPTURE";

export type MeetingPlatform = "GOOGLE_MEET" | "MICROSOFT_TEAMS" | "ZOOM" | "LOCAL_DESKTOP";

export interface MeetingClassification {
  type: MeetingType;
  confidence: number; // 0.0 a 1.0
  reason: string;
  clientName?: string;
  keyPainPoints: string[];
  budgetMentioned?: string;
  timelineMentioned?: string;
}

export interface MeetingBotConnectionConfig {
  mode: BotConnectionMode;
  meetingUrl?: string;
  platform: MeetingPlatform;
  botDisplayName: string;
  autoRecord: boolean;
}
