import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DateSource, InventoryFileInfo, RepoInfo } from "./types.js";

/** Fecha del último commit de cada archivo, por repo (ruta relativa al repo → fecha ISO). */
function gitDatesByRepo(rootPath: string, repositories: RepoInfo[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const repo of repositories) {
    const repoDir = repo.path === "." ? rootPath : path.join(rootPath, repo.path);
    try {
      const logOut = execFileSync(
        "git",
        ["-C", repoDir, "log", "--format=@@%cI", "--name-only", "--no-renames", "-n", "3000"],
        { encoding: "utf-8", timeout: 5000, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] }
      );
      const dates: Record<string, string> = {};
      let currentDate: string | null = null;
      for (const line of logOut.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("@@")) {
          currentDate = trimmed.slice(2);
        } else if (currentDate) {
          const normPath = trimmed.replace(/\\/g, "/");
          if (!dates[normPath]) dates[normPath] = currentDate;
        }
      }
      result[repo.path] = dates;
    } catch {}
  }
  return result;
}

/**
 * Fecha cada archivo: el último commit que lo tocó si hay git, si no su mtime.
 */
export function dateFiles(
  rootPath: string,
  filePaths: Iterable<string>,
  repositories: RepoInfo[],
  resolveRepo: (relPath: string) => string,
  useGit: boolean
): Record<string, InventoryFileInfo> {
  const byRepo = useGit ? gitDatesByRepo(rootPath, repositories) : {};
  const files: Record<string, InventoryFileInfo> = {};

  for (const filePath of filePaths) {
    const repo = resolveRepo(filePath);
    const relToRepo = repo === "." ? filePath : path.posix.relative(repo, filePath);

    let lastModified: string | null = null;
    let dateSource: DateSource = "mtime";
    const gitDate = byRepo[repo]?.[relToRepo];
    if (gitDate) {
      lastModified = gitDate;
      dateSource = "git";
    }

    let sizeBytes = 0;
    try {
      const stat = fs.statSync(path.join(rootPath, filePath));
      sizeBytes = stat.size;
      if (!lastModified) lastModified = stat.mtime.toISOString();
    } catch {
      if (!lastModified) lastModified = new Date().toISOString();
    }

    files[filePath] = { path: filePath, sizeBytes, lastModified, dateSource };
  }
  return files;
}
