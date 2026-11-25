import fs from "node:fs";
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from "docx";

export interface TranscriptUtterance {
  speakerName: string;
  timestamp?: string;
  content: string;
}

export class TranscriptDocxExporter {
  public async exportTranscript(
    title: string,
    utterances: TranscriptUtterance[],
    outputPath?: string
  ): Promise<Buffer> {
    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: `TRANSCRIPCIÓN DE REUNIÓN: ${title.toUpperCase()}`,
        heading: HeadingLevel.TITLE
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Generado por Algorithm Manager Bot | Fecha: ${new Date().toLocaleDateString()} | Intervenciones: ${utterances.length}`,
            italics: true,
            color: "666666"
          })
        ],
        spacing: { after: 300 }
      })
    ];

    for (const item of utterances) {
      const timeTag = item.timestamp ? `[${item.timestamp}] ` : "";
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: timeTag,
              color: "888888",
              size: 18
            }),
            new TextRun({
              text: `${item.speakerName || "Participante"}: `,
              bold: true,
              color: "1E3A8A"
            }),
            new TextRun({
              text: item.content.trim()
            })
          ],
          spacing: { after: 140 }
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

    const buffer = await Packer.toBuffer(doc);

    if (outputPath) {
      fs.writeFileSync(outputPath, buffer);
    }

    return buffer;
  }
}
