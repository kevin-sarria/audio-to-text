import fs from "node:fs";
import path from "node:path";
import { ProjectInventory } from "../ProjectInventory.js";
import { CodeFacts, emptyCodeFacts, PermissionModel, SourceFile } from "./types.js";
import { extractCodeSignals } from "./codeSignals.js";
import { extractDotnet } from "./dotnetExtractor.js";
import { extractJs } from "./jsExtractor.js";
import { extractPrisma } from "./prismaExtractor.js";
import { extractI18n } from "./i18nExtractor.js";

/**
 * Lee el código de los repos activos (en el orden de prioridad del inventario y con un
 * tope de bytes) y junta los hechos de cada extractor. Después cruza repos: modelos de
 * permisos distintos, endpoints sin autorización, mecanismo de esquema y pruebas.
 */

export interface CollectOptions {
  /** Bytes de código a leer como máximo (por defecto 8 MB). */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export function extractFromFile(file: SourceFile, facts: CodeFacts): void {
  const ext = path.posix.extname(file.path).toLowerCase();
  if (ext === ".cs") {
    extractDotnet(file, facts);
    extractCodeSignals(file, facts);
  } else if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    extractJs(file, facts);
    extractCodeSignals(file, facts);
  } else if (ext === ".prisma") {
    extractPrisma(file, facts);
  } else if (ext === ".json" || ext === ".resx") {
    extractI18n(file, facts);
  }
}

function addModel(facts: CodeFacts, model: PermissionModel): void {
  if (!facts.permissionModels.some((p) => p.repo === model.repo && p.model === model.model)) facts.permissionModels.push(model);
}

/** Los roles y políticas declarados también dicen cómo decide los permisos cada repo. */
function modelsFromAuth(facts: CodeFacts): void {
  for (const rule of facts.auth) {
    if (rule.roles.length) addModel(facts, { repo: rule.repo, path: rule.path, line: rule.line, model: "por-rol", detail: `por rol (${rule.via})` });
    else if (rule.policy) addModel(facts, { repo: rule.repo, path: rule.path, line: rule.line, model: "por-politica", detail: `por política (${rule.policy})` });
  }
}

function permissionDivergence(facts: CodeFacts): void {
  const repos = [...new Set(facts.permissionModels.map((p) => p.repo))];
  const only = (repo: string, model: string) => {
    const models = facts.permissionModels.filter((p) => p.repo === repo).map((p) => p.model);
    return models.includes(model as PermissionModel["model"]) && models.length === 1;
  };
  const claimsRepos = repos.filter((r) => only(r, "por-claims"));
  const roleRepos = repos.filter((r) => only(r, "por-rol"));
  if (!claimsRepos.length || !roleRepos.length) return;
  const describe = repos
    .map((r) => {
      const p = facts.permissionModels.find((m) => m.repo === r)!;
      return `\`${r}\` ${p.detail} (${p.path}:${p.line})`;
    })
    .join("; ");
  const first = facts.permissionModels.find((p) => p.repo === claimsRepos[0])!;
  // El comentario de decisión que dice lo mismo en ese archivo queda cubierto por esta trampa.
  facts.traps = facts.traps.filter((t) => !(t.kind === "decision" && t.path === first.path && Math.abs(t.line - first.line) <= 5));
  facts.traps.push({
    repo: first.repo,
    path: first.path,
    line: first.line,
    kind: "permisos-distintos",
    text: `Los permisos no se calculan igual en todos los repos: ${describe}. Un cambio de permisos hay que hacerlo en cada uno.`
  });
}

function unauthorizedEndpoints(facts: CodeFacts): void {
  const repos = [...new Set(facts.endpoints.map((e) => e.repo))];
  for (const repo of repos) {
    if (facts.globalAuth.some((g) => g.repo === repo)) continue;
    const api = facts.endpoints.filter((e) => e.repo === repo && e.method !== "PANTALLA");
    const open = api.filter((e) => !e.authorized && !e.anonymous);
    if (!open.length || open.length === api.length) continue;
    const list = open.slice(0, 5).map((e) => `${e.method} ${e.route} (${e.path}:${e.line})`).join(", ");
    facts.traps.push({
      repo,
      path: open[0]!.path,
      line: open[0]!.line,
      kind: "sin-autorizacion",
      text: `En \`${repo}\` hay endpoints sin autorización declarada mientras otros sí la tienen: ${list}${open.length > 5 ? ` y ${open.length - 5} más` : ""}.`
    });
  }
}

