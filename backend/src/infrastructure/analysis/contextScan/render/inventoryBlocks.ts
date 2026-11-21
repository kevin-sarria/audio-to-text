import { OtherFolder, ProjectInventory, RepoLayout } from "../ProjectInventory.js";
import { ScanItem } from "../ContextScanSchema.js";
import { WarningHint } from "../WarningHints.js";
import { normalizeForCite } from "../verification/citeMatcher.js";
import { renderManifestLine } from "./architectureDeps.js";

/** Bloques «Del inventario»: hechos deterministas que el modelo no puede contradecir. */

export function formatLayoutSpanish(layout: RepoLayout): string {
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

export function repositoriesBlock(inventory: ProjectInventory): string[] {
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
    for (const f of inventory.otherFolders) out.push(`  - \`${f.path}\`: ${describeOtherFolder(f)}`);
  }
  for (const group of inventory.identicalDocuments) {
    out.push(
      `- Documento idéntico en ${group.length} lugares (se mantiene sincronizado; se leyó una vez): ${group.map((p) => `\`${p}\``).join(", ")}`
    );
  }
  return out;
}

export function technologiesBlock(inventory: ProjectInventory): string[] {
  return inventory.manifests.map(renderManifestLine);
}

const dirOf = (p: string) => p.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || ".";

/** Comandos reales por carpeta, en UNA línea cada carpeta. */
export function verificationBlock(inventory: ProjectInventory): string[] {
  const out: string[] = [];
  const byDir = new Map<string, string[]>();
  for (const cmd of inventory.commands) {
    const dir = dirOf(cmd.source);
    const list = byDir.get(dir) ?? [];
    if (!list.includes(cmd.runAs)) list.push(cmd.runAs);
    byDir.set(dir, list);
  }
  for (const [dir, cmds] of byDir) out.push(`- Carpeta \`${dir}\`: ${cmds.map((c) => `\`${c}\``).join(", ")}`);
  for (const m of inventory.manifests) {
    if (m.kind !== "npm") continue;
    const hasTest = inventory.commands.some((c) => c.source === m.path && c.name === "test");
    if (!hasTest) out.push(`- ${dirOf(m.path)}: no tiene script de pruebas (\`test\`) en package.json`);
  }
  return out;
}

const KIND_LABEL: Record<string, string> = {
  "github-workflow": "GitHub Actions",
  "gitlab-ci": "GitLab CI",
  "azure-pipelines": "Azure Pipelines",
  dockerfile: "Dockerfile",
  "docker-compose": "Docker Compose",
  nginx: "Nginx",
  procfile: "Procfile",
  pm2: "PM2"
};

/** Una línea por archivo de despliegue; los workflows van resumidos, no en líneas crudas. */
export function deploymentBlock(inventory: ProjectInventory): string[] {
  return inventory.deployment.map((d) => {
    const label = KIND_LABEL[d.kind] ?? d.kind;
    const body = d.summary ?? d.facts.slice(0, 5).map((f) => `\`${f}\``).join(" · ");
    return `- \`${d.path}\` (${label})${body ? `: ${body}` : ""}`;
  });
}

export function issuesBlock(inventory: ProjectInventory): string[] {
  const out = [
    "- Indicar qué repositorio o módulo toca cada issue.",
    "- Citar las reglas afectadas por su código.",
    "- Avisar cuando lo pedido contradice una regla vigente.",
    "- Incluir las tareas obligatorias del proyecto (documentación, scripts de base de datos, pruebas) cuando apliquen.",
    "- Separar lo decidido en la reunión de lo que quedó en duda."
  ];
  for (const td of inventory.documents.filter((d) => d.category === "templates")) {
    out.push(`- Usar como formato la plantilla \`${td.path}\``);
  }
  return out;
}

/**
 * Advertencias que el modelo no convirtió en trampa: se muestran igual, con su fuente,
 * para que lo más peligroso de equivocarse nunca se pierda.
 */
export function uncoveredHintsBlock(hints: WarningHint[], traps: ScanItem[]): string[] {
  const covered = (h: WarningHint) => {
    const hintNorm = normalizeForCite(h.text);
    return traps.some((t) => {
      if (t.fuente.split(/,\s*/).some((f) => f === `${h.path}:${h.line}`)) return true;
      const cite = t.cita ? normalizeForCite(t.cita) : "";
      return cite.length >= 12 && (hintNorm.includes(cite) || cite.includes(hintNorm));
    });
  };
  return hints.filter((h) => !covered(h)).map((h) => `- «${h.text}» (fuente: ${h.path}:${h.line})`);
}

/** Quita líneas del modelo que contradicen al inventario (cantidad de repos o layout). */
export function dropRepoContradictions(items: ScanItem[], inventory: ProjectInventory): ScanItem[] {
  const principals = inventory.repositories.filter((r) => r.kind === "repo").length;
  return items.filter((it) => {
    const v = it.valor.toLowerCase();
    const count = v.match(/\b(\d+)\s+repositorios?\b/);
    if (count && Number(count[1]) !== principals) return false;
    if (/\bmonorepo\b/.test(v) && inventory.layout !== "monorepo" && !/no es (?:un )?monorepo/.test(v)) return false;
    if (/(multi-repo|repositorios separados)/.test(v) && inventory.layout !== "multi-repo") return false;
    return true;
  });
}
