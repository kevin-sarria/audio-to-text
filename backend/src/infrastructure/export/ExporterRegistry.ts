import { ExportFormat } from "@audio-to-text/shared";
import { IExporter } from "../../domain/services/IExporter.js";
import { SrtExporter } from "./SrtExporter.js";
import { VttExporter } from "./VttExporter.js";
import { TxtExporter } from "./TxtExporter.js";
import { MarkdownExporter } from "./MarkdownExporter.js";
import { DocxExporter } from "./DocxExporter.js";
import { PdfExporter } from "./PdfExporter.js";
import { XlsxExporter } from "./XlsxExporter.js";

export function createExporterRegistry(): Map<ExportFormat, IExporter> {
  const map = new Map<ExportFormat, IExporter>();

  map.set(ExportFormat.SRT, new SrtExporter());
  map.set(ExportFormat.VTT, new VttExporter());
  map.set(ExportFormat.TXT, new TxtExporter());
  map.set(ExportFormat.MD, new MarkdownExporter());
  map.set(ExportFormat.DOCX, new DocxExporter());
  map.set(ExportFormat.PDF, new PdfExporter());
  map.set(ExportFormat.XLSX, new XlsxExporter());

  return map;
}
