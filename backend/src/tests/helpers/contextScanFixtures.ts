import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runGitScenario, GitScenario } from "./gitScenario.js";

/** Archivos y carpetas de control del fixture que nunca se copian al proyecto simulado. */
const CONTROL_ENTRIES = new Set(["dates.json", "expected.json", "scenario.json", "snapshots"]);

export function fixturesRoot(): string {
  return path.resolve(process.cwd(), "src/tests/fixtures/context-scan");
}

export function listFixtures(): string[] {
  return fs
    .readdirSync(fixturesRoot(), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Nombre real de un archivo del fixture: dot-git → .git, dot-env → .env, dot-gitignore → .gitignore. */
function realName(name: string): string {
  if (name === "dot-git") return ".git";
  if (name === "dot-env") return ".env";
  if (name.startsWith("dot-env.")) return name.replace(/^dot-env\./, ".env.");
  if (name === "dot-gitignore") return ".gitignore";
  return name;
}

/**
 * Copia un árbol renombrando los dot-*. Con `skipControl`, omite en la raíz los
 * archivos de control del fixture. `datesMap` fija el mtime por ruta relativa.
 */
export function copyTree(
  src: string,
  dest: string,
  opts: { skipControl?: boolean; datesMap?: Record<string, string> } = {}
): void {
  const walk = (from: string, to: string, relBase: string) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (opts.skipControl && relBase === "" && CONTROL_ENTRIES.has(entry.name)) continue;

      const destName = realName(entry.name);
      const srcPath = path.join(from, entry.name);
      const destPath = path.join(to, destName);
      const entryRel = relBase ? `${relBase}/${destName}` : destName;

      if (entry.isDirectory()) {
        walk(srcPath, destPath, entryRel);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
        const dateStr = opts.datesMap?.[entryRel];
        if (dateStr) {
          const d = new Date(dateStr);
          fs.utimesSync(destPath, d, d);
        }
      }
    }
  };
  walk(src, dest, "");
}

/**
 * Crea una copia temporal del fixture. Si el fixture trae `scenario.json`,
 * además ejecuta sus pasos de git (repos, commits fechados, merges, copias de
 * trabajo, clones), así que necesita `git` instalado.
 */
export function copyFixture(name: string): string {
  const fixtureDir = path.join(fixturesRoot(), name);
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`El fixture no existe: ${fixtureDir}`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `context-scan-${name}-`));

  let datesMap: Record<string, string> = {};
  const datesFile = path.join(fixtureDir, "dates.json");
  if (fs.existsSync(datesFile)) {
    try {
      datesMap = JSON.parse(fs.readFileSync(datesFile, "utf-8"));
    } catch {}
  }

  copyTree(fixtureDir, tmpDir, { skipControl: true, datesMap });

  const scenarioFile = path.join(fixtureDir, "scenario.json");
  if (fs.existsSync(scenarioFile)) {
    const scenario: GitScenario = JSON.parse(fs.readFileSync(scenarioFile, "utf-8"));
    runGitScenario(tmpDir, scenario, (from, to) => copyTree(path.join(fixtureDir, from), to));
  }

  return tmpDir;
}

/** true si el fixture necesita git real (para activar `useGit` al escanearlo). */
export function fixtureUsesGit(name: string): boolean {
  return fs.existsSync(path.join(fixturesRoot(), name, "scenario.json"));
}
