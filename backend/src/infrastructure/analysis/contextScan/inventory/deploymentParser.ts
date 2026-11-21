import fs from "node:fs";
import path from "node:path";
import { DeploymentFileInfo, DeploymentKind } from "./types.js";

function deploymentKind(norm: string, lowerName: string): DeploymentKind | null {
  if (
    (norm.includes("/.github/workflows/") || norm.startsWith(".github/workflows/")) &&
    (lowerName.endsWith(".yml") || lowerName.endsWith(".yaml"))
  ) {
    return "github-workflow";
  }
  if (lowerName === ".gitlab-ci.yml") return "gitlab-ci";
  if (lowerName === "azure-pipelines.yml") return "azure-pipelines";
  if (lowerName.startsWith("dockerfile")) return "dockerfile";
  if (
    (lowerName.startsWith("docker-compose") || lowerName === "compose.yml") &&
    (lowerName.endsWith(".yml") || lowerName.endsWith(".yaml"))
  ) {
    return "docker-compose";
  }
  if (lowerName.startsWith("nginx") && lowerName.endsWith(".conf")) return "nginx";
  if (norm.includes("/nginx/") && lowerName.endsWith(".conf")) return "nginx";
  if (lowerName === "procfile") return "procfile";
  if (lowerName.startsWith("ecosystem.config.") || (lowerName.startsWith("pm2") && lowerName.endsWith(".json"))) {
    return "pm2";
  }
  return null;
}

const FACT_KEYWORDS = [
  /^\s*EXPOSE\b/i,
  /^\s*FROM\b/i,
  /^\s*(?:CMD|ENTRYPOINT)\b/i,
  /ports:/i,
  /-\s*"?[0-9]+:[0-9]+"?/i,
  /^\s*listen\b/i,
  /^\s*server_name\b/i,
  /^\s*root\b/i,
  /^\s*proxy_pass\b/i,
  /runs-on:/i,
  /^\s*run:/i,
  /uses:/i,
  /pm2/i,
  /script:/i,
  /^(?:web|worker):/i
];

export function parseDeploymentFile(relPath: string, fullPath: string, repo: string): DeploymentFileInfo | null {
  const norm = relPath.replace(/\\/g, "/");
  const kind = deploymentKind(norm, path.posix.basename(norm).toLowerCase());
  if (!kind) return null;

  const facts: string[] = [];
  try {
    for (const rawLine of fs.readFileSync(fullPath, "utf-8").split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (FACT_KEYWORDS.some((pat) => pat.test(trimmed))) {
        facts.push(trimmed.slice(0, 200));
        if (facts.length >= 15) break;
      }
    }
  } catch {}

  return { path: relPath, repo, kind, facts };
}
