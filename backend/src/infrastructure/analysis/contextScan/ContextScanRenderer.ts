import path from "node:path";
import { ProjectInventory } from "./ProjectInventory.js";
import { ScanResponse, SCAN_SECTIONS, ScanItem } from "./ContextScanSchema.js";
import { ProjectContextScanReportDto } from "@audio-to-text/shared";
import { WarningHint } from "./WarningHints.js";
import {
  repositoriesBlock,
  technologiesBlock,
  verificationBlock,
  deploymentBlock,
  issuesBlock,
  uncoveredHintsBlock,
  dropRepoContradictions
} from "./render/inventoryBlocks.js";
import { trimByImportance, RenderedSection } from "./render/contextTrimmer.js";

export { formatLayoutSpanish } from "./render/inventoryBlocks.js";

export const MAX_CONTEXT_CHARS = 38000;

/**
 * Una línea por hecho: el valor (la respuesta), no la etiqueta del tema. Si el valor
 * solo nombra el tema pero hay una cita confirmada, la cita literal lleva el dato.
 */
export function renderFact(it: ScanItem): string {
  const text = it.mostrar_cita && it.cita ? `${it.valor.replace(/[.;:,\s]+$/, "")}: «${it.cita}»` : it.valor;
  const impact = it.impacto ? ` — ${it.impacto}` : "";
  const marker =
    it.estado === "deducido" ? ` _(deducido de ${it.fuente})_` : it.estado === "sin_confirmar" ? " _(sin confirmar)_" : "";
  const source = it.estado === "deducido" ? "" : ` (fuente: ${it.fuente})`;
  return `- ${text}${impact}${source}${marker}`;
}

/** Bloque determinista de cada sección (si tiene). */
function inventoryBlockFor(key: string, inventory: ProjectInventory): { title: string; lines: string[] } | null {
  switch (key) {
    case "repositorios":
      return { title: "**Del inventario:**", lines: repositoriesBlock(inventory) };
    case "tecnologias":
      return inventory.manifests.length ? { title: "**Del inventario:**", lines: technologiesBlock(inventory) } : null;
    case "verificacion":
      return { title: "**Del inventario:**", lines: verificationBlock(inventory) };
    case "despliegue":
      return inventory.deployment.length ? { title: "**Del inventario:**", lines: deploymentBlock(inventory) } : null;
    case "como_escribir_issues":
      return { title: "**Del inventario:**", lines: issuesBlock(inventory) };
    default:
      return null;
  }
}

function readTotals(report: ProjectContextScanReportDto): string {
  const count = (s: string) => report.readLog.filter((l) => l.status === s).length;
  const parts = [
    `${count("complete")} leídos completos`,
    `${count("sections")} resumidos por partes`,
    `${count("omitted")} omitidos`
  ];
  const dup = count("duplicate");
  if (dup) parts.push(`${dup} idénticos a otro ya leído`);
  return `Documentos: ${parts.join(", ")} (el detalle está en el reporte del escaneo).`;
}

export function renderTechnicalContext(
  data: ScanResponse,
  inventory: ProjectInventory,
  report: ProjectContextScanReportDto,
  hints: WarningHint[] = []
): string {
  const rootDirName = path.basename(path.resolve(inventory.rootPath));
  const isoShort = report.generatedAt.slice(0, 16).replace("T", " ");
  const commits = inventory.repositories.map((r) => `${r.name}${r.headCommit ? `@${r.headCommit.slice(0, 7)}` : ""}`);
  const modelStr = `${report.model}${report.requestedModel ? ` (se pidió ${report.requestedModel})` : ""}`;

  const header = [
    `# Contexto técnico — ${rootDirName}`,
    `Generado el ${isoShort} · commit(s): ${commits.length ? commits.join(", ") : "sin git"} · ${report.providerLabel} / ${modelStr}`,
    readTotals(report),
    ""
  ];

  const notFound = new Set<string>(data.no_encontrado || []);
  const sections: RenderedSection[] = [];

  for (const [idx, sec] of SCAN_SECTIONS.entries()) {
    const lines: string[] = [`## ${idx + 1}. ${sec.title}`];
    const block = inventoryBlockFor(sec.key, inventory);
    if (block && block.lines.length) lines.push(block.title, ...block.lines, "");

    if (sec.key === "glosario") {
      const glossary = data.secciones.glosario || [];
      if (glossary.length === 0) {
        lines.push(notFound.has("glosario") ? "No encontrado." : "Ninguno.");
      } else {
        lines.push("| Cómo se dice en las reuniones | Sinónimos | Nombre en el código | Fuente |", "| --- | --- | --- | --- |");
        for (const g of glossary) {
          const unconfirmed = g.estado === "sin_confirmar" ? " _(sin confirmar)_" : "";
          lines.push(`| ${g.termino_reunion} | ${(g.sinonimos || []).join(", ")} | \`${g.nombre_codigo}\` | ${g.fuente}${unconfirmed} |`);
        }
      }
    } else if (sec.key === "contradicciones") {
      const contradictions = data.secciones.contradicciones || [];
      if (contradictions.length === 0) lines.push("No se encontraron contradicciones.");
      for (const c of contradictions) {
        lines.push(`- **Descripción:** ${c.descripcion}`, `  - Fuentes: ${(c.fuentes || []).join(", ")}`, `  - Gana: ${c.gana} (motivo: ${c.motivo})`);
      }
    } else if (sec.key === "preguntas_abiertas") {
      const questions = data.secciones.preguntas_abiertas || [];
      if (questions.length === 0) lines.push("Ninguna.");
      for (const q of questions) lines.push(`- ${q}`);
    } else {
      let items = (data.secciones[sec.key as keyof typeof data.secciones] as ScanItem[]) || [];
      if (sec.key === "repositorios") items = dropRepoContradictions(items, inventory);
      for (const it of items) lines.push(renderFact(it));

      if (sec.key === "trampas") {
        const extra = uncoveredHintsBlock(hints, items);
        if (extra.length) lines.push("", "**Advertencias encontradas en los documentos (la IA no las procesó):**", ...extra);
      }
      const hasContent = items.length > 0 || lines.length > 1;
      if (!hasContent && notFound.has(sec.key)) lines.push("No encontrado.");
    }

    lines.push("");
    sections.push({ key: sec.key, lines });
  }

  return trimByImportance(header, sections, MAX_CONTEXT_CHARS).text;
}
