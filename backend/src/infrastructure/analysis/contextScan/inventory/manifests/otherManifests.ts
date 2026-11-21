import fs from "node:fs";
import { ManifestKind, ParsedManifest } from "../types.js";

const PY_FRAMEWORKS = ["django", "flask", "fastapi"];

function simpleManifest(
  relPath: string,
  repo: string,
  kind: ManifestKind,
  name: string | null,
  version: string | null,
  dependencies: Record<string, string>,
  frameworks: string[] = []
): ParsedManifest {
  return {
    info: { path: relPath, repo, kind, name, version, frameworks, dependencies, devDependencies: {}, workspaces: [] },
    commands: [],
    isWorkspace: false
  };
}

export function parseRequirementsTxt(relPath: string, fullPath: string, repo: string): ParsedManifest {
  const dependencies: Record<string, string> = {};
  const frameworks: string[] = [];
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const p0 = line.split(/[==|>=|<=|~=]/)[0];
      const pkg = p0?.trim();
      if (!pkg) continue;
      dependencies[pkg] = line.slice(pkg.length).replace(/^[=><~]+/, "").trim() || "*";
      if (PY_FRAMEWORKS.includes(pkg.toLowerCase()) && !frameworks.includes(pkg)) frameworks.push(pkg);
    }
  } catch {}
  return simpleManifest(relPath, repo, "pip", null, null, dependencies, frameworks);
}

export function parsePyproject(relPath: string, fullPath: string, repo: string): ParsedManifest {
  let name: string | null = null;
  let version: string | null = null;
  const dependencies: Record<string, string> = {};
  const frameworks: string[] = [];
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const nameMatch = text.match(/name\s*=\s*"([^"]+)"/);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];
    const verMatch = text.match(/version\s*=\s*"([^"]+)"/);
    if (verMatch && verMatch[1]) version = verMatch[1];

    const depBlockMatch = text.match(
      /(?:\[project\.dependencies\]|\[tool\.poetry\.dependencies\])([\s\S]*?)(?:\[|$)/i
    );
    if (depBlockMatch && depBlockMatch[1]) {
      for (const line of depBlockMatch[1].split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const m = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*["']?([^"'\r\n]+)["']?/);
        if (m && m[1] && m[2]) {
          dependencies[m[1]] = m[2];
          if (PY_FRAMEWORKS.includes(m[1].toLowerCase()) && !frameworks.includes(m[1])) frameworks.push(m[1]);
        }
      }
    }
  } catch {}
  return simpleManifest(relPath, repo, "pyproject", name, version, dependencies, frameworks);
}

export function parseGoMod(relPath: string, fullPath: string, repo: string): ParsedManifest {
  let name: string | null = null;
  let version: string | null = null;
  const dependencies: Record<string, string> = {};
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const modMatch = text.match(/^module\s+([^\r\n]+)/m);
    if (modMatch && modMatch[1]) name = modMatch[1].trim();
    const goVerMatch = text.match(/^go\s+([^\r\n]+)/m);
    if (goVerMatch && goVerMatch[1]) version = goVerMatch[1].trim();
    const reqRegex = /require\s+([^\s]+)\s+([^\s\r\n]+)/g;
    let rm: RegExpExecArray | null;
    while ((rm = reqRegex.exec(text)) !== null) {
      if (rm[1] && rm[2]) dependencies[rm[1]] = rm[2];
    }
  } catch {}
  return simpleManifest(relPath, repo, "go", name, version, dependencies);
}

export function parseCargoToml(relPath: string, fullPath: string, repo: string): ParsedManifest {
  let name: string | null = null;
  let version: string | null = null;
  const dependencies: Record<string, string> = {};
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const nameMatch = text.match(/\[package\][\s\S]*?name\s*=\s*"([^"]+)"/i);
    if (nameMatch && nameMatch[1]) name = nameMatch[1];
    const verMatch = text.match(/\[package\][\s\S]*?version\s*=\s*"([^"]+)"/i);
    if (verMatch && verMatch[1]) version = verMatch[1];
    const depMatch = text.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/i);
    if (depMatch && depMatch[1]) {
      for (const line of depMatch[1].split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const m = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*["']?([^"'\r\n]+)["']?/);
        if (m && m[1] && m[2]) dependencies[m[1]] = m[2];
      }
    }
  } catch {}
  return simpleManifest(relPath, repo, "cargo", name, version, dependencies);
}

export function parseGemfile(relPath: string, fullPath: string, repo: string): ParsedManifest {
  const dependencies: Record<string, string> = {};
  try {
    const text = fs.readFileSync(fullPath, "utf-8");
    const gemRegex = /gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/g;
    let gm: RegExpExecArray | null;
    while ((gm = gemRegex.exec(text)) !== null) {
      if (gm[1]) dependencies[gm[1]] = gm[2] || "*";
    }
  } catch {}
  return simpleManifest(relPath, repo, "gem", null, null, dependencies);
}
