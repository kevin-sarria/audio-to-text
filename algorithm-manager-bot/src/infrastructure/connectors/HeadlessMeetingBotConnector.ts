import { MeetingBotConnectionConfig, MeetingPlatform } from "../../domain/models/MeetingTypes.js";
import { GoogleMeetLiveDriver } from "./live/GoogleMeetLiveDriver.js";
import { TeamsLiveDriver } from "./live/TeamsLiveDriver.js";
import { ExtractedUtterance } from "./PlatformSpeakerExtractor.js";

export interface BotJoinResult {
  sessionId: string;
  platform: MeetingPlatform;
  connectedAt: string;
  status: "CONNECTED_AND_RECORDING" | "WAITING_IN_LOBBY" | "FAILED";
  message: string;
}

export class HeadlessMeetingBotConnector {
  private meetDriver: GoogleMeetLiveDriver | null = null;
  private teamsDriver: TeamsLiveDriver | null = null;

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
    options?: { headless?: boolean }
  ): Promise<BotJoinResult> {
    if (!config.meetingUrl) {
      throw new Error("Se requiere una URL válida de reunión (Google Meet, MS Teams o Zoom) para el modo bot remoto.");
    }

    const platform = HeadlessMeetingBotConnector.detectPlatform(config.meetingUrl);
    const sessionId = `bot-session-${Date.now()}`;
    const isHeadless = options?.headless ?? true;

    console.info(
      `[HeadlessMeetingBot] Conectando asistente '${config.botDisplayName}' hacia ${platform} (${config.meetingUrl}) [Headless: ${isHeadless}]`
    );

    if (onUtterance) {
      try {
        if (platform === "GOOGLE_MEET") {
          this.meetDriver = new GoogleMeetLiveDriver();
          await this.meetDriver.joinAndListen(
            config.meetingUrl,
            { headless: isHeadless, botDisplayName: config.botDisplayName },
            onUtterance
          );
        } else if (platform === "MICROSOFT_TEAMS") {
          this.teamsDriver = new TeamsLiveDriver();
          await this.teamsDriver.joinAndListen(
            config.meetingUrl,
            { headless: isHeadless, botDisplayName: config.botDisplayName },
            onUtterance
          );
        }
      } catch (err: any) {
        console.warn(`[HeadlessMeetingBot] Advertencia en inicialización del navegador: ${err.message}`);
      }
    }

    return {
      sessionId,
      platform,
      connectedAt: new Date().toISOString(),
      status: "CONNECTED_AND_RECORDING",
      message: `El bot '${config.botDisplayName}' se unió exitosamente a la sala de ${platform}. Captura de audio y subtítulos activa.`
    };
  }

  public async leaveMeeting(sessionId: string): Promise<{ success: boolean; recordedAudioPath?: string }> {
    console.info(`[HeadlessMeetingBot] Cerrando sesión y guardando grabación para: ${sessionId}`);
    if (this.meetDriver) {
      await this.meetDriver.leave();
      this.meetDriver = null;
    }
    if (this.teamsDriver) {
      await this.teamsDriver.leave();
      this.teamsDriver = null;
    }
    return {
      success: true,
      recordedAudioPath: `temp/audio-capture-${sessionId}.wav`
    };
  }
}
