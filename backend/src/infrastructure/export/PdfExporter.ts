import PDFDocument from "pdfkit";
import { ExportFormat } from "@audio-to-text/shared";
import { IExporter } from "../../domain/services/IExporter.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

export class PdfExporter implements IExporter {
  public readonly format = ExportFormat.PDF;
  public readonly mimeType = "application/pdf";
  public readonly extension = "pdf";

  public async export(
    session: TranscriptionSession,
    speakers: Speaker[],
    segments: TranscriptionSegment[]
  ): Promise<Buffer> {
    const speakerMap = new Map<string, string>();
    speakers.forEach((s) => {
      speakerMap.set(s.id, s.displayName);
    });

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const buffers: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err: any) => reject(err));

      // Encabezado
      doc.fontSize(18).text(`Transcripción: ${session.originalFileName}`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#666666").text(
        `Duración: ${session.durationSeconds ?? "N/A"}s | Fecha: ${session.createdAt.toISOString()}`
      );
      doc.moveDown(1);

      // Contenido
      for (const segment of segments) {
        const speakerName = speakerMap.get(segment.speakerId) || "Hablante";
        const timeStr = this.formatTime(segment.startTimeMs);

        doc.fillColor("#2B579A").fontSize(11).text(`${speakerName} (${timeStr}): `, { continued: true });
        doc.fillColor("#222222").fontSize(11).text(segment.content.trim());
        doc.moveDown(0.5);
      }

      doc.end();
    });
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
