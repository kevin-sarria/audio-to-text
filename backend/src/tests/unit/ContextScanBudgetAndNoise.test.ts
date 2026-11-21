import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractWarningHints } from "../../infrastructure/analysis/contextScan/WarningHints.js";
import { summarizeGithubWorkflow } from "../../infrastructure/analysis/contextScan/inventory/deploymentParser.js";
import { categorizeDependencies } from "../../infrastructure/analysis/contextScan/render/architectureDeps.js";
import { trimByImportance } from "../../infrastructure/analysis/contextScan/render/contextTrimmer.js";
import { dropRepoContradictions, uncoveredHintsBlock } from "../../infrastructure/analysis/contextScan/render/inventoryBlocks.js";
import { allocateQuotas, readDocuments } from "../../infrastructure/analysis/contextScan/DocumentReader.js";
import { classifyDocument } from "../../infrastructure/analysis/contextScan/inventory/documentClassifier.js";
import { resolveAgyModel } from "../../infrastructure/analysis/LlmProviderClients.js";
import { DocumentRef, ManifestInfo, ProjectInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import { ScanItem } from "../../infrastructure/analysis/contextScan/ContextScanSchema.js";

let dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "scan-noise-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const doc = (p: string, priority: DocumentRef["priority"], category: DocumentRef["category"] = "business-docs"): DocumentRef => ({
  path: p,
  repo: ".",
  category,
  priority,
  sizeBytes: 1,
  lastModified: "2025-01-01T00:00:00Z",
  dateSource: "mtime"
});

describe("WarningHints", () => {
  it("toma frases de advertencia y configuración remota, sin títulos, código ni valores", () => {
    const root = tmp();
    fs.writeFileSync(
      path.join(root, "CLAUDE.md"),
      "# Importante\n⚠ Ojo: nunca conectes el entorno local a la base de producción.\n```\nnunca dentro de código\n```\nTexto normal sin nada.\n"
    );
    fs.writeFileSync(
      path.join(root, ".env.example"),
      "# Base compartida por todo el equipo\nDB_HOST=db.compartida.ejemplo.test\nAPI_URL=http://localhost:3000\nDB_PASSWORD=<password>\n"
    );
    const hints = extractWarningHints(root, [doc("CLAUDE.md", 1, "agent-instructions"), doc(".env.example", 4, "config-templates")]);
    const texts = hints.map((h) => `${h.path}:${h.line} ${h.text}`);
    expect(texts).toContain("CLAUDE.md:2 ⚠ Ojo: nunca conectes el entorno local a la base de producción.");
    expect(texts.some((t) => t.includes("nunca dentro de código"))).toBe(false);
    expect(texts.some((t) => t.startsWith("CLAUDE.md:1"))).toBe(false);
    expect(texts.some((t) => t.includes("DB_HOST apunta a un servidor remoto (compartido o de otro entorno)"))).toBe(true);
    expect(texts.some((t) => t.includes("db.compartida.ejemplo.test"))).toBe(false);
    expect(texts.some((t) => t.includes("API_URL"))).toBe(false);
  });

  it("las advertencias que ya cubre una trampa no se repiten en el bloque de respaldo", () => {
    const hints = [
      { path: "a.md", line: 3, text: "Nunca borres la tabla de auditoría en producción", kind: "advertencia" as const },
      { path: "b.md", line: 9, text: "Cuidado: el login bloquea tras 5 intentos", kind: "advertencia" as const }
    ];
    const traps = [{ valor: "x", fuente: "a.md:3", estado: "confirmado" } as ScanItem];
    expect(uncoveredHintsBlock(hints, traps)).toEqual(["- «Cuidado: el login bloquea tras 5 intentos» (fuente: b.md:9)"]);
  });
});

describe("Resumen de workflows", () => {
  it("resume disparadores, máquina, acciones no triviales, pasos y comandos multilínea", () => {
    const yml = `name: Deploy
on:
  push:
    branches: [develop, main]
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
      - run: dotnet publish src/Api.csproj -c Release -o out
      - name: Copiar al servidor
        run: |
          rsync -az out/ deploy@\${{ secrets.SERVER_HOST }}:/srv/api/
          ssh deploy@\${{ secrets.SERVER_HOST }} "pm2 restart api"
`;
    const s = summarizeGithubWorkflow(yml);
    expect(s).toContain("push a develop, main");
    expect(s).toContain("manual (workflow_dispatch)");
    expect(s).toContain("corre en ubuntu-latest");
    expect(s).toContain("usa actions/setup-dotnet@v4");
    expect(s).not.toContain("actions/checkout");
    expect(s).toContain("pasos: Copiar al servidor");
    expect(s).toContain("`rsync -az out/ deploy@<SERVER_HOST>:/srv/api/`");
    expect(s).toContain('`ssh deploy@<SERVER_HOST> "pm2 restart api"`');
    expect(s).not.toContain("run: |");
  });
});

describe("Dependencias de arquitectura", () => {
  it("clasifica dependencias y devDependencies que definen la arquitectura", () => {
    const m: ManifestInfo = {
      path: "web/package.json",
      repo: "web",
      kind: "npm",
      name: "web",
      version: "1.0.0",
      frameworks: [],
      dependencies: { react: "18.3.1", antd: "5.20.0", zustand: "4.5.4", axios: "1.7.2", dayjs: "1.11.0" },
      devDependencies: { vite: "5.4.0", typescript: "5.5.4", vitest: "2.0.5", eslint: "9.0.0" },
      workspaces: []
    };
    const cats = Object.fromEntries(categorizeDependencies(m).map((c) => [c.label, c.deps]));
    expect(cats).toMatchObject({
      framework: ["react@18.3.1"],
      UI: ["antd@5.20.0"],
      estado: ["zustand@4.5.4"],
      pruebas: ["vitest@2.0.5"],
      build: ["vite@5.4.0", "typescript@5.5.4"]
    });
    expect(JSON.stringify(cats)).not.toContain("axios");
  });
});

