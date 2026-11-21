import fs from "node:fs";
import path from "node:path";
import { IGNORED_DIRS } from "../ScanIgnore.js";
import { readGitMeta, normalizeRemote, isAncestor, GitMeta } from "./gitMeta.js";
import { DocumentRef, OtherFolder, RepoInfo } from "./types.js";

/**
 * Clasifica cada carpeta antes de analizar:
 * - repo principal: aporta manifiestos, comandos y documentos;
 * - submódulo: aporta, pero se anota a qué repo pertenece;
 * - copia de trabajo (`.git` es un archivo con `gitdir: …/worktrees/x`): no aporta;
 * - clon duplicado (mismo remoto y mismo HEAD, o un ancestro): no aporta;
 * - carpeta sin git (solo cuando hay repos): no aporta; se lista con su última modificación.
 */

interface GitEntry {
  path: string;
  name: string;
  workDir: string;
  meta: GitMeta;
}

export interface FolderClassification {
  repositories: RepoInfo[];
  otherFolders: OtherFolder[];
  /** Rutas relativas que el recorrido no debe analizar. */
  excludedPaths: Set<string>;
}

const toPosix = (p: string) => p.replace(/\\/g, "/");

/**
 * Ruta real: en Windows la raíz puede llegar con nombres cortos 8.3 (ESTADU~1) y git
 * escribe la ruta larga, así que se comparan ambas ya resueltas.
 */
function realPath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

function relInside(rootPath: string, absPath: string): string | null {
  const rel = toPosix(path.relative(realPath(rootPath), realPath(absPath)));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel || ".";
}

function shouldSkipDir(name: string): boolean {
  return IGNORED_DIRS.has(name.toLowerCase()) || name === ".git";
}

/** Busca todas las entradas `.git` (directorios o archivos) hasta `maxDepth`. */
function findGitEntries(rootPath: string, maxDepth: number, useGit: boolean): GitEntry[] {
  const found: GitEntry[] = [];
  const visit = (dir: string, rel: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.name === ".git")) {
      const meta = readGitMeta(dir, useGit);
      if (meta) {
        const repoRel = rel || ".";
        found.push({
          path: repoRel,
          name: repoRel === "." ? path.basename(path.resolve(rootPath)) : path.posix.basename(repoRel),
          workDir: dir,
          meta
        });
        // Una copia de trabajo es el mismo repo: no hay nada propio que buscar dentro.
        if (meta.info.kind === "worktree") return;
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || shouldSkipDir(e.name)) continue;
      visit(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name, depth + 1);
    }
  };
  visit(rootPath, "", 0);
  return found;
}

/** Carpeta de trabajo dueña de un directorio de git compartido (`…/repo/.git` → `…/repo`). */
function ownerWorkDir(commonDir: string): string | null {
  return path.basename(commonDir) === ".git" ? path.dirname(commonDir) : null;
}

function describeOwner(rootPath: string, absOwner: string | null): { ownerPath: string | null; note?: string } {
  if (!absOwner) return { ownerPath: null, note: "su repo dueño no tiene carpeta de trabajo (repo bare)" };
  const rel = relInside(rootPath, absOwner);
  if (rel) return { ownerPath: rel };
  // Nunca se envía la ruta local completa: solo el nombre de la carpeta.
  return { ownerPath: null, note: `su repo dueño está fuera de la carpeta escaneada (${path.basename(absOwner)})` };
}

function tieBreak(a: GitEntry, b: GitEntry, worktreeOwners: Set<string>): number {
  const aw = worktreeOwners.has(a.path) ? 0 : 1;
  const bw = worktreeOwners.has(b.path) ? 0 : 1;
  if (aw !== bw) return aw - bw;
  if (a.path.length !== b.path.length) return a.path.length - b.path.length;
  return a.path.localeCompare(b.path);
}

function lastModifiedOf(dir: string, maxEntries = 3000): string | null {
  let latest = 0;
  let seen = 0;
  const walk = (d: string) => {
    if (seen >= maxEntries) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (seen++ >= maxEntries) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!shouldSkipDir(e.name)) walk(full);
      } else if (e.isFile()) {
        try {
          latest = Math.max(latest, fs.statSync(full).mtimeMs);
        } catch {}
      }
    }
  };
  walk(dir);
  return latest > 0 ? new Date(latest).toISOString() : null;
}

/**
 * Carpetas sin git: solo existen cuando la raíz no es un repo y hay repos dentro.
 * Una carpeta que contiene repos es solo un agrupador y se recorre; una que no
 * contiene ninguno es una carpeta sin git.
 */
function findNoGitFolders(rootPath: string, unitPaths: string[], maxDepth: number): OtherFolder[] {
  if (unitPaths.includes(".")) return [];
  const result: OtherFolder[] = [];
  const containsUnit = (rel: string) => unitPaths.some((u) => u.startsWith(`${rel}/`));

  const visit = (dir: string, rel: string, depth: number) => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      // Las carpetas ocultas (.github, .claude, .vscode…) son configuración, no proyectos.
      if (!e.isDirectory() || shouldSkipDir(e.name) || e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const childAbs = path.join(dir, e.name);
      if (unitPaths.includes(childRel)) continue;
      if (containsUnit(childRel)) {
        visit(childAbs, childRel, depth + 1);
        continue;
      }
      result.push({
        path: childRel,
        name: e.name,
        kind: "sin-git",
        ownerPath: null,
        branch: null,
        headCommit: null,
        lastModified: lastModifiedOf(childAbs),
        notes: []
      });
    }
  };
  visit(rootPath, "", 0);
  return result;
}

