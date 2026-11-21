import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import { buildInventory, ProjectInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import {
  sectionsWithDates,
  annotateHeadings,
  detectMarks,
  blameLineTimes
} from "../../infrastructure/analysis/contextScan/vigencia/sectionDating.js";
import { collectGitEvidence, describeGitEvidence } from "../../infrastructure/analysis/contextScan/vigencia/gitEvidence.js";
import { applyQuestionsPolicy } from "../../infrastructure/analysis/contextScan/vigencia/questionsPolicy.js";
import { runContextScan } from "../../infrastructure/analysis/contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "../../infrastructure/analysis/contextScan/ScanBudget.js";
import { ScanResponseSchema } from "../../infrastructure/analysis/contextScan/ContextScanSchema.js";
import { evaluateScan } from "../../infrastructure/analysis/contextScan/ContextScanEvaluator.js";

describe("Marcas explícitas por sección", () => {
  it("detecta obligatorio, aprobado, desde y obsoleto", () => {
    expect(detectMarks("## Flujo (obligatorio, aprobado el 2025-09-01)").marks).toEqual(["obligatorio", "aprobado el 2025-09-01"]);
    expect(detectMarks("Vigente desde 2025-01-15").marks).toContain("desde 2025-01-15");
    expect(detectMarks("## Despliegue viejo (obsoleto)").obsolete).toBe(true);
    expect(detectMarks("Esto ya no se usa").obsolete).toBe(true);
  });

  it("una sección que habla de OTRA cosa obsoleta más abajo no queda marcada como obsoleta", () => {
    const md = "# Panel\n\nPanel web de Campo.\nUsa React.\nMás abajo: el prototipo viejo quedó obsoleto.\n";
    const secs = sectionsWithDates(md, null);
    expect(secs.find((s) => s.title === "Panel")!.obsolete).toBe(false);
  });

  it("fecha cada sección con su línea más reciente y anota los encabezados", () => {
    const md = "# Guía\n\n## Nueva (obligatorio)\nTodo por PR.\n\n## Vieja\nDirecto a develop.\n";
    const day = (d: string) => Date.parse(d) / 1000;
    const times = new Map([
      [1, day("2024-03-04")], [3, day("2025-09-01")], [4, day("2025-09-01")],
      [6, day("2024-03-04")], [7, day("2024-03-04")]
    ]);
    const secs = sectionsWithDates(md, times);
    expect(secs.find((s) => s.title === "Nueva (obligatorio)")).toMatchObject({ date: "2025-09-01", marks: ["obligatorio"] });
    expect(secs.find((s) => s.title === "Vieja")!.date).toBe("2024-03-04");
    const annotated = annotateHeadings(md, secs);
    expect(annotated).toContain("## Nueva (obligatorio)  [fecha de esta sección: 2025-09-01 · marcas: obligatorio]");
    expect(annotated).toContain("## Vieja  [fecha de esta sección: 2024-03-04]");
  });
});

describe("Vigencia con git real (fixture multi-repo-git)", () => {
  let root = "";
  let inventory: ProjectInventory;
  beforeAll(() => {
    root = copyFixture("multi-repo-git");
    inventory = buildInventory(root, { useGit: true });
  });
  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it("git blame fecha distinto la sección nueva y la vieja del mismo CLAUDE.md", () => {
    const times = blameLineTimes(`${root}/campo-api`, "CLAUDE.md");
    const raw = fs.readFileSync(`${root}/campo-api/CLAUDE.md`, "utf-8");
    const secs = sectionsWithDates(raw, times);
    expect(secs.find((s) => s.title.startsWith("Flujo de ramas"))).toMatchObject({
      date: "2025-09-01",
      marks: ["obligatorio", "aprobado el 2025-09-01"]
    });
    expect(secs.find((s) => s.title === "Flujo de trabajo")!.date).toBe("2024-03-04");
  });

  it("la evidencia de git cuenta los PR, el último y CODEOWNERS", () => {
    const ev = collectGitEvidence(inventory);
    const api = ev.find((e) => e.repo === "campo-api")!;
    expect(api.prMerges).toBe(2);
    expect(api.lastPr).toMatchObject({ number: "42", date: "2025-10-11", author: "Laura Méndez" });
    expect(api.remoteBranches.sort()).toEqual(["develop", "main"]);
    expect(api.codeowners).toEqual(["* @laura-mendez"]);
    const panel = ev.find((e) => e.repo === "campo-panel")!;
    expect(panel.squashPrs).toBe(1);
    expect(describeGitEvidence(api)).toMatch(/^- `campo-api`: en los últimos \d+ commits de `develop`: 2 entraron por PR/);
  });

  it("el prompt lleva las fechas por sección y la evidencia de git; el contexto, el bloque de git", async () => {
    const prompts: string[] = [];
    const llm = async (s: string, u: string) => {
      prompts.push(u);
      return s.includes("extractor de hechos")
        ? JSON.stringify({ hechos: [] })
        : JSON.stringify({ secciones: {}, no_encontrado: [] });
    };
    const result = await runContextScan(root, llm, {
      budget: resolveScanBudget("gemini-3.8-flash-low"),
      providerLabel: "Prueba",
      model: "m",
      useGit: true
    });
    const main = prompts.find((p) => p.includes("=== INVENTARIO"))!;
    expect(main).toMatch(/## Flujo de ramas \(obligatorio, aprobado el 2025-09-01\)\s+\[fecha de esta sección: 2025-09-01 · marcas: obligatorio, aprobado el 2025-09-01\]/);
    expect(main).toContain("## Flujo de trabajo  [fecha de esta sección: 2024-03-04]");
    expect(main).toContain("=== EVIDENCIA DE GIT");
    expect(main).toMatch(/`campo-api`: en los últimos \d+ commits de `develop`: 2 entraron por PR/);
    expect(result.technicalContext).toContain("**Del historial de git (lo que se hace de verdad):**");
  }, 60000);
});

describe("Política de preguntas y contradicciones", () => {
  it("pasa las contradicciones sin resolver a preguntas y quita las especulativas o sobre carpetas ya clasificadas", () => {
    const data = ScanResponseSchema.parse({
      secciones: {
        contradicciones: [
          { descripcion: "README dice PM2 y el workflow Nginx", fuentes: ["README.md", "deploy.yml"], gana: "deploy.yml", motivo: "documento_desactualizado" },
          { descripcion: "Dos guías dicen puertos distintos.", fuentes: ["a.md", "b.md"], gana: "sin resolver", motivo: "sin_resolver" }
        ],
        preguntas_abiertas: [
          "¿Será campo-api-copia un fork para marca blanca?",
          "¿Se debe borrar prototipo-panel?",
          "¿Quién aprueba los despliegues a producción? Se revisó CLAUDE.md y CODEOWNERS."
        ]
      }
    });
    const inventory = {
      otherFolders: [{ path: "prototipo-panel", name: "prototipo-panel" }]
    } as unknown as ProjectInventory;
    const out = applyQuestionsPolicy(data, inventory);
    expect(out.secciones.contradicciones).toHaveLength(1);
    expect(out.secciones.preguntas_abiertas).toEqual([
      "¿Quién aprueba los despliegues a producción? Se revisó CLAUDE.md y CODEOWNERS.",
      "Contradicción sin resolver entre a.md y b.md: Dos guías dicen puertos distintos. Se revisaron fechas por sección, marcas explícitas, código y git sin un ganador claro."
    ]);
  });

  it("acepta motivos desconocidos como sin_resolver en vez de romper el parseo", () => {
    const parsed = ScanResponseSchema.parse({
      secciones: { contradicciones: [{ descripcion: "x", fuentes: ["a.md"], motivo: "inventado" }] }
    });
    expect(parsed.secciones.contradicciones[0]!.motivo).toBe("sin_resolver");
  });
});

describe("Evaluador — section-not-contains", () => {
  it("marca como falso lo que no debe aparecer en una sección", () => {
    const ctx = "## 13. Ramas, PR y quién aprueba\n- Se trabaja directo en develop; no hace falta abrir pull requests (fuente: CLAUDE.md:8)\n";
    const r = evaluateScan({ technicalContext: ctx, report: {} as any }, {} as any, [
      { id: "x", descripcion: "regla vieja", tipo: "section-not-contains", seccion: "ramas_pr", texto: "no hace falta abrir pull requests" }
    ]);
    expect(r.found).toBe(0);
    expect(r.falseFacts[0]).toContain("no hace falta abrir pull requests");
  });
});
