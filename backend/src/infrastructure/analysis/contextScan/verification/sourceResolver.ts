import fs from "node:fs";
import path from "node:path";
import { ProjectInventory } from "../ProjectInventory.js";
import { isSecretFile } from "../ScanIgnore.js";
import { buildCiteIndex, CiteIndex } from "./citeMatcher.js";

/**
 * Resuelve la `fuente` que escribe el modelo a un archivo real del proyecto.
 * Acepta rutas relativas a la raíz o a un repo («src/pages/» dentro de
 * «frontend-app/»), sufijos «:línea» o «#ancla», y un nombre de archivo suelto si
 * en el proyecto hay uno solo con ese nombre entre los archivos conocidos.
 */

export type SourceKind = "file" | "dir" | "inventory" | "missing" | "outside" | "secret";

export interface ResolvedSource {
  kind: SourceKind;
  /** Ruta relativa a la raíz, con «/». */
  rel?: string;
  abs?: string;
}

export function normalizeSourcePath(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s*\((?:secci[oó]n|l[ií]neas?|section|lines?)[^)]*\)\s*$/i, "")
    .replace(/[:#]L?\d+(?:-L?\d+)?$/, "")
    .replace(/#.*$/, "")
    .replace(/^\.\//, "")
    .replace(/\\/g, "/")
    .trim();
}

export function splitSources(fuente: string): string[] {
  return fuente
    .split(/\s*(?:,|;|\s+y\s+|\s+and\s+)\s*/i)
    .map(normalizeSourcePath)
    .filter(Boolean);
}

export class SourceContext {
  private readonly cache = new Map<string, string | null>();
  private readonly indexCache = new Map<string, CiteIndex | null>();
  readonly inventoryText: string;
  /** Archivos de texto que el escáner conoce (documentos, manifiestos, despliegue). */
  readonly knownFiles: string[];
  private readonly repoPaths: string[];

  constructor(readonly inventory: ProjectInventory, readonly rootPath: string) {
    this.inventoryText = JSON.stringify({
      layout: inventory.layout,
      repositories: inventory.repositories,
      otherFolders: inventory.otherFolders,
      manifests: inventory.manifests,
      commands: inventory.commands,
      deployment: inventory.deployment,
      tree: inventory.tree,
      domain: inventory.domain
    });
    this.knownFiles = [
      ...new Set([
        ...inventory.documents.map((d) => d.path),
        ...inventory.manifests.map((m) => m.path),
        ...inventory.deployment.map((d) => d.path)
      ])
    ];
    this.repoPaths = inventory.repositories.map((r) => r.path).filter((p) => p !== ".");
  }

  private insideRoot(rel: string): string | null {
    const abs = path.resolve(this.rootPath, rel);
    const back = path.relative(this.rootPath, abs);
    if (back.startsWith("..") || path.isAbsolute(back)) return null;
    return abs;
  }

  private existing(rel: string): ResolvedSource | null {
    const abs = this.insideRoot(rel);
    if (!abs || !fs.existsSync(abs)) return null;
    const cleanRel = path.relative(this.rootPath, abs).replace(/\\/g, "/") || ".";
    if (isSecretFile(cleanRel)) return { kind: "secret", rel: cleanRel };
    const isDir = fs.statSync(abs).isDirectory();
    return { kind: isDir ? "dir" : "file", rel: cleanRel, abs };
  }

  resolve(rawSource: string): ResolvedSource {
    const norm = normalizeSourcePath(rawSource);
    if (!norm) return { kind: "missing" };
    if (/^inventario\b/i.test(norm)) return { kind: "inventory" };
    if (isSecretFile(norm)) return { kind: "secret", rel: norm };
    if (!this.insideRoot(norm)) return { kind: "outside", rel: norm };

    const direct = this.existing(norm);
    if (direct) return direct;
    for (const repo of this.repoPaths) {
      const viaRepo = this.existing(`${repo}/${norm}`);
      if (viaRepo) return viaRepo;
    }
    if (!norm.includes("/")) {
      const lower = norm.toLowerCase();
      const matches = this.knownFiles.filter((f) => path.posix.basename(f).toLowerCase() === lower);
      if (matches.length >= 1) return this.existing(matches[0]!) ?? { kind: "missing", rel: norm };
    }
    return { kind: "missing", rel: norm };
  }

  /** ¿Existe esta ruta (archivo o carpeta) relativa a la raíz o a algún repo? */
  pathExists(rel: string): boolean {
    const clean = rel.replace(/\/\*+$/, "").replace(/\/+$/, "");
    if (!clean) return false;
    if (this.existing(clean)) return true;
    return this.repoPaths.some((repo) => this.existing(`${repo}/${clean}`) !== null);
  }

  read(rel: string): string | null {
    if (this.cache.has(rel)) return this.cache.get(rel)!;
    let content: string | null = null;
    const abs = this.insideRoot(rel);
    try {
      if (abs && !isSecretFile(rel)) {
        const stat = fs.statSync(abs);
        if (stat.isFile() && stat.size <= 2 * 1024 * 1024) content = fs.readFileSync(abs, "utf-8");
      }
    } catch {}
    this.cache.set(rel, content);
    return content;
  }

  index(rel: string): CiteIndex | null {
    if (this.indexCache.has(rel)) return this.indexCache.get(rel)!;
    const content = this.read(rel);
    const idx = content === null ? null : buildCiteIndex(content);
    this.indexCache.set(rel, idx);
    return idx;
  }

  /** Busca la cita en todos los archivos conocidos; devuelve dónde la encontró. */
  findCiteAnywhere(cita: string, exclude?: string): { rel: string; line: number } | null {
    for (const rel of this.knownFiles) {
      if (rel === exclude) continue;
      const line = this.index(rel)?.find(cita) ?? null;
      if (line !== null) return { rel, line };
    }
    return null;
  }
}