export function classifyFolders(rootPath: string, maxDepth: number, useGit: boolean): FolderClassification {
  const entries = findGitEntries(rootPath, maxDepth, useGit);
  const repositories: RepoInfo[] = [];
  const otherFolders: OtherFolder[] = [];

  const worktrees = entries.filter((e) => e.meta.info.kind === "worktree");
  const worktreeOwners = new Set<string>();

  for (const wt of worktrees) {
    const { ownerPath, note } = describeOwner(rootPath, ownerWorkDir(wt.meta.info.commonDir));
    if (ownerPath) worktreeOwners.add(ownerPath);
    otherFolders.push({
      path: wt.path,
      name: wt.name,
      kind: "copia-de-trabajo",
      ownerPath,
      branch: wt.meta.branch,
      headCommit: wt.meta.headCommit,
      lastModified: null,
      notes: note ? [note] : []
    });
  }

  for (const sub of entries.filter((e) => e.meta.info.kind === "submodule")) {
    const parentAbs = toPosix(sub.meta.info.gitDir).split("/.git/modules/")[0];
    const parentPath = parentAbs ? relInside(rootPath, parentAbs) ?? undefined : undefined;
    repositories.push({
      path: sub.path,
      name: sub.name,
      hasGit: true,
      headCommit: sub.meta.headCommit,
      remoteUrl: sub.meta.remoteUrl,
      branch: sub.meta.branch,
      kind: "submodulo",
      parentPath,
      notes: []
    });
  }

  // Repos normales: los que comparten remoto se comparan para encontrar clones duplicados.
  const repos = entries.filter((e) => e.meta.info.kind === "repo");
  const byRemote = new Map<string, GitEntry[]>();
  const standalone: GitEntry[] = [];
  for (const r of repos) {
    const key = normalizeRemote(r.meta.remoteUrl);
    if (!key) {
      standalone.push(r);
      continue;
    }
    byRemote.set(key, [...(byRemote.get(key) ?? []), r]);
  }

  const pushRepo = (r: GitEntry, notes: string[] = []) =>
    repositories.push({
      path: r.path,
      name: r.name,
      hasGit: true,
      headCommit: r.meta.headCommit,
      remoteUrl: r.meta.remoteUrl,
      branch: r.meta.branch,
      kind: "repo",
      notes
    });

  for (const r of standalone) pushRepo(r);

  for (const group of byRemote.values()) {
    if (group.length === 1) {
      pushRepo(group[0]!);
      continue;
    }
    const ordered = [...group].sort((a, b) => tieBreak(a, b, worktreeOwners));
    const behind = (a: GitEntry, b: GitEntry): boolean =>
      useGit &&
      !!a.meta.headCommit &&
      !!b.meta.headCommit &&
      a.meta.headCommit !== b.meta.headCommit &&
      isAncestor([b.workDir, a.workDir], a.meta.headCommit, b.meta.headCommit) === true;
    // El principal es el más avanzado: el que no está detrás de ningún otro.
    const primary = ordered.find((c) => !ordered.some((d) => d !== c && behind(c, d))) ?? ordered[0]!;
    pushRepo(primary);

    for (const other of ordered) {
      if (other === primary) continue;
      const sameHead = !!other.meta.headCommit && other.meta.headCommit === primary.meta.headCommit;
      if (sameHead || behind(other, primary)) {
        otherFolders.push({
          path: other.path,
          name: other.name,
          kind: "clon-duplicado",
          ownerPath: primary.path,
          branch: other.meta.branch,
          headCommit: other.meta.headCommit,
          lastModified: null,
          notes: [sameHead ? "mismo remoto y mismo commit" : "mismo remoto; su commit es anterior"]
        });
      } else {
        pushRepo(other, [`mismo remoto que ${primary.path}, pero con historial distinto`]);
      }
    }
  }

  const hasActiveRepos = repositories.some((r) => r.kind === "repo");
  if (hasActiveRepos) {
    otherFolders.push(...findNoGitFolders(rootPath, entries.map((e) => e.path), maxDepth));
  }

  repositories.sort((a, b) => a.path.localeCompare(b.path));
  otherFolders.sort((a, b) => a.path.localeCompare(b.path));

  return {
    repositories,
    otherFolders,
    excludedPaths: new Set(otherFolders.map((f) => f.path))
  };
}

const OBSOLETE_RE =
  /obsolet|ya no se (?:usa|mantiene)|descartad|deprecad|deprecated|reemplaza|reemplazad|superad|legacy|abandonad|no se mantiene/i;

/**
 * Si un documento de los repos activos dice que una carpeta sin git está obsoleta o
 * reemplazada, se anota con la fuente. Busca el nombre de la carpeta y mira el texto
 * alrededor (200 caracteres a cada lado).
 */
export function annotateNoGitFolders(rootPath: string, folders: OtherFolder[], documents: DocumentRef[]): void {
  const targets = folders.filter((f) => f.kind === "sin-git");
  if (targets.length === 0) return;

  for (const doc of documents) {
    if (doc.sizeBytes > 2 * 1024 * 1024) continue;
    let text: string;
    try {
      text = fs.readFileSync(path.join(rootPath, doc.path), "utf-8");
    } catch {
      continue;
    }
    for (const folder of targets) {
      if (folder.notes.some((n) => n.startsWith("un documento la marca"))) continue;
      const re = new RegExp(`(?<![\\w-])${folder.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const window = text.slice(Math.max(0, m.index - 200), m.index + folder.name.length + 200);
        if (OBSOLETE_RE.test(window)) {
          folder.notes.push(`un documento la marca como obsoleta o reemplazada (${doc.path})`);
          break;
        }
      }
    }
  }
}
