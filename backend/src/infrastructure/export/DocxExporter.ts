import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";
import { ExportFormat } from "@audio-to-text/shared";
import { IExporter } from "../../domain/services/IExporter.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

export class DocxExporter implements IExporter {
  public readonly format = ExportFormat.DOCX;
  public readonly mimeType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  public readonly extension = "docx";

  public async export(
    session: TranscriptionSession,
    speakers: Speaker[],
    segments: TranscriptionSegment[]
  ): Promise<Buffer> {
    const speakerMap = new Map<string, string>();
    speakers.forEach((s) => {
      speakerMap.set(s.id, s.displayName);
    });

    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: `Transcripción: ${session.originalFileName}`,
        heading: HeadingLevel.TITLE
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Duración: ${session.durationSeconds ?? "N/A"}s | Fecha: ${session.createdAt.toLocaleDateString()}`,
            italics: true,
            color: "666666"
          })
        ],
        spacing: { after: 300 }
      })
    ];

    for (const segment of segments) {
      const speakerName = speakerMap.get(segment.speakerId) || "Hablante";
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${speakerName}: `,
              bold: true,
              color: "2B579A"
            }),
            new TextRun({
              text: segment.content.trim()
            })
          ],
          spacing: { after: 150 }
        })
      );
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs
        }
      ]
    });

    return await Packer.toBuffer(doc);
  }
}
