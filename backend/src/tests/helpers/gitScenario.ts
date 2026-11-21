import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Pasos declarativos para construir un proyecto con historial de git real.
 * Las rutas `repo` y `path` son relativas a la raíz temporal del fixture.
 */
export type GitScenarioStep =
  | { op: "overlay"; from: string }
  | { op: "init"; repo: string; remote?: string; branch?: string }
  | { op: "commit"; repo: string; message: string; date: string; author: string }
  | { op: "branch"; repo: string; name: string }
  | { op: "switch"; repo: string; name: string }
  | { op: "merge"; repo: string; branch: string; message: string; date: string; author: string }
  | { op: "worktree"; repo: string; path: string; branch: string }
  | { op: "clone"; repo: string; path: string }
  | { op: "remote-refs"; repo: string; branches: string[] };

export interface GitScenario {
  description?: string;
  steps: GitScenarioStep[];
}

function parseAuthor(author: string): { name: string; email: string } {
  const m = author.match(/^(.+?)\s*<([^>]+)>$/);
  if (m && m[1] && m[2]) return { name: m[1].trim(), email: m[2].trim() };
  const slug = author
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  return { name: author, email: `${slug}@ejemplo.test` };
}

function git(cwd: string, args: string[], env?: Record<string, string>): string {
  return execFileSync("git", ["-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf-8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env }
  });
}

function signatureEnv(author: string, date: string): Record<string, string> {
  const { name, email } = parseAuthor(author);
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date
  };
}

export function runGitScenario(
  root: string,
  scenario: GitScenario,
  overlay: (from: string, to: string) => void
): void {
  for (const step of scenario.steps) {
    switch (step.op) {
      case "overlay":
        overlay(step.from, root);
        break;
      case "init": {
        const dir = path.join(root, step.repo);
        git(dir, ["init", "-q", "-b", step.branch ?? "main"]);
        if (step.remote) git(dir, ["remote", "add", "origin", step.remote]);
        break;
      }
      case "commit": {
        const dir = path.join(root, step.repo);
        git(dir, ["add", "-A"]);
        git(dir, ["commit", "-q", "--allow-empty", "-m", step.message], signatureEnv(step.author, step.date));
        break;
      }
      case "branch":
        git(path.join(root, step.repo), ["switch", "-q", "-c", step.name]);
        break;
      case "switch":
        git(path.join(root, step.repo), ["switch", "-q", step.name]);
        break;
      case "merge":
        git(
          path.join(root, step.repo),
          ["merge", "-q", "--no-ff", "-m", step.message, step.branch],
          signatureEnv(step.author, step.date)
        );
        break;
      case "worktree": {
        const repoDir = path.join(root, step.repo);
        const target = path.relative(repoDir, path.join(root, step.path));
        git(repoDir, ["worktree", "add", "-q", "-b", step.branch, target]);
        break;
      }
      case "clone": {
        const source = path.join(root, step.repo);
        git(root, ["clone", "-q", source, step.path]);
        // Un clon duplicado apunta al mismo remoto que el original, no a la ruta local.
        let remote = "";
        try {
          remote = git(source, ["config", "--get", "remote.origin.url"]).trim();
        } catch {}
        if (remote) git(path.join(root, step.path), ["remote", "set-url", "origin", remote]);
        break;
      }
      case "remote-refs": {
        const dir = path.join(root, step.repo);
        for (const b of step.branches) {
          git(dir, ["update-ref", `refs/remotes/origin/${b}`, `refs/heads/${b}`]);
        }
        break;
      }
    }
  }
}
