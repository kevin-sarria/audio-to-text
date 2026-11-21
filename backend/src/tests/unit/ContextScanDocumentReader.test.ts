import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import {
  splitMarkdownSections,
  readDocuments
} from "../../infrastructure/analysis/contextScan/DocumentReader.js";
import { DocumentRef } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";

describe("ContextScan - DocumentReader", () => {
  let tmpDirs: string[] = [];

  const getCleanFixture = (name: string): string => {
    const dir = copyFixture(name);
    tmpDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {}
    }
    tmpDirs = [];
  });

  it("splitMarkdownSections ignora encabezados dentro de bloques de código", () => {
    const md = `
# Sección 1
Texto de intro.

\`\`\`markdown
# Este encabezado está dentro de código
## Tampoco debe dividir aquí
\`\`\`

## Sección 2
Contenido de sección 2.
`;
    const sections = splitMarkdownSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe("Sección 1");
    expect(sections[0]?.body).toContain("# Este encabezado está dentro de código");
    expect(sections[1]?.title).toBe("Sección 2");
  });

  it("con presupuesto grande el documento REGLAS.md queda complete", async () => {
    const root = getCleanFixture("tres-repos");
    const docRef: DocumentRef = {
      path: "backend-api/docs/REGLAS.md",
      repo: "backend-api",
      category: "business-docs",
      priority: 2,
      sizeBytes: 55000,
      lastModified: new Date().toISOString(),
      dateSource: "mtime"
    };

    const budget = {
      maxInputChars: 400000,
      chunkChars: 20000,
      maxSummaryCalls: 12
    };

    const summarizeFn = vi.fn().mockResolvedValue('{"hechos":["Hecho ficticio"]}');

    const res = await readDocuments(root, [docRef], budget, summarizeFn);

    expect(res.contents).toHaveLength(1);
    expect(res.contents[0]?.mode).toBe("full");
    expect(res.readLog[0]?.status).toBe("complete");
    expect(summarizeFn).not.toHaveBeenCalled();
  });

  it("con presupuesto pequeño (maxInputChars: 8000) REGLAS.md queda sections y summarize se invoca con pedazos <= chunkChars", async () => {
    const root = getCleanFixture("tres-repos");
    const docRef: DocumentRef = {
      path: "backend-api/docs/REGLAS.md",
      repo: "backend-api",
      category: "business-docs",
      priority: 2,
      sizeBytes: 55000,
      lastModified: new Date().toISOString(),
      dateSource: "mtime"
    };

    const chunkChars = 4000;
    const budget = {
      maxInputChars: 8000,
      chunkChars,
      maxSummaryCalls: 20
    };

    const summarizeFn = vi.fn().mockImplementation(async (_label, title, text) => {
      return `Resumen de ${title} (${text.length} chars)`;
    });

    const res = await readDocuments(root, [docRef], budget, summarizeFn);

    expect(res.contents).toHaveLength(1);
    expect(res.contents[0]?.mode).toBe("summary");
    expect(res.readLog[0]?.status).toBe("sections");
    expect(res.readLog[0]?.sections).toBeGreaterThan(1);
    expect(summarizeFn).toHaveBeenCalled();

    // Comprobar que cada llamada recibió pedazos <= chunkChars (con tolerancia mínima de agrupación)
    for (const call of summarizeFn.mock.calls) {
      const textPassed = call[2];
      expect(textPassed.length).toBeLessThanOrEqual(chunkChars * 1.5);
    }

    // El último pedazo debe contener la regla final
    const lastCall = summarizeFn.mock.calls[summarizeFn.mock.calls.length - 1];
    const lastChunkText = lastCall?.[2] ?? "";
    expect(lastChunkText).toContain("RN-40 Rol Supervisor");
  });

  it("con maxSummaryCalls: 0 queda omitted con motivo de límite de llamadas", async () => {
    const root = getCleanFixture("tres-repos");
    const docRef: DocumentRef = {
      path: "backend-api/docs/REGLAS.md",
      repo: "backend-api",
      category: "business-docs",
      priority: 2,
      sizeBytes: 55000,
      lastModified: new Date().toISOString(),
      dateSource: "mtime"
    };

    const budget = {
      maxInputChars: 8000,
      chunkChars: 4000,
      maxSummaryCalls: 0
    };

    const summarizeFn = vi.fn().mockResolvedValue("");

    const res = await readDocuments(root, [docRef], budget, summarizeFn);

    expect(res.contents).toHaveLength(0);
    expect(res.readLog[0]?.status).toBe("omitted");
    expect(res.readLog[0]?.reason).toContain("límite de llamadas de resumen");
    expect(summarizeFn).not.toHaveBeenCalled();
  });

  it("un summarize que lanza error produce omitted con 'falló el resumen'", async () => {
    const root = getCleanFixture("tres-repos");
    const docRef: DocumentRef = {
      path: "backend-api/docs/REGLAS.md",
      repo: "backend-api",
      category: "business-docs",
      priority: 2,
      sizeBytes: 55000,
      lastModified: new Date().toISOString(),
      dateSource: "mtime"
    };

    const budget = {
      maxInputChars: 8000,
      chunkChars: 4000,
      maxSummaryCalls: 10
    };

    const summarizeFn = vi.fn().mockRejectedValue(new Error("Timeout en la API"));

    const res = await readDocuments(root, [docRef], budget, summarizeFn);

    expect(res.contents).toHaveLength(0);
    expect(res.readLog[0]?.status).toBe("omitted");
    expect(res.readLog[0]?.reason).toContain("falló el resumen: Timeout en la API");
  });
});
