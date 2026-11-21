import path from "node:path";
import { ParsedManifest } from "../types.js";
import { parsePackageJson, parseComposerJson, parseWorkspaceMarker } from "./jsManifests.js";
import { parseCsproj, parseSln, parsePom, parseGradle } from "./dotnetJvmManifests.js";
import {
  parseRequirementsTxt,
  parsePyproject,
  parseGoMod,
  parseCargoToml,
  parseGemfile
} from "./otherManifests.js";

const WORKSPACE_MARKERS = new Set(["pnpm-workspace.yaml", "nx.json", "turbo.json", "lerna.json"]);

/** Devuelve el manifiesto parseado si el archivo es uno conocido; si no, null. */
export function parseManifest(
  relPath: string,
  fullPath: string,
  repo: string,
  manifestDir: string
): ParsedManifest | null {
  const fileName = path.posix.basename(relPath.replace(/\\/g, "/"));
  const lowerName = fileName.toLowerCase();

  if (lowerName === "package.json") return parsePackageJson(relPath, fullPath, repo, manifestDir);
  if (lowerName.endsWith(".csproj")) return parseCsproj(relPath, fileName, fullPath, repo);
  if (lowerName.endsWith(".sln")) return parseSln(relPath, fileName, fullPath, repo);
  if (lowerName === "pom.xml") return parsePom(relPath, fullPath, repo);
  if (lowerName === "build.gradle" || lowerName === "build.gradle.kts") return parseGradle(relPath, fullPath, repo);
  if (lowerName === "requirements.txt") return parseRequirementsTxt(relPath, fullPath, repo);
  if (lowerName === "pyproject.toml") return parsePyproject(relPath, fullPath, repo);
  if (lowerName === "go.mod") return parseGoMod(relPath, fullPath, repo);
  if (lowerName === "cargo.toml") return parseCargoToml(relPath, fullPath, repo);
  if (lowerName === "composer.json") return parseComposerJson(relPath, fullPath, repo);
  if (lowerName === "gemfile") return parseGemfile(relPath, fullPath, repo);
  if (WORKSPACE_MARKERS.has(lowerName)) return parseWorkspaceMarker(relPath, repo);
  return null;
}
