import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import { runContextScan } from "../../infrastructure/analysis/contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "../../infrastructure/analysis/contextScan/ScanBudget.js";
import { parseContextSections } from "../../infrastructure/analysis/contextScan/ContextScanMetrics.js";
import { buildInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import { collectCodeFacts } from "../../infrastructure/analysis/contextScan/code/collectCodeFacts.js";
import { codeEvidence, codeNames, subtypesOf } from "../../infrastructure/analysis/contextScan/code/describeCode.js";
import { verifyScanResponse } from "../../infrastructure/analysis/contextScan/SourceVerifier.js";
import { ScanResponseSchema } from "../../infrastructure/analysis/contextScan/ContextScanSchema.js";

/** Escaneo completo con un modelo falso que no responde nada: lo que aparece sale del código. */
async function scanWithEmptyModel(fixture: string, useGit: boolean) {
  const root = copyFixture(fixture);
  roots.push(root);
  const prompts: string[] = [];
  const llm = async (s: string, u: string) => {
    prompts.push(u);
    return s.includes("extractor de hechos") ? JSON.stringify({ hechos: [] }) : JSON.stringify({ secciones: {}, no_encontrado: [] });
  };
  const result = await runContextScan(root, llm, { budget: resolveScanBudget("gemini-3.8-flash-low"), providerLabel: "Prueba", model: "m", useGit });
  return { result, main: prompts.find((p) => p.includes("=== INVENTARIO"))! };
}

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

describe("Verificación con los hechos del código", () => {
  it("confirma una cita copiada del bloque CÓDIGO y un glosario de pantalla → entidad; dice los subtipos", async () => {
    const root = copyFixture("multi-repo-git");
    roots.push(root);
    const inventory = buildInventory(root, { useGit: false });
    const facts = collectCodeFacts(root, inventory);
    const data = ScanResponseSchema.parse({
      secciones: {
        roles_permisos: [
          { valor: "Los roles son Administrador, Supervisor y Tecnico", cita: "Roles Rol: Administrador, Supervisor, Tecnico", fuente: "campo-api/src/CampoApi/Domain/Enums/Rol.cs" }
        ],
        glosario: [{ termino_reunion: "Reclamo", sinonimos: [], nombre_codigo: "TipoIncidencia", fuente: "campo-panel/src/locales/es.json" }]
      }
    });
    const withCode = verifyScanResponse(data, inventory, root, { codeEvidence: codeEvidence(facts), codeNames: codeNames(facts) });
    expect(withCode.data.secciones.roles_permisos[0]).toMatchObject({ estado: "confirmado", fuente: "campo-api/src/CampoApi/Domain/Enums/Rol.cs:3" });
    expect(withCode.data.secciones.glosario[0]!.estado).toBe("confirmado");
    // Sin los hechos del código, ninguna de las dos se puede confirmar.
    const withoutCode = verifyScanResponse(data, inventory, root);
    expect(withoutCode.data.secciones.roles_permisos[0]!.estado).toBe("sin_confirmar");
    expect(withoutCode.data.secciones.glosario[0]!.estado).toBe("sin_confirmar");
    expect(subtypesOf("Incidencia", facts)).toEqual(["Novedad", "Reclamo"]);
    expect(subtypesOf("Incidencia (o TipoIncidencia)", facts)).toEqual(["Novedad", "Reclamo"]);
    expect(subtypesOf("Usuario", facts)).toEqual([]);
  }, 60000);
});

describe("Lectura de código en el escaneo completo", () => {
  it("multi-repo-git: el prompt trae el bloque CÓDIGO y las trampas del código llegan al contexto aunque la IA no las procese", async () => {
    const { result, main } = await scanWithEmptyModel("multi-repo-git", true);
    expect(main).toContain("=== CÓDIGO");
    expect(main).toContain("Roles `Rol`: Administrador, Supervisor, Tecnico");
    expect(main).toContain("GET api/movil/incidencias [Supervisor, Tecnico]");

    const sections = parseContextSections(result.technicalContext);
    const traps = sections.find((s) => s.key === "trampas")!.lines.join("\n");
    expect(traps).toContain("MaxFailedAccessAttempts = 5");
    expect(traps).toMatch(/disco.*S3|S3.*disco/);
    expect(traps).toMatch(/Los permisos no se calculan igual en todos los repos: .*campo-movil.*campo-panel/);

    const roles = sections.find((s) => s.key === "roles_permisos")!.lines.join("\n");
    expect(roles).toContain("**Del código:**");
    expect(roles).toContain("api/movil/incidencias → roles: Supervisor, Tecnico");
    expect(result.technicalContext).toContain("Código: 15 archivos leídos.");
  }, 60000);

  it("tres-repos: textos de pantalla y entidad para el glosario; los secretos de appsettings no salen", async () => {
    const { result, main } = await scanWithEmptyModel("tres-repos", false);
    expect(main).toContain("menu.sedes=«Sedes»");
    expect(main).toContain("`backend-api`: CostCenter");
    expect(main).toContain("CentrosDeCosto.tsx` muestra: «Sedes»");
    expect(main).not.toContain("NO-DEBE-SALIR");
    expect(main).not.toContain("SuperSecreta123");
    expect(result.technicalContext).toContain("endpoints GET api/CostCenters");
  }, 60000);
});
