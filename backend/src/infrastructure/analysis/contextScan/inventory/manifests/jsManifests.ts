import fs from "node:fs";
import path from "node:path";
import { CommandInfo, ParsedManifest } from "../types.js";

const JS_FRAMEWORKS = [
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
  "expo",
  "react-native",
  "svelte"
];

export function parsePackageJson(
  relPath: string,
  fullPath: string,
  repo: string,
  manifestDir: string
): ParsedManifest {
  let name: string | null = null;
  let version: string | null = null;
  let dependencies: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};
  let workspaces: string[] = [];
  const commands: CommandInfo[] = [];

  const hasPnpm = fs.existsSync(path.join(manifestDir, "pnpm-lock.yaml"));
  const hasYarn = fs.existsSync(path.join(manifestDir, "yarn.lock"));
  const pkgManager = hasPnpm ? "pnpm" : hasYarn ? "yarn" : "npm";

  try {
    const json = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    name = typeof json.name === "string" ? json.name : null;
    version = typeof json.version === "string" ? json.version : null;
    if (json.dependencies && typeof json.dependencies === "object") dependencies = json.dependencies;
    if (json.devDependencies && typeof json.devDependencies === "object") devDependencies = json.devDependencies;
    if (Array.isArray(json.workspaces)) {
      workspaces = json.workspaces;
    } else if (json.workspaces && Array.isArray(json.workspaces.packages)) {
      workspaces = json.workspaces.packages;
    }

    if (json.scripts && typeof json.scripts === "object") {
      for (const [scriptName, scriptCmd] of Object.entries(json.scripts)) {
        let runAs: string;
        if (scriptName === "test") runAs = `${pkgManager} test`;
        else if (scriptName === "start") runAs = `${pkgManager} start`;
        else runAs = `${pkgManager} run ${scriptName}`;
        commands.push({ repo, source: relPath, name: scriptName, command: String(scriptCmd), runAs });
      }
    }
  } catch {}

  const frameworks: string[] = [];
  for (const dep of Object.keys({ ...dependencies, ...devDependencies })) {
    if (JS_FRAMEWORKS.includes(dep.toLowerCase()) && !frameworks.includes(dep)) frameworks.push(dep);
  }

  return {
    info: { path: relPath, repo, kind: "npm", name, version, frameworks, dependencies, devDependencies, workspaces },
    commands,
    isWorkspace: workspaces.length > 0
  };
}

export function parseComposerJson(relPath: string, fullPath: string, repo: string): ParsedManifest {
  let name: string | null = null;
  let version: string | null = null;
  let dependencies: Record<string, string> = {};
  const commands: CommandInfo[] = [];
  try {
    const json = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    name = json.name || null;
    version = json.version || null;
    if (json.require && typeof json.require === "object") dependencies = json.require;
    if (json.scripts && typeof json.scripts === "object") {
      for (const scriptName of Object.keys(json.scripts)) {
        commands.push({
          repo,
          source: relPath,
          name: scriptName,
          command: `composer run ${scriptName}`,
          runAs: `composer run ${scriptName}`
        });
      }
    }
  } catch {}

  return {
    info: {
      path: relPath,
      repo,
      kind: "composer",
      name,
      version,
      frameworks: [],
      dependencies,
      devDependencies: {},
      workspaces: []
    },
    commands,
    isWorkspace: false
  };
}

/** pnpm-workspace.yaml, nx.json, turbo.json, lerna.json: solo marcan un workspace. */
export function parseWorkspaceMarker(relPath: string, repo: string): ParsedManifest {
  return {
    info: {
      path: relPath,
      repo,
      kind: "npm",
      name: null,
      version: null,
      frameworks: [],
      dependencies: {},
      devDependencies: {},
      workspaces: []
    },
    commands: [],
    isWorkspace: true
  };
}
