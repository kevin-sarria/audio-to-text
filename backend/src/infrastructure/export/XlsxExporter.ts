import ExcelJS from "exceljs";
import { ExportFormat } from "@audio-to-text/shared";
import { IExporter } from "../../domain/services/IExporter.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

export class XlsxExporter implements IExporter {
  public readonly format = ExportFormat.XLSX;
  public readonly mimeType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  public readonly extension = "xlsx";

  public async export(
    session: TranscriptionSession,
    speakers: Speaker[],
    segments: TranscriptionSegment[]
  ): Promise<Buffer> {
    const speakerMap = new Map<string, string>();
    speakers.forEach((s) => {
      speakerMap.set(s.id, s.displayName);
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Audio2Text";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Transcripción", {
      views: [{ state: "frozen", ySplit: 3 }]
    });

    // Fila 1: Título de la reunión
    sheet.mergeCells("A1:D1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = `TRANSCRIPCIÓN: ${session.originalFileName}`;
    titleCell.font = { name: "Segoe UI", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 28;

    // Fila 2: Subtítulo
    sheet.mergeCells("A2:D2");
    const sub = sheet.getCell("A2");
    sub.value = `Duración: ${session.durationSeconds ?? "N/A"}s | Fecha: ${session.createdAt.toLocaleDateString()} | Total Intervenciones: ${segments.length}`;
    sub.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF4B5563" } };
    sub.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(2).height = 18;

    // Fila 3: Encabezados
    const headerRow = sheet.getRow(3);
    headerRow.values = ["Tiempo Inicio", "Tiempo Fin", "Hablante / Participante", "Texto Transcrito"];
    headerRow.height = 22;

    headerRow.eachCell((cell) => {
      cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    // Filas de datos
    segments.forEach((seg, idx) => {
      const rowNum = 4 + idx;
      const speaker = speakerMap.get(seg.speakerId) || "Hablante";
      const startSec = (seg.startTimeMs / 1000).toFixed(1) + "s";
      const endSec = (seg.endTimeMs / 1000).toFixed(1) + "s";

      const r = sheet.getRow(rowNum);
      r.values = [startSec, endSec, speaker, seg.content];

      r.eachCell((cell, colNum) => {
        cell.font = { name: "Segoe UI", size: 9 };
        cell.alignment = {
          vertical: "top",
          horizontal: colNum <= 2 ? "center" : colNum === 3 ? "center" : "left",
          wrapText: true
        };
      });
    });

    sheet.getColumn(1).width = 14;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 70;

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
