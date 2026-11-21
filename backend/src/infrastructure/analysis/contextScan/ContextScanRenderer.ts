import path from "node:path";
import { OtherFolder, ProjectInventory, RepoLayout } from "./ProjectInventory.js";
import {
  ScanResponse,
  SCAN_SECTIONS,
  ScanItem,
  GlossaryItem,
  Contradiction
} from "./ContextScanSchema.js";
import { ProjectContextScanReportDto } from "@audio-to-text/shared";

function formatLayoutSpanish(layout: RepoLayout): string {
  switch (layout) {
    case "multi-repo":
      return "repositorios separados";
    case "monorepo":
      return "monorepo";
    case "single-repo":
      return "un solo repositorio";
    case "no-git":
      return "sin git";
  }
}

/**
 * Una línea por hecho: el valor (la respuesta), no la etiqueta del tema. Si el valor
 * solo nombra el tema pero hay una cita confirmada, la cita literal lleva el dato.
 */
export function renderFact(it: ScanItem): string {
  const text = it.mostrar_cita && it.cita ? `${it.valor.replace(/[.;:,\s]+$/, "")}: «${it.cita}»` : it.valor;
  const impact = it.impacto ? ` — ${it.impacto}` : "";
  const marker =
    it.estado === "deducido"
      ? ` _(deducido de ${it.fuente})_`
      : it.estado === "sin_confirmar"
      ? " _(sin confirmar)_"
      : "";
  const source = it.estado === "deducido" ? "" : ` (fuente: ${it.fuente})`;
  return `- ${text}${impact}${source}${marker}`;
}

function describeOtherFolder(f: OtherFolder): string {
  const owner = f.ownerPath ? `\`${f.ownerPath}\`` : "un repo fuera de la carpeta escaneada";
  const notes = f.notes.filter((n) => !/^mismo remoto/.test(n));
  let text: string;
  if (f.kind === "copia-de-trabajo") {
    text = `copia de trabajo de ${owner}${f.branch ? ` en la rama \`${f.branch}\`` : ""}`;
  } else if (f.kind === "clon-duplicado") {
    const detail = f.notes.find((n) => /^mismo remoto/.test(n));
    text = `clon de ${owner}${detail ? ` (${detail})` : ""}`;
  } else {
    text = `carpeta sin git${f.lastModified ? `, último cambio ${f.lastModified.slice(0, 10)}` : ""}`;
  }
  return notes.length > 0 ? `${text}; ${notes.join("; ")}` : text;
}

/** Repos activos y, aparte, las carpetas que no se analizan (una línea cada una). */
function renderRepositoriesBlock(inventory: ProjectInventory): string[] {
  const out: string[] = [];
  const principals = inventory.repositories.filter((r) => r.kind === "repo");
  out.push(`- ${principals.length} repositorio(s) — ${formatLayoutSpanish(inventory.layout)}`);
  for (const r of inventory.repositories) {
    const details = [
      r.kind === "submodulo" ? `submódulo de \`${r.parentPath ?? "?"}\`` : null,
      r.branch ? `rama \`${r.branch}\`` : null,
      r.remoteUrl ? `remoto: ${r.remoteUrl}` : null,
      ...r.notes
    ].filter(Boolean);
    out.push(`  - \`${r.path}\`${details.length ? ` (${details.join(", ")})` : ""}`);
  }
  if (inventory.otherFolders.length > 0) {
    out.push("- Otras carpetas (no se analizan; no aportan tecnologías, comandos ni reglas):");
    for (const f of inventory.otherFolders) {
      out.push(`  - \`${f.path}\`: ${describeOtherFolder(f)}`);
    }
  }
  return out;
}

