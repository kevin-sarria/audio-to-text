import ExcelJS from "exceljs";

export interface DevIssueExportData {
  id: string;
  title: string;
  type: string;
  priority: string;
  repo?: string;
  component: string;
  estimation?: {
    backendHours?: number;
    panelHours?: number;
    appHours?: number;
    totalHours?: number;
  };
  acceptanceCriteria: string[];
  agentPrompt: string;
}

export class DevIssuesExcelExporter {
  public async exportIssues(
    issues: DevIssueExportData[],
    meetingTitle: string,
    outputPath?: string
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Audio2Text - Algorithm Manager Bot";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Issues de Desarrollo", {
      views: [{ state: "frozen", ySplit: 4 }]
    });

    // Fila 1: Título
    sheet.mergeCells("A1:L1");
    const tCell = sheet.getCell("A1");
    tCell.value = `PLAN DE ISSUES Y TAREAS TÉCNICAS: ${meetingTitle.toUpperCase()}`;
    tCell.font = { name: "Segoe UI", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    tCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 30;

    // Fila 2: Subtítulo
    sheet.mergeCells("A2:L2");
    const sub = sheet.getCell("A2");
    sub.value = `Generado automáticamente por Algorithm Manager Bot | Total: ${issues.length} issues | Fecha: ${new Date().toLocaleDateString()}`;
    sub.font = { name: "Segoe UI", size: 9, italic: true, color: { argb: "FF4B5563" } };
    sub.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(2).height = 18;

    sheet.getRow(3).height = 6;

    // Fila 4: Headers
    const headers = [
      "ID",
      "Título",
      "Tipo",
      "Prioridad",
      "Repo",
      "Componente",
      "Horas BE",
      "Horas Panel",
      "Horas App",
      "Total Horas",
      "Criterios de Aceptación",
      "Prompt para Agente IA"
    ];

    const hRow = sheet.getRow(4);
    hRow.values = headers;
    hRow.height = 24;

    hRow.eachCell((c) => {
      c.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });

    // Filas de datos
    issues.forEach((item, idx) => {
      const rNum = 5 + idx;
      const criteria = item.acceptanceCriteria.map((c) => `• ${c}`).join("\n");
      const be = item.estimation?.backendHours || 0;
      const pa = item.estimation?.panelHours || 0;
      const ap = item.estimation?.appHours || 0;
      const tot = item.estimation?.totalHours || be + pa + ap;

      const r = sheet.getRow(rNum);
      r.values = [
        item.id,
        item.title,
        item.type.toUpperCase(),
        item.priority.toUpperCase(),
        (item.repo || "GENERAL").toUpperCase(),
        item.component,
        be || "-",
        pa || "-",
        ap || "-",
        tot || "-",
        criteria,
        item.agentPrompt
      ];
      r.height = Math.min(100, Math.max(28, (criteria.split("\n").length + 1) * 15));

      r.eachCell((cell, colNum) => {
        cell.font = { name: "Segoe UI", size: 9 };
        cell.alignment = {
          vertical: "top",
          horizontal: [1, 3, 4, 5, 7, 8, 9, 10].includes(colNum) ? "center" : "left",
          wrapText: true
        };

        if (colNum === 4) {
          if (item.priority.toLowerCase() === "high") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
            cell.font = { bold: true, color: { argb: "FF991B1B" }, size: 9 };
          } else if (item.priority.toLowerCase() === "medium") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
            cell.font = { bold: true, color: { argb: "FF92400E" }, size: 9 };
          }
        }
      });
    });

    const colWidths = [12, 32, 12, 12, 14, 18, 10, 11, 10, 11, 45, 50];
    colWidths.forEach((w, i) => {
      sheet.getColumn(i + 1).width = w;
    });

    if (outputPath) {
      await workbook.xlsx.writeFile(outputPath);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
