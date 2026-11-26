import { MeetingBotConnectionConfig, MeetingPlatform } from "../../domain/models/MeetingTypes.js";
import { GoogleMeetLiveDriver } from "./live/GoogleMeetLiveDriver.js";
import { TeamsLiveDriver } from "./live/TeamsLiveDriver.js";
import { ExtractedUtterance } from "./PlatformSpeakerExtractor.js";
import type { BrowserLaunchConfig } from "./live/BrowserLauncher.js";
import type { LiveStatusCallback } from "../../domain/models/LiveSession.js";
import type { EndReason } from "../../domain/services/MeetingEndDetector.js";

export interface LiveDriver {
  joinAndListen(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void>;
  leave(): Promise<void>;
}

export interface LiveDriverFactories {
  meet?: (profileDir?: string) => LiveDriver;
  teams?: () => LiveDriver;
}

export interface ConnectOptions {
  chromePath?: string;
  headless?: boolean;
  profileDir?: string;
  onStatus?: LiveStatusCallback;
  onEnded?: (reason: EndReason) => void;
  admissionLimitMs?: number;
}

export interface BotJoinResult {
  sessionId: string;
  platform: MeetingPlatform;
  connectedAt: string;
  status: "CONNECTED_AND_RECORDING" | "WAITING_IN_LOBBY" | "FAILED";
  message: string;
}

export class HeadlessMeetingBotConnector {
  private active: LiveDriver | null = null;

  constructor(private drivers: LiveDriverFactories = {}) {}

  public static detectPlatform(url: string): MeetingPlatform {
    const lower = url.toLowerCase();
    if (lower.includes("meet.google.com")) return "GOOGLE_MEET";
    if (lower.includes("teams.microsoft.com") || lower.includes("teams.live.com")) return "MICROSOFT_TEAMS";
    if (lower.includes("zoom.us")) return "ZOOM";
    return "LOCAL_DESKTOP";
  }

  public async connectToMeeting(
    config: MeetingBotConnectionConfig,
    onUtterance?: (utterance: ExtractedUtterance) => void,
    options: ConnectOptions = {}
  ): Promise<BotJoinResult> {
    if (!config.meetingUrl) {
      throw new Error("Se requiere una URL válida de reunión (Google Meet, MS Teams o Zoom) para el modo bot remoto.");
    }

    const platform = HeadlessMeetingBotConnector.detectPlatform(config.meetingUrl);
    const sessionId = `bot-session-${Date.now()}`;
    console.info(`[HeadlessMeetingBot] Conectando asistente '${config.botDisplayName}' hacia ${platform} (${config.meetingUrl})`);

    if (onUtterance) {
      const driver = this.createDriver(platform, options.profileDir);
      const launchConfig: BrowserLaunchConfig = {
        headless: options.headless ?? true,
        botDisplayName: config.botDisplayName,
        chromePath: options.chromePath,
        profileDir: options.profileDir,
        onStatus: options.onStatus,
        onEnded: options.onEnded,
        admissionLimitMs: options.admissionLimitMs
      };
      this.active = driver;
      await driver.joinAndListen(config.meetingUrl, launchConfig, onUtterance);
    }

    return {
      sessionId,
      platform,
      connectedAt: new Date().toISOString(),
      status: "CONNECTED_AND_RECORDING",
      message: `El bot '${config.botDisplayName}' está en la sala de ${platform} y capta la conversación.`
    };
  }

  private createDriver(platform: MeetingPlatform, profileDir?: string): LiveDriver {
    if (platform === "GOOGLE_MEET") return (this.drivers.meet ?? ((p) => new GoogleMeetLiveDriver(p)))(profileDir);
    if (platform === "MICROSOFT_TEAMS") return (this.drivers.teams ?? (() => new TeamsLiveDriver()))();
    throw new Error(`La entrada automática no está soportada para la plataforma ${platform}.`);
  }

  public async leaveMeeting(sessionId: string): Promise<{ success: boolean; recordedAudioPath?: string }> {
    console.info(`[HeadlessMeetingBot] Cerrando sesión para: ${sessionId}`);
    if (this.active) {
      await this.active.leave();
      this.active = null;
    }
    return { success: true, recordedAudioPath: `temp/audio-capture-${sessionId}.wav` };
  }
}
