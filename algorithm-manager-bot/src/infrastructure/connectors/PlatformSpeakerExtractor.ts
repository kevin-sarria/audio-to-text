export interface ExtractedUtterance {
  speakerName: string;
  content: string;
  timestamp: string;
  platform: string;
  /** Segundos desde el inicio de la reunión; lo asigna AutonomousMeetingBotService.recordUtterance. */
  offsetSec?: number;
}

export class PlatformSpeakerExtractor {
  public static sanitizeSpeakerName(rawName: string): string {
    if (!rawName) return "Participante";
    return rawName
      .replace(/\s*\((?:tú|you|guest|invitado|presentador|organizador)\)\s*/gi, "")
      .replace(/[\r\n\t]+/g, " ")
      .trim();
  }

  public static parseMeetCaption(elementText: string): ExtractedUtterance | null {
    // En Google Meet las líneas de subtítulo típicamente tienen formato: "Nombre del Participante: Texto hablado"
    // o dos elementos adyacentes de nombre y contenido
    const colonIndex = elementText.indexOf(":");
    if (colonIndex === -1) {
      return null;
    }

    const rawName = elementText.slice(0, colonIndex);
    const content = elementText.slice(colonIndex + 1).trim();

    if (!content) return null;

    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    return {
      speakerName: PlatformSpeakerExtractor.sanitizeSpeakerName(rawName),
      content,
      timestamp,
      platform: "GOOGLE_MEET"
    };
  }

  public static parseTeamsCaption(sender: string, text: string): ExtractedUtterance {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    return {
      speakerName: PlatformSpeakerExtractor.sanitizeSpeakerName(sender),
      content: text.trim(),
      timestamp,
      platform: "MICROSOFT_TEAMS"
    };
  }
}