export function renderTechnicalContext(
  data: ScanResponse,
  inventory: ProjectInventory,
  report: ProjectContextScanReportDto
): string {
  const rootDirName = path.basename(path.resolve(inventory.rootPath));
  const isoShort = report.generatedAt.slice(0, 16).replace("T", " ");

  const repoCommitTokens = inventory.repositories.map((r) => {
    const sha7 = r.headCommit ? `@${r.headCommit.slice(0, 7)}` : "";
    return `${r.name}${sha7}`;
  });
  const commitStr = repoCommitTokens.length > 0 ? repoCommitTokens.join(", ") : "sin git";

  const lines: string[] = [];
  lines.push(`# Contexto técnico — ${rootDirName}`);
  lines.push(
    `Generado el ${isoShort} · commit(s): ${commitStr} · ${report.providerLabel} / ${report.model}`
  );
  lines.push("");

  const notFoundSet = new Set(data.no_encontrado || []);

  // Renderizar las 16 secciones
  for (const [idx, sec] of SCAN_SECTIONS.entries()) {
    const secNum = idx + 1;
    lines.push(`## ${secNum}. ${sec.title}`);

    // Hechos determinísticos del inventario
    if (sec.key === "repositorios") {
      lines.push("**Del inventario:**");
      lines.push(...renderRepositoriesBlock(inventory));
      lines.push("");
    } else if (sec.key === "tecnologias") {
      if (inventory.manifests.length > 0) {
        lines.push("**Del inventario:**");
        const priorityDeps = [
          "react",
          "vue",
          "angular",
          "next",
          "vite",
          "express",
          "nest",
          "@nestjs/core",
          "fastify",
          "prisma",
          "@prisma/client",
          "typeorm",
          "microsoft.entityframeworkcore",
          "microsoft.aspnetcore",
          "django",
          "flask",
          "fastapi",
          "spring-boot",
          "expo",
          "react-native"
        ];

        for (const m of inventory.manifests) {
          const fwStr = m.frameworks.length > 0 ? ` [${m.frameworks.join(", ")}]` : "";
          const manifestTitle = `- \`${m.path}\` (${m.kind}${m.name ? `: ${m.name}` : ""}${
            m.version ? ` v${m.version}` : ""
          })${fwStr}`;
          lines.push(manifestTitle);

          // Top 12 dependencias
          const allDeps = Object.entries(m.dependencies);
          if (allDeps.length > 0) {
            allDeps.sort(([a], [b]) => {
              const aPrio = priorityDeps.some((p) => a.toLowerCase().includes(p)) ? 0 : 1;
              const bPrio = priorityDeps.some((p) => b.toLowerCase().includes(p)) ? 0 : 1;
              return aPrio - bPrio;
            });
            const top12 = allDeps.slice(0, 12);
            const depListStr = top12.map(([k, v]) => `${k}@${v}`).join(", ");
            lines.push(`  - Dependencias principales: ${depListStr}`);
          }
        }
        lines.push("");
      }
    } else if (sec.key === "verificacion") {
      lines.push("**Del inventario:**");
      // Comandos por carpeta del manifiesto: en un monorepo cada paquete tiene los suyos.
      const dirOf = (p: string) => {
        const d = p.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
        return d || ".";
      };
      const commandsByDir = new Map<string, string[]>();
      for (const cmd of inventory.commands) {
        const dir = dirOf(cmd.source);
        const list = commandsByDir.get(dir) ?? [];
        if (!list.includes(cmd.runAs)) list.push(cmd.runAs);
        commandsByDir.set(dir, list);
      }

      for (const [dir, cmdList] of commandsByDir) {
        lines.push(`- Carpeta \`${dir}\`:`);
        for (const c of cmdList) {
          lines.push(`  - \`${c}\``);
        }
      }

      // Manifiestos npm sin script 'test'
      for (const m of inventory.manifests) {
        if (m.kind === "npm") {
          const hasTest = inventory.commands.some((c) => c.source === m.path && c.name === "test");
          if (!hasTest) {
            lines.push(`- ${dirOf(m.path)}: no tiene script de pruebas (\`test\`) en package.json`);
          }
        }
      }
      lines.push("");
    } else if (sec.key === "despliegue") {
      if (inventory.deployment.length > 0) {
        lines.push("**Del inventario:**");
        for (const d of inventory.deployment) {
          lines.push(`- \`${d.path}\` (${d.kind}):`);
          const topFacts = d.facts.slice(0, 5);
          for (const fact of topFacts) {
            lines.push(`  - \`${fact}\``);
          }
        }
        lines.push("");
      }
    } else if (sec.key === "como_escribir_issues") {
      lines.push("**Del inventario:**");
      lines.push("- Indicar qué repositorio o módulo toca cada issue.");
      lines.push("- Citar las reglas afectadas por su código.");
      lines.push("- Avisar cuando lo pedido contradice una regla vigente.");
      lines.push(
        "- Incluir las tareas obligatorias del proyecto (documentación, scripts de base de datos, pruebas) cuando apliquen."
      );
      lines.push(
        "- Separar lo decidido en la reunión de lo que quedó en duda."
      );

      // Si existen plantillas en inventory.documents (category "templates")
      const templateDocs = inventory.documents.filter(
        (doc) => doc.category === "templates"
      );
      for (const td of templateDocs) {
        lines.push(`- Usar como formato la plantilla \`${td.path}\``);
      }
      lines.push("");
    }

    // Contenido del modelo para esta sección
    if (sec.key === "glosario") {
      const glossary = data.secciones.glosario || [];
      if (glossary.length === 0) {
        if (notFoundSet.has("glosario")) {
          lines.push("No encontrado.");
        } else {
          lines.push("Ninguno.");
        }
      } else {
        lines.push("| Cómo se dice en las reuniones | Sinónimos | Nombre en el código | Fuente |");
        lines.push("| --- | --- | --- | --- |");
        for (const g of glossary) {
          const sinStr = (g.sinonimos || []).join(", ");
          const unconfirmed = g.estado === "sin_confirmar" ? " _(sin confirmar)_" : "";
          lines.push(
            `| ${g.termino_reunion} | ${sinStr} | \`${g.nombre_codigo}\` | ${g.fuente}${unconfirmed} |`
          );
        }
      }
    } else if (sec.key === "contradicciones") {
      const contradictions = data.secciones.contradicciones || [];
      if (contradictions.length === 0) {
        lines.push("No se encontraron contradicciones.");
      } else {
        for (const c of contradictions) {
          lines.push(
            `- **Descripción:** ${c.descripcion}\n  - Fuentes: ${(c.fuentes || []).join(", ")}\n  - Gana: ${c.gana} (motivo: ${c.motivo})`
          );
        }
      }
    } else if (sec.key === "preguntas_abiertas") {
      const questions = data.secciones.preguntas_abiertas || [];
      if (questions.length === 0) {
        lines.push("Ninguna.");
      } else {
        for (const q of questions) {
          lines.push(`- ${q}`);
        }
      }
    } else {
      // 13 secciones de datos tipo ScanItem[]
      const items = (data.secciones[sec.key as keyof typeof data.secciones] as ScanItem[]) || [];
      if (items.length === 0) {
        if (notFoundSet.has(sec.key)) {
          lines.push("No encontrado.");
        }
      } else {
        for (const it of items) lines.push(renderFact(it));
      }
    }

    lines.push("");
  }

  // Archivos no leídos completos al final
  lines.push("## Archivos no leídos completos");
  const notFullyRead = report.readLog.filter((l) => l.status !== "complete");
  if (notFullyRead.length === 0) {
    lines.push("Todos los documentos se leyeron completos.");
  } else {
    for (const item of notFullyRead) {
      const statusLabel =
        item.status === "sections" ? "por secciones" : "omitido";
      const details = [
        item.sections ? `${item.sections} partes` : null,
        item.reason ? item.reason : null
      ]
        .filter(Boolean)
        .join(" — ");
      lines.push(`- \`${item.path}\`: ${statusLabel}${details ? ` (${details})` : ""}`);
    }
  }

  let finalMarkdown = lines.join("\n");

  // Límite de 38000 caracteres
  if (finalMarkdown.length > 38000) {
    // Si excede 38000, recortar elementos de las secciones más largas
    // (nunca tocar los encabezados ni las viñetas fijas)
    finalMarkdown = truncateLongMarkdown(finalMarkdown, 38000);
  }

  return finalMarkdown;
}

function truncateLongMarkdown(md: string, maxLen: number): string {
  const lines = md.split("\n");
  let currentLen = md.length;
  let omittedCount = 0;

  // Buscar líneas que sean viñetas normales de datos (que no sean '##', '#', '|', '**Del')
  for (let i = lines.length - 1; i >= 0 && currentLen > maxLen; i--) {
    const l = lines[i];
    if (
      l &&
      l.startsWith("- ") &&
      !l.startsWith("- Indicar qué") &&
      !l.startsWith("- Citar las") &&
      !l.startsWith("- Avisar cuando") &&
      !l.startsWith("- Incluir las") &&
      !l.startsWith("- Separar lo") &&
      !l.startsWith("- Usar como") &&
      !l.startsWith("- Repositorio `") &&
      !l.startsWith("- Otras carpetas") &&
      !/^- \d+ repositorio/.test(l) &&
      !l.startsWith("- `")
    ) {
      currentLen -= l.length + 1;
      lines.splice(i, 1);
      omittedCount++;
    }
  }

  if (omittedCount > 0) {
    lines.push(`- … (${omittedCount} elementos más omitidos por tamaño)`);
  }

  return lines.join("\n");
}
