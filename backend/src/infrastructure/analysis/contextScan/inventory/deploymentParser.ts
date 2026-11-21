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

const TRIVIAL_ACTIONS = /^actions\/(checkout|cache|upload-artifact|download-artifact)@/i;

function shortCmd(cmd: string): string {
  const clean = cmd.replace(/\$\{\{\s*secrets\.([\w-]+)\s*\}\}/g, "<$1>").replace(/\s+/g, " ").trim();
  return clean.length > 110 ? `${clean.slice(0, 107)}…` : clean;
}

/**
 * Resume un workflow de GitHub Actions en una línea: qué lo dispara, dónde corre,
 * qué acciones usa (sin las triviales) y qué comandos ejecuta.
 */
export function summarizeGithubWorkflow(text: string): string {
  const lines = text.split(/\r?\n/);
  const triggers: string[] = [];
  const commands: string[] = [];
  const actions: string[] = [];
  const stepNames: string[] = [];
  let runsOn = "";
  let currentEvent = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const ev = trimmed.match(/^(push|pull_request|workflow_dispatch|schedule|release|pull_request_target):/);
    if (ev && ev[1]) currentEvent = ev[1];
    const inlineOn = trimmed.match(/^on:\s*\[?([\w,\s-]+)\]?\s*$/);
    if (inlineOn && inlineOn[1]) triggers.push(...inlineOn[1].split(",").map((t) => t.trim()).filter(Boolean));

    const branches = trimmed.match(/^branches:\s*\[([^\]]*)\]/);
    if (branches && branches[1]) {
      triggers.push(`${currentEvent || "push"} a ${branches[1].split(",").map((b) => b.trim().replace(/["']/g, "")).join(", ")}`);
    } else if (/^branches:\s*$/.test(trimmed)) {
      const list: string[] = [];
      for (let j = i + 1; j < lines.length && /^\s*-\s/.test(lines[j]!); j++) list.push(lines[j]!.trim().slice(2).replace(/["']/g, ""));
      if (list.length) triggers.push(`${currentEvent || "push"} a ${list.join(", ")}`);
    } else if (/^workflow_dispatch:/.test(trimmed)) {
      triggers.push("manual (workflow_dispatch)");
    }

    const ro = trimmed.match(/^runs-on:\s*(.+)$/);
    if (ro && ro[1] && !runsOn) runsOn = ro[1].trim();

    const stepName = trimmed.match(/^-\s*name:\s*(.+)$/);
    if (stepName && stepName[1]) stepNames.push(stepName[1].replace(/["']/g, "").trim());

    const uses = trimmed.match(/^-?\s*uses:\s*(\S+)/);
    if (uses && uses[1] && !TRIVIAL_ACTIONS.test(uses[1])) actions.push(uses[1]);

    const run = line.match(/^(\s*)-?\s*run:\s*(.*)$/);
    if (run) {
      const inline = (run[2] ?? "").trim();
      if (inline && inline !== "|" && inline !== ">") {
        commands.push(shortCmd(inline));
      } else {
        const baseIndent = (run[1] ?? "").length;
        for (let j = i + 1; j < lines.length; j++) {
          const next = lines[j]!;
          if (!next.trim()) continue;
          if (next.length - next.trimStart().length <= baseIndent) break;
          commands.push(shortCmd(next.trim()));
        }
      }
    }
  }

  const parts = [
    triggers.length ? [...new Set(triggers)].join("; ") : null,
    runsOn ? `corre en ${runsOn}` : null,
    actions.length ? `usa ${[...new Set(actions)].slice(0, 4).join(", ")}` : null,
    stepNames.length ? `pasos: ${stepNames.slice(0, 5).join(", ")}` : null,
    commands.length ? `ejecuta ${commands.slice(0, 6).map((c) => `\`${c}\``).join(" → ")}` : null
  ].filter(Boolean);
  return parts.join(" · ");
}

export function parseDeploymentFile(relPath: string, fullPath: string, repo: string): DeploymentFileInfo | null {
  const norm = relPath.replace(/\\/g, "/");
  const kind = deploymentKind(norm, path.posix.basename(norm).toLowerCase());
  if (!kind) return null;

  const facts: string[] = [];
  let summary: string | undefined;
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    if (kind === "github-workflow") summary = summarizeGithubWorkflow(text) || undefined;
    for (const rawLine of text.split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (FACT_KEYWORDS.some((pat) => pat.test(trimmed))) {
        facts.push(trimmed.slice(0, 200));
        if (facts.length >= 15) break;
      }
    }
  } catch {}

  return { path: relPath, repo, kind, facts, summary };
}
