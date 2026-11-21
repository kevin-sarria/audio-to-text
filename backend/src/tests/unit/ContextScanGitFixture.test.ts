import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFixture, fixturesRoot, listFixtures } from "../helpers/contextScanFixtures.js";
import { buildInventory, ProjectInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import { runContextScan } from "../../infrastructure/analysis/contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "../../infrastructure/analysis/contextScan/ScanBudget.js";
import { evaluateScan, ExpectedFact } from "../../infrastructure/analysis/contextScan/ContextScanEvaluator.js";

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf-8", windowsHide: true }).trim();

const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

describe("Fixture multi-repo-git — el escenario se construye como se describe", () => {
  let root = "";

  beforeAll(() => {
    root = copyFixture("multi-repo-git");
  });

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("crea 3 repos con su remoto y la rama develop activa", () => {
    for (const repo of ["campo-api", "campo-panel", "campo-movil"]) {
      const dir = path.join(root, repo);
      expect(fs.statSync(path.join(dir, ".git")).isDirectory()).toBe(true);
      expect(git(dir, ["config", "--get", "remote.origin.url"])).toBe(`https://github.com/orbe-ejemplo/${repo}.git`);
      expect(git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("develop");
      expect(git(dir, ["branch", "-r"])).toContain("origin/main");
    }
  });

  it("la copia de trabajo tiene un .git que es un archivo con gitdir:", () => {
    const gitFile = path.join(root, "campo-api-hotfix", ".git");
    expect(fs.statSync(gitFile).isFile()).toBe(true);
    expect(fs.readFileSync(gitFile, "utf-8")).toMatch(/^gitdir: .*worktrees/);
    expect(git(path.join(root, "campo-api-hotfix"), ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("hotfix/login");
  });

  it("el clon duplicado tiene el mismo remoto y el mismo HEAD que la API", () => {
    const api = path.join(root, "campo-api");
    const copia = path.join(root, "campo-api-copia");
    expect(git(copia, ["config", "--get", "remote.origin.url"])).toBe(git(api, ["config", "--get", "remote.origin.url"]));
    expect(git(copia, ["rev-parse", "HEAD"])).toBe(git(api, ["rev-parse", "HEAD"]));
  });

  it("el prototipo no tiene git", () => {
    expect(fs.existsSync(path.join(root, "prototipo-panel", "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "prototipo-panel", ".git"))).toBe(false);
  });

  it("el documento de reglas es idéntico byte a byte en los 3 repos", () => {
    const hashes = ["campo-api", "campo-panel", "campo-movil"].map((r) =>
      sha(path.join(root, r, "docs", "REGLAS_NEGOCIO.md"))
    );
    expect(new Set(hashes).size).toBe(1);
  });

  it("git blame fecha distinto la sección nueva (2025) y la vieja (2024) del mismo CLAUDE.md", () => {
    const api = path.join(root, "campo-api");
    const blame = git(api, ["blame", "--line-porcelain", "CLAUDE.md"]);
    const lines = blame.split("\n");
    const dateOf = (needle: string) => {
      const idx = lines.findIndex((l) => l.startsWith("\t") && l.includes(needle));
      for (let i = idx; i >= 0; i--) {
        const m = lines[i]!.match(/^author-time (\d+)/);
        if (m) return new Date(Number(m[1]) * 1000).getUTCFullYear();
      }
      return null;
    };
    expect(dateOf("Los PR los aprueba solo Laura Méndez")).toBe(2025);
    expect(dateOf("Se trabaja directo en la rama")).toBe(2024);
  });

  it("el historial muestra merges de pull requests y un squash con (#N)", () => {
    expect(git(path.join(root, "campo-api"), ["log", "--merges", "--format=%s"])).toMatch(/Merge pull request #42/);
    expect(git(path.join(root, "campo-panel"), ["log", "--format=%s"])).toMatch(/\(#7\)/);
  });
});

/**
 * Defectos conocidos del inventario actual. `it.fails` documenta el comportamiento
 * de hoy: cuando una fase lo corrija, la prueba empezará a fallar y habrá que
 * pasarla a `it` normal.
 */
describe("Fixture multi-repo-git — defectos conocidos (se corrigen en la Fase 1)", () => {
  let root = "";
  let inventory: ProjectInventory;

  beforeAll(() => {
    root = copyFixture("multi-repo-git");
    inventory = buildInventory(root, { useGit: true });
  });

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it.fails("defecto 2: el layout es multi-repo aunque un repo tenga un .sln con 2 proyectos", () => {
    expect(inventory.layout).toBe("multi-repo");
  });

  it.fails("obs. 3: la copia de trabajo y el clon no se cuentan como repos aparte", () => {
    expect(inventory.repositories.map((r) => r.path).sort()).toEqual(["campo-api", "campo-movil", "campo-panel"]);
  });

  it.fails("obs. 4: el prototipo sin git no aporta comandos", () => {
    expect(inventory.commands.some((c) => c.source.startsWith("prototipo-panel/"))).toBe(false);
  });
});

describe("Expected de todos los fixtures", () => {
  it("cada pregunta fija tiene sección, pregunta y respuesta", () => {
    for (const name of listFixtures()) {
      const file = path.join(fixturesRoot(), name, "expected.json");
      const facts: ExpectedFact[] = JSON.parse(fs.readFileSync(file, "utf-8"));
      const questions = facts.filter((f) => f.tipo === "pregunta");
      expect(questions.length, `${name} sin preguntas fijas`).toBeGreaterThan(0);
      for (const q of questions) {
        expect(q.pregunta, `${name}/${q.id}`).toBeTruthy();
        expect(q.seccion, `${name}/${q.id}`).toBeTruthy();
        expect(q.respuesta?.length, `${name}/${q.id}`).toBeGreaterThan(0);
      }
      const ids = facts.map((f) => f.id);
      expect(new Set(ids).size, `${name} ids repetidos`).toBe(ids.length);
    }
  });

  it("el piso sin IA (solo inventario) responde las preguntas marcadas como fase 0", async () => {
    const empty = JSON.stringify({ secciones: {}, no_encontrado: [] });
    const llm = async (s: string) => (s.includes("extractor de hechos") ? JSON.stringify({ hechos: [] }) : empty);

    for (const name of listFixtures()) {
      const dir = copyFixture(name);
      try {
        const useGit = fs.existsSync(path.join(fixturesRoot(), name, "scenario.json"));
        const result = await runContextScan(dir, llm, {
          budget: resolveScanBudget("gemini-3.8-flash-low"),
          providerLabel: "sin IA",
          model: "ninguno",
          useGit
        });
        const facts: ExpectedFact[] = JSON.parse(fs.readFileSync(path.join(fixturesRoot(), name, "expected.json"), "utf-8"));
        const evaluation = evaluateScan(result, buildInventory(dir, { useGit }), facts);
        const phase0 = facts.filter((f) => f.tipo === "pregunta" && f.fase === 0).map((f) => f.id);
        for (const id of phase0) {
          const r = evaluation.questions.results.find((q) => q.id === id);
          expect(r?.answered, `${name}/${id}`).toBe(true);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }, 60000);
});
