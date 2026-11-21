import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import { runContextScan } from "../../infrastructure/analysis/contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "../../infrastructure/analysis/contextScan/ScanBudget.js";

const SECRETS = ["NO-DEBE-SALIR", "SuperSecreta123", "10.20.30.40"];

function minimalResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    secciones: {
      proposito: [{ dato: "Gestión de sedes", fuente: "frontend-app/README.md" }],
      repositorios: [{ dato: "Tres repositorios separados", fuente: "inventario" }],
      tecnologias: [{ dato: "React 19", fuente: "frontend-app/package.json", valor: "19" }],
      capas_estructura: [{ dato: "Controladores", fuente: "backend-api/Controllers/CostCentersController.cs" }],
      glosario: [],
      roles_permisos: [],
      flujos: [],
      reglas_negocio_ubicacion: [],
      reglas_inquebrantables: [],
      cambios_base_datos: [],
      verificacion: [],
      ramas_pr: [],
      despliegue: [],
      como_escribir_issues: [],
      contradicciones: [],
      preguntas_abiertas: ["¿Quién aprueba los PR?"],
      ...overrides
    },
    no_encontrado: [
      "roles_permisos",
      "flujos",
      "reglas_negocio_ubicacion",
      "reglas_inquebrantables",
      "cambios_base_datos",
      "verificacion",
      "ramas_pr",
      "despliegue",
      "como_escribir_issues"
    ]
  });
}

describe("ContextScanOrchestrator: reintentos, re-pedido de secciones y secretos", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  const fixture = () => {
    const d = copyFixture("tres-repos");
    dirs.push(d);
    return d;
  };
  const bigBudget = () => resolveScanBudget("gemini-3.8-flash-low");

  it("el reintento reenvía el inventario y los documentos junto con el error de validación", async () => {
    const root = fixture();
    const prompts: string[] = [];
    let main = 0;
    const llm = vi.fn(async (_s: string, u: string) => {
      prompts.push(u);
      if (u.includes("=== INVENTARIO")) main++;
      return main === 1 ? "esto no es JSON" : minimalResponse();
    });

    const result = await runContextScan(root, llm, { budget: bigBudget(), providerLabel: "Prueba", model: "m", useGit: false });

    const retry = prompts.find((p) => p.includes("no cumple el esquema"));
    expect(retry).toBeDefined();
    expect(retry).toContain("=== INVENTARIO");
    expect(retry).toContain("=== DOCUMENTOS");
    expect(result.report.llmCalls).toBeGreaterThanOrEqual(2);
  });

  it("dos respuestas inválidas seguidas lanzan un error claro", async () => {
    const root = fixture();
    const llm = vi.fn(async () => "basura");
    await expect(
      runContextScan(root, llm, { budget: bigBudget(), providerLabel: "Prueba", model: "m", useGit: false })
    ).rejects.toThrow("La IA no devolvió un JSON válido");
  });

  it("re-pide solo las secciones incompletas, con los datos, y lo que siga vacío queda como 'No encontrado.'", async () => {
    const root = fixture();
    const prompts: string[] = [];
    const llm = vi.fn(async (_s: string, u: string) => {
      prompts.push(u);
      if (u.includes("quedaron vacías")) return JSON.stringify({ secciones: {}, no_encontrado: [] });
      // glosario vacío y fuera de no_encontrado → incompleto
      return minimalResponse();
    });

    const result = await runContextScan(root, llm, { budget: bigBudget(), providerLabel: "Prueba", model: "m", useGit: false });

    const repedido = prompts.find((p) => p.includes("quedaron vacías"));
    expect(repedido).toBeDefined();
    expect(repedido).toContain('"glosario"');
    expect(repedido).not.toContain('"proposito",');
    expect(repedido).toContain("=== INVENTARIO");
    expect(result.technicalContext).toMatch(/## 5\. Glosario[^\n]*\n+No encontrado\./);
  });

  it("ningún prompt ni el contexto final llevan secretos ni la ruta local, y el reporte cuenta los secretos ocultos", async () => {
    const root = fixture();
    const llm = vi.fn(async () => minimalResponse());

    const result = await runContextScan(root, llm, { budget: bigBudget(), providerLabel: "Prueba", model: "m", useGit: false });

    for (const call of llm.mock.calls) {
      const sent = call.join("\n");
      for (const s of SECRETS) expect(sent).not.toContain(s);
      expect(sent).not.toContain(root);
    }
    for (const s of SECRETS) expect(result.technicalContext).not.toContain(s);
    // appsettings.Template.json trae una contraseña y una IP que se redactan antes de enviar
    expect(result.report.redactions).toBeGreaterThan(0);
    expect(result.report.skippedSecretFiles).toBeGreaterThan(0);
  });
});
