import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ProjectInventory } from "../ProjectInventory.js";

/**
 * Evidencia de primer nivel sobre cómo se trabaja de verdad: lo que muestra el historial
 * de la rama activa (merges de PR, squash con «(#N)», commits directos), las ramas
 * remotas y CODEOWNERS. Sirve para contrastar lo que dicen los documentos del proceso.
 */

export interface RepoGitEvidence {
  repo: string;
  branch: string | null;
  remoteBranches: string[];
  /** Sobre los últimos commits de primer padre de la rama activa. */
  sampled: number;
  prMerges: number;
  squashPrs: number;
  directCommits: number;
  lastPr: { date: string; number: string | null; author: string } | null;
  lastDirect: { date: string; author: string; subject: string } | null;
  prAuthors: string[];
  codeowners: string[];
}

const PR_MERGE_RE = /^Merge pull request #(\d+)|^Merged in |^Merge branch .+ into |^Merged PR (\d+)|^See merge request .+!(\d+)/i;
const SQUASH_RE = /\(#(\d+)\)\s*$/;

function git(dir: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf-8",
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
}

function readCodeowners(repoDir: string): string[] {
  for (const rel of [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS", ".gitlab/CODEOWNERS"]) {
    try {
      const text = fs.readFileSync(path.join(repoDir, rel), "utf-8");
      return text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .slice(0, 10);
    } catch {}
  }
  return [];
}

export function collectGitEvidence(inventory: ProjectInventory, sample = 50): RepoGitEvidence[] {
  const result: RepoGitEvidence[] = [];
  for (const repo of inventory.repositories) {
    const dir = repo.path === "." ? inventory.rootPath : path.join(inventory.rootPath, repo.path);
    const log = git(dir, ["log", "--first-parent", `-n`, String(sample), "--format=%cI%x09%an%x09%P%x09%s"]);
    if (log === null) continue;

    let prMerges = 0;
    let squashPrs = 0;
    let directCommits = 0;
    let lastPr: RepoGitEvidence["lastPr"] = null;
    let lastDirect: RepoGitEvidence["lastDirect"] = null;
    const prAuthors = new Map<string, number>();
    const lines = log.split("\n").filter(Boolean);

    for (const line of lines) {
      const [date = "", author = "", parents = "", ...rest] = line.split("\t");
      const subject = rest.join("\t");
      const isMerge = parents.trim().split(/\s+/).length > 1;
      const merge = subject.match(PR_MERGE_RE);
      const squash = subject.match(SQUASH_RE);
      if (isMerge && merge) {
        prMerges++;
      } else if (!isMerge && squash) {
        squashPrs++;
      } else if (!isMerge) {
        directCommits++;
        if (!lastDirect) lastDirect = { date: date.slice(0, 10), author, subject: subject.slice(0, 100) };
        continue;
      } else {
        continue; // merge sin forma de PR (p. ej. merge local de ramas)
      }
      prAuthors.set(author, (prAuthors.get(author) ?? 0) + 1);
      if (!lastPr) {
        const num = merge?.[1] ?? merge?.[2] ?? merge?.[3] ?? squash?.[1] ?? null;
        lastPr = { date: date.slice(0, 10), number: num, author };
      }
    }

    const refs = git(dir, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]) ?? "";
    const remoteBranches = refs
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => r && !/\/HEAD$/.test(r) && r !== "origin")
      .map((r) => r.replace(/^[^/]+\//, ""))
      .filter((r, i, all) => all.indexOf(r) === i)
      .slice(0, 20);

    result.push({
      repo: repo.path,
      branch: repo.branch,
      remoteBranches,
      sampled: lines.length,
      prMerges,
      squashPrs,
      directCommits,
      lastPr,
      lastDirect,
      prAuthors: [...prAuthors.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a).slice(0, 3),
      codeowners: readCodeowners(dir)
    });
  }
  return result;
}

/** Una línea por repo con lo que muestra git. */
export function describeGitEvidence(e: RepoGitEvidence): string {
  const prs = e.prMerges + e.squashPrs;
  const parts = [
    `en los últimos ${e.sampled} commits de \`${e.branch ?? "HEAD"}\`: ${prs} entraron por PR (${e.prMerges} merges, ${e.squashPrs} squash) y ${e.directCommits} directos`,
    e.lastPr ? `último PR${e.lastPr.number ? ` #${e.lastPr.number}` : ""} el ${e.lastPr.date} por ${e.lastPr.author}` : null,
    e.lastDirect ? `último commit directo el ${e.lastDirect.date}` : null,
    e.prAuthors.length ? `fusionan PR: ${e.prAuthors.join(", ")}` : null,
    e.remoteBranches.length ? `ramas remotas: ${e.remoteBranches.join(", ")}` : null,
    e.codeowners.length ? `CODEOWNERS: ${e.codeowners.join(" | ")}` : null
  ].filter(Boolean);
  return `- \`${e.repo}\`: ${parts.join("; ")}`;
}