/** Lo que sale de comparar archivos y repos: modelos de permisos y endpoints sin autorización. */
export function crossRepoFacts(facts: CodeFacts): void {
  modelsFromAuth(facts);
  permissionDivergence(facts);
  unauthorizedEndpoints(facts);
}

/** Migraciones y scripts SQL que el inventario ya vio por la ruta. */
function schemaFromInventory(inventory: ProjectInventory, facts: CodeFacts): void {
  const byDir = new Map<string, string[]>();
  for (const p of inventory.domain.migrations) {
    const dir = path.posix.dirname(p.replace(/\\/g, "/"));
    byDir.set(dir, [...(byDir.get(dir) ?? []), p]);
  }
  for (const [dir, files] of byDir) {
    const repo = inventory.repositories.find((r) => r.path !== "." && (dir === r.path || dir.startsWith(`${r.path}/`)))?.path ?? ".";
    const lower = dir.toLowerCase();
    let mechanism: string;
    let detail: string;
    if (/prisma\/migrations/.test(lower)) {
      mechanism = "Prisma migrate";
      detail = `migraciones de Prisma en ${dir}/ (${files.length})`;
    } else if (/(?:^|\/)migrations$/.test(lower) && files.some((f) => f.endsWith(".cs"))) {
      mechanism = "Migraciones de EF Core";
      detail = `migraciones de EF Core en ${dir}/ (${files.length})`;
    } else if (files.every((f) => f.toLowerCase().endsWith(".sql"))) {
      mechanism = "Scripts SQL";
      detail = `scripts SQL en ${dir}/ (${files.length}): ${files.slice(0, 3).map((f) => path.posix.basename(f)).join(", ")}${files.length > 3 ? "…" : ""}`;
    } else {
      mechanism = "Migraciones";
      detail = `migraciones en ${dir}/ (${files.length})`;
    }
    facts.schema.push({ repo, path: files[0]!, line: 1, mechanism, detail });
  }
}

const DOTNET_TEST_DEPS = ["xunit", "nunit", "mstest.testframework", "microsoft.net.test.sdk"];
const JS_TEST_DEPS = ["vitest", "jest", "mocha", "@playwright/test", "cypress", "jasmine", "ava", "@testing-library/react"];

function testSummaries(inventory: ProjectInventory, facts: CodeFacts): void {
  for (const repo of inventory.repositories.filter((r) => r.kind === "repo")) {
    const inRepo = (p: string) => repo.path === "." || p === repo.path || p.startsWith(`${repo.path}/`);
    const testFiles = inventory.codeFiles.filter((f) => f.isTest && inRepo(f.path)).length;
    const projects: string[] = [];
    const frameworks = new Set<string>();
    for (const m of inventory.manifests.filter((x) => inRepo(x.path))) {
      const deps = Object.keys({ ...m.dependencies, ...m.devDependencies }).map((d) => d.toLowerCase());
      if (m.kind === "dotnet") {
        const found = DOTNET_TEST_DEPS.filter((d) => deps.includes(d));
        if (found.length) {
          projects.push(m.path);
          found.filter((d) => d !== "microsoft.net.test.sdk").forEach((d) => frameworks.add(d.replace(".testframework", "")));
        }
      } else if (m.kind === "npm") {
        JS_TEST_DEPS.filter((d) => deps.includes(d)).forEach((d) => frameworks.add(d));
      }
    }
    facts.tests.push({ repo: repo.path, testFiles, projects, frameworks: [...frameworks] });
  }
}

export function collectCodeFacts(rootPath: string, inventory: ProjectInventory, options: CollectOptions = {}): CodeFacts {
  const facts = emptyCodeFacts();
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let bytes = 0;

  for (const ref of inventory.codeFiles ?? []) {
    // Las pruebas solo se cuentan (con la ruta basta).
    if (ref.isTest) continue;
    if (bytes + ref.sizeBytes > maxBytes) {
      facts.filesNotRead++;
      continue;
    }
    let text: string;
    try {
      text = fs.readFileSync(path.join(rootPath, ref.path), "utf-8");
    } catch {
      continue;
    }
    bytes += ref.sizeBytes;
    facts.filesRead++;
    extractFromFile({ repo: ref.repo, path: ref.path, text, isTest: false }, facts);
  }

  crossRepoFacts(facts);
  schemaFromInventory(inventory, facts);
  testSummaries(inventory, facts);
  return facts;
}
