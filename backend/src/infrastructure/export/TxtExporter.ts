import { ExportFormat } from "@audio-to-text/shared";
import { IExporter } from "../../domain/services/IExporter.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

export class TxtExporter implements IExporter {
  public readonly format = ExportFormat.TXT;
  public readonly mimeType = "text/plain; charset=utf-8";
  public readonly extension = "txt";

  public async export(
    _session: TranscriptionSession,
    speakers: Speaker[],
    segments: TranscriptionSegment[]
  ): Promise<string> {
    const speakerMap = new Map<string, string>();
    speakers.forEach((s) => {
      speakerMap.set(s.id, s.displayName);
    });

    const lines: string[] = [];

    for (const segment of segments) {
      const speakerName = speakerMap.get(segment.speakerId) || "Hablante";
      const timeStr = this.formatTime(segment.startTimeMs);
      lines.push(`[${timeStr}] ${speakerName}: ${segment.content.trim()}`);
    }

    return lines.join("\n");
  }

  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
}