describe("Recorte por importancia", () => {
  it("recorta primero lo menos importante y nunca trampas, reglas ni ramas", () => {
    const filler = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `- ${tag} ${i} ${"x".repeat(60)}`);
    const sections = [
      { key: "trampas", lines: ["## 2. Trampas", ...filler(5, "trampa")] },
      { key: "tecnologias", lines: ["## 4. Tecnologías", ...filler(20, "tec")] },
      { key: "ramas_pr", lines: ["## 13. Ramas", ...filler(5, "rama")] },
      { key: "flujos", lines: ["## 8. Flujos", ...filler(20, "flujo")] }
    ];
    const { text, omitted } = trimByImportance(["# Contexto"], sections, 2500);
    expect(text.length).toBeLessThanOrEqual(2500 + 120);
    expect(omitted).toBeGreaterThan(0);
    expect((text.match(/- trampa /g) ?? []).length).toBe(5);
    expect((text.match(/- rama /g) ?? []).length).toBe(5);
    // Tecnologías se recorta antes que flujos.
    expect((text.match(/- tec /g) ?? []).length).toBeLessThan((text.match(/- flujo /g) ?? []).length);
    expect(text).toContain("elementos omitidos por tamaño");
  });
});

describe("Presupuesto y orden de lectura", () => {
  it("allocateQuotas: los chicos entran completos y el grande recibe lo que sobra", () => {
    const q = allocateQuotas(
      [
        { path: "grande.md", size: 100000, priority: 2 },
        { path: "claude.md", size: 2000, priority: 1 },
        { path: "readme.md", size: 3000, priority: 3 }
      ],
      20000
    );
    expect(q.get("claude.md")).toBe(2000);
    expect(q.get("readme.md")).toBe(3000);
    expect(q.get("grande.md")).toBe(15000);
  });

  it("readDocuments lee una sola vez los documentos idénticos y anota dónde están", async () => {
    const root = tmp();
    for (const r of ["a", "b", "c"]) {
      fs.mkdirSync(path.join(root, r, "docs"), { recursive: true });
      fs.writeFileSync(path.join(root, r, "docs", "REGLAS.md"), "# Reglas\nRN-01 algo\n");
    }
    const docs = ["a", "b", "c"].map((r) => doc(`${r}/docs/REGLAS.md`, 2));
    const res = await readDocuments(
      root,
      docs,
      { maxInputChars: 100000, chunkChars: 20000, maxSummaryCalls: 5 },
      vi.fn(),
      [["a/docs/REGLAS.md", "b/docs/REGLAS.md", "c/docs/REGLAS.md"]]
    );
    expect(res.contents).toHaveLength(1);
    expect(res.contents[0]!.duplicates).toEqual(["b/docs/REGLAS.md", "c/docs/REGLAS.md"]);
    expect(res.readLog.filter((l) => l.status === "duplicate").map((l) => l.reason)).toEqual([
      "idéntico a a/docs/REGLAS.md",
      "idéntico a a/docs/REGLAS.md"
    ]);
  });

  it("classifyDocument ordena: agentes y reglas del repo, dominio, README, resto, históricos", () => {
    const p = (rel: string, repo = ".") => classifyDocument(rel, repo, 10)?.priority ?? null;
    expect(p("api/CLAUDE.md", "api")).toBe(1);
    expect(p("AI_GUIDELINES.md")).toBe(1);
    expect(p("api/docs/REGLAS_NEGOCIO.md", "api")).toBe(2);
    expect(p("docs/api-endpoints.md")).toBe(2);
    expect(p("README.md")).toBe(3);
    expect(p(".github/CODEOWNERS")).toBe(3);
    expect(p("docs/instalacion.md")).toBe(4);
    expect(p("docs/plans/2025-03-01-rediseno.md")).toBe(5);
    expect(p("docs/specs/login.md")).toBe(5);
    expect(p("CHANGELOG.md")).toBe(5);
    expect(p("LICENSE.md")).toBeNull();
    expect(p("src/components/deep/notes.md")).toBeNull();
  });
});

describe("Modelo y coherencia con el inventario", () => {
  it("resolveAgyModel devuelve el modelo que Antigravity usa de verdad", () => {
    expect(resolveAgyModel("gemini-3.8-flash-medium")).toBe("gemini-3.8-flash-medium");
    expect(resolveAgyModel("gemini-3.8-flash-high")).toBe("gemini-3.8-flash-low");
    expect(resolveAgyModel("modelo-inventado")).toBe("gemini-3.8-flash-low");
    expect(resolveAgyModel("")).toBe("gemini-3.8-flash-low");
  });

  it("quita las líneas del modelo que contradicen la cantidad de repos o el layout del inventario", () => {
    const inventory = {
      layout: "multi-repo",
      repositories: [{ kind: "repo" }, { kind: "repo" }, { kind: "repo" }]
    } as unknown as ProjectInventory;
    const items = [
      { valor: "El proyecto tiene 4 repositorios" },
      { valor: "Es un monorepo con workspaces" },
      { valor: "Son 3 repositorios separados: api, panel y móvil" }
    ] as ScanItem[];
    expect(dropRepoContradictions(items, inventory).map((i) => i.valor)).toEqual([
      "Son 3 repositorios separados: api, panel y móvil"
    ]);
  });
});
