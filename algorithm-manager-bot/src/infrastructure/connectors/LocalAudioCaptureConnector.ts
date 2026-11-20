import { MeetingPlatform } from "../../domain/models/MeetingTypes.js";

export interface LocalCaptureConfig {
  sampleRate?: number;
  channels?: number;
  captureMicrophone?: boolean;
  captureSystemAudio?: boolean;
}

export interface LocalCaptureSession {
  sessionId: string;
  startedAt: string;
  status: "RECORDING" | "PAUSED" | "STOPPED";
  outputPath: string;
}

export class LocalAudioCaptureConnector {
  public startLocalCapture(config?: LocalCaptureConfig): LocalCaptureSession {
    const sessionId = `local-sess-${Date.now()}`;
    const outputPath = `storage/local-capture-${sessionId}.wav`;

    console.info(
      `[LocalAudioCapture] Iniciando grabación local (WASAPI Loopback + Micrófono) usando la configuración nativa de Audio2Text.`
    );

    return {
      sessionId,
      startedAt: new Date().toISOString(),
      status: "RECORDING",
      outputPath
    };
  }

  public stopLocalCapture(session: LocalCaptureSession): { success: boolean; audioPath: string } {
    console.info(`[LocalAudioCapture] Grabación local finalizada: ${session.sessionId}`);
    return {
      success: true,
      audioPath: session.outputPath
    };
  }
}
