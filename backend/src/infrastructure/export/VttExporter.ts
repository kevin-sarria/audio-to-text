import { ExportFormat } from "@audio-to-text/shared";
import { IExporter } from "../../domain/services/IExporter.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

export class VttExporter implements IExporter {
  public readonly format = ExportFormat.VTT;
  public readonly mimeType = "text/vtt; charset=utf-8";
  public readonly extension = "vtt";

  public async export(
    _session: TranscriptionSession,
    speakers: Speaker[],
    segments: TranscriptionSegment[]
  ): Promise<string> {
    const speakerMap = new Map<string, string>();
    speakers.forEach((s) => {
      speakerMap.set(s.id, s.displayName);
    });

    const lines: string[] = ["WEBVTT", ""];

    for (const segment of segments) {
      const speakerName = speakerMap.get(segment.speakerId) || "Hablante";
      const startTimestamp = this.formatTimestamp(segment.startTimeMs);
      const endTimestamp = this.formatTimestamp(segment.endTimeMs);

      lines.push(`${startTimestamp} --> ${endTimestamp}`);
      lines.push(`<v ${speakerName}>${segment.content.trim()}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  public formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);

    const pad = (num: number, size = 2) => String(num).padStart(size, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
  }
}
