import ExcelJS from "exceljs";
import { MeetingAnalysis } from "../../domain/entities/MeetingAnalysis.js";
import { DevIssueDto } from "@audio-to-text/shared";

export class IssuesExcelExporter {
  public async exportToBuffer(
    analysis: MeetingAnalysis,
    meetingTitle?: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Audio2Text - Algorithm Manager Bot";
    workbook.created = new Date();

    const title = meetingTitle || analysis.title || "Reunión de Ingeniería";
    const issues = (analysis.issues || []) as DevIssueDto[];

    // 1. Hoja de Issues de Desarrollo
    const sheet = workbook.addWorksheet("Issues de Desarrollo", {
      views: [{ state: "frozen", ySplit: 4 }]
    });

    // Fila 1: Título Principal
    sheet.mergeCells("A1:L1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = `PLAN DE DESARROLLO E ISSUES: ${title.toUpperCase()}`;
    titleCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 32;

    // Fila 2: Subtítulo con métricas
    sheet.mergeCells("A2:L2");
    const subCell = sheet.getCell("A2");
    const totals = analysis.repoHoursTotals;
    const hoursText = totals
      ? `Horas Estimadas: Backend ${totals.backend}h | Panel ${totals.panel}h | App ${totals.app}h | Total: ${totals.total}h`
      : `Total de Issues extraídos: ${issues.length}`;
    subCell.value = `Generado automáticamente por el Bot de Reuniones | ${hoursText} | Fecha: ${new Date().toLocaleDateString()}`;
    subCell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: "FF374151" } };
    subCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(2).height = 20;

    // Fila 3: Espacio en blanco
    sheet.getRow(3).height = 8;

    // Fila 4: Encabezados de Columnas
    const headers = [
      "ID",
      "Título del Issue",
      "Tipo",
      "Prioridad",
      "Repositorio",
      "Componente",
      "Horas BE",
      "Horas Panel",
      "Horas App",
      "Horas Total",
      "Criterios de Aceptación",
      "Prompt para Agente IA"
    ];

    const headerRow = sheet.getRow(4);
    headerRow.values = headers;
    headerRow.height = 26;

    headerRow.eachCell((cell) => {
      cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "medium", color: { argb: "FF1E40AF" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } }
      };
    });

    // Filas de Datos
    issues.forEach((issue, index) => {
      const rowNumber = 5 + index;
      const beHours = issue.estimation?.backendHours || 0;
      const panelHours = issue.estimation?.panelHours || 0;
      const appHours = issue.estimation?.appHours || 0;
      const totalHours = issue.estimation?.totalHours || beHours + panelHours + appHours;

      const criteriaText = Array.isArray(issue.acceptanceCriteria)
        ? issue.acceptanceCriteria.map((c) => `• ${c}`).join("\n")
        : "";

      const rowValues = [
        issue.id,
        issue.title,
        issue.type.toUpperCase(),
        issue.priority.toUpperCase(),
        issue.repo ? issue.repo.toUpperCase() : "GENERAL",
        issue.component,
        beHours || "-",
        panelHours || "-",
        appHours || "-",
        totalHours || "-",
        criteriaText,
        issue.agentPrompt || ""
      ];

      const row = sheet.getRow(rowNumber);
      row.values = rowValues;
      row.height = Math.min(120, Math.max(30, (criteriaText.split("\n").length + 1) * 16));

      row.eachCell((cell, colNumber) => {
        cell.font = { name: "Segoe UI", size: 9 };
        cell.alignment = {
          vertical: "top",
          horizontal: [1, 3, 4, 5, 7, 8, 9, 10].includes(colNumber) ? "center" : "left",
          wrapText: true
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } }
        };

        // Resaltado de Prioridad
        if (colNumber === 4) {
          if (issue.priority === "high") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }; // Rojo suave
            cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF991B1B" } };
          } else if (issue.priority === "medium") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }; // Amarillo suave
            cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF92400E" } };
          } else {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECFDF5" } }; // Verde suave
            cell.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FF065F46" } };
          }
        }
      });
    });

    // Configurar anchos de columna
    const colWidths = [12, 34, 12, 12, 14, 20, 10, 11, 10, 11, 45, 50];
    colWidths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    // 2. Hoja de Resumen y Decisiones
    const summarySheet = workbook.addWorksheet("Resumen y Decisiones");
    summarySheet.getColumn(1).width = 25;
    summarySheet.getColumn(2).width = 75;

    summarySheet.addRow(["SECCIÓN", "CONTENIDO"]);
    summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    summarySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };

    summarySheet.addRow(["Título de Reunión", title]);
    summarySheet.addRow(["Resumen Ejecutivo", analysis.summary]);
    summarySheet.addRow([
      "Decisiones Clave",
      Array.isArray(analysis.keyDecisions) ? analysis.keyDecisions.map((d) => `• ${d}`).join("\n") : ""
    ]);
    summarySheet.addRow([
      "Temas Tratados",
      Array.isArray(analysis.topicsDiscussed) ? analysis.topicsDiscussed.map((t) => `• ${t}`).join("\n") : ""
    ]);

    summarySheet.eachRow((r, idx) => {
      if (idx > 1) {
        r.alignment = { vertical: "top", wrapText: true };
        r.getCell(1).font = { bold: true };
      }
    });

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }
}
