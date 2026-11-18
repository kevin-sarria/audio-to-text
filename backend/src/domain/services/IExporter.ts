import { ExportFormat } from "@audio-to-text/shared";
import { TranscriptionSession } from "../entities/TranscriptionSession.js";
import { Speaker } from "../entities/Speaker.js";
import { TranscriptionSegment } from "../entities/TranscriptionSegment.js";

export interface IExporter {
  readonly format: ExportFormat;
  readonly mimeType: string;
  readonly extension: string;

  export(
    session: TranscriptionSession,
    speakers: Speaker[],
    segments: TranscriptionSegment[]
  ): Promise<Buffer | string>;
}
