import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Lectura de metadatos de git de una carpeta: tipo de `.git`, HEAD, rama y remoto.
 * Usa el binario de git si está permitido y, si falla, lee los archivos de `.git`.
 */

export type GitEntryKind = "repo" | "worktree" | "submodule";

export interface GitDirInfo {
  kind: GitEntryKind;
  /** Directorio de git propio de esta carpeta (HEAD vive aquí). */
  gitDir: string;
  /** Directorio de git compartido (refs, packed-refs, config). */
  commonDir: string;
}

export interface GitMeta {
  info: GitDirInfo;
  headCommit: string | null;
  branch: string | null;
  remoteUrl: string | null;
}

function runGit(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"]
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Determina qué es el `.git` de una carpeta:
 * - directorio → repo normal;
 * - archivo `gitdir: …/worktrees/x` → copia de trabajo (`git worktree`);
 * - archivo `gitdir: …/.git/modules/x` → submódulo.
 */
export function resolveGitDir(workDir: string): GitDirInfo | null {
  const dotGit = path.join(workDir, ".git");
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(dotGit);
  } catch {
    return null;
  }
  if (stat.isDirectory()) {
    return { kind: "repo", gitDir: dotGit, commonDir: dotGit };
  }
  if (!stat.isFile()) return null;

  const content = readText(dotGit) ?? "";
  const m = content.match(/^gitdir:\s*(.+)$/m);
  if (!m || !m[1]) return null;
  const gitDir = path.resolve(workDir, m[1].trim());
  const norm = gitDir.replace(/\\/g, "/");

  if (/\/worktrees\/[^/]+\/?$/.test(norm)) {
    const commondirFile = readText(path.join(gitDir, "commondir"));
    const commonDir = commondirFile
      ? path.resolve(gitDir, commondirFile.trim())
      : path.resolve(gitDir, "..", "..");
    return { kind: "worktree", gitDir, commonDir };
  }
  if (/\/modules\//.test(norm)) {
    return { kind: "submodule", gitDir, commonDir: gitDir };
  }
  return { kind: "repo", gitDir, commonDir: gitDir };
}

function resolveRef(info: GitDirInfo, ref: string): string | null {
  for (const base of [info.gitDir, info.commonDir]) {
    const direct = readText(path.join(base, ref));
    if (direct && /^[0-9a-f]{40}/i.test(direct.trim())) return direct.trim().slice(0, 40);
  }
  const packed = readText(path.join(info.commonDir, "packed-refs"));
  if (packed) {
    for (const line of packed.split(/\r?\n/)) {
      const [sha, name] = line.trim().split(" ");
      if (name === ref && sha && /^[0-9a-f]{40}$/i.test(sha)) return sha;
    }
  }
  return null;
}

/** Quita credenciales de un remoto: https://user:token@host/x → https://host/x */
export function sanitizeRemote(url: string): string {
  return url.trim().replace(/^(https?:\/\/)[^/@]+@([^\s]+)$/i, "$1$2");
}

/**
 * Forma comparable de un remoto: sin protocolo, usuario, `.git` ni barra final.
 * `git@github.com:org/x.git` y `https://github.com/org/x` quedan iguales.
 */
export function normalizeRemote(url: string | null): string | null {
  if (!url) return null;
  let u = url.trim().toLowerCase();
  u = u.replace(/^[a-z+]+:\/\//, "");
  u = u.replace(/^[^@/]+@/, "");
  u = u.replace(/^([^/:]+):(?!\d)/, "$1/");
  u = u.replace(/\/+$/, "").replace(/\.git$/, "");
  return u || null;
}

export function readGitMeta(workDir: string, useGit: boolean): GitMeta | null {
  const info = resolveGitDir(workDir);
  if (!info) return null;

  let headCommit: string | null = null;
  let branch: string | null = null;
  let remoteUrl: string | null = null;

  if (useGit) {
    headCommit = runGit(workDir, ["rev-parse", "HEAD"]);
    const abbrev = runGit(workDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
    branch = abbrev && abbrev !== "HEAD" ? abbrev : null;
    remoteUrl = runGit(workDir, ["config", "--get", "remote.origin.url"]);
  }

  const headContent = readText(path.join(info.gitDir, "HEAD"))?.trim() ?? "";
  if (headContent.startsWith("ref: ")) {
    const ref = headContent.slice(5).trim();
    if (!branch && ref.startsWith("refs/heads/")) branch = ref.slice("refs/heads/".length);
    if (!headCommit) headCommit = resolveRef(info, ref);
  } else if (!headCommit && /^[0-9a-f]{40}$/i.test(headContent)) {
    headCommit = headContent;
  }

  if (!remoteUrl) {
    const config = readText(path.join(info.commonDir, "config"));
    const m = config?.match(/\[remote\s+"origin"\][\s\S]*?url\s*=\s*([^\r\n]+)/i);
    if (m && m[1]) remoteUrl = m[1].trim();
  }

  return { info, headCommit, branch, remoteUrl: remoteUrl ? sanitizeRemote(remoteUrl) : null };
}

/**
 * ¿`ancestor` es ancestro de `descendant`? Prueba en cada carpeta dada, porque un
 * clon puede no tener los objetos del otro. Devuelve null si no se pudo saber.
 */
export function isAncestor(dirs: string[], ancestor: string, descendant: string): boolean | null {
  for (const dir of dirs) {
    try {
      execFileSync("git", ["-C", dir, "merge-base", "--is-ancestor", ancestor, descendant], {
        timeout: 5000,
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore"]
      });
      return true;
    } catch (err: any) {
      if (err?.status === 1) return false;
    }
  }
  return null;
}
