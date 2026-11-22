import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import { runContextScan } from "../../infrastructure/analysis/contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "../../infrastructure/analysis/contextScan/ScanBudget.js";
import { buildInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import {
  evaluateScan,
  ExpectedFact
} from "../../infrastructure/analysis/contextScan/ContextScanEvaluator.js";

describe("ContextScan - ContextScanOrchestrator", () => {
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

  it("orquesta escaneo completo, filtra alucinaciones, maneja reintentos y secciones faltantes, sin filtrar secretos", async () => {
    const root = getCleanFixture("tres-repos");
    const budget = resolveScanBudget("modelo-pequeno", undefined, 20); // presupuesto de llamadas suficiente para los chunks
    budget.maxInputChars = 8000;
    budget.chunkChars = 4000;

    let callCount = 0;

    const cannedMainSuccess = JSON.stringify({
      secciones: {
        proposito: [
          { dato: "Plataforma de sedes", fuente: "frontend-app/README.md" }
        ],
        repositorios: [
          { dato: "Estructura multi-repo", fuente: "inventario" }
        ],
        tecnologias: [
          { dato: "React en frontend", fuente: "frontend-app/package.json" }
        ],
        capas_estructura: [
          { dato: "Capa Repository en backend", fuente: "inventario", valor: "backend-api/Repositories/" } // alucinación: no existe
        ],
        glosario: [
          { termino_reunion: "Sede", sinonimos: ["Centro"], nombre_codigo: "CostCenter", fuente: "backend-api/Models/Entities/CostCenter.cs" }
        ],
        roles_permisos: [
          { dato: "Rol Supervisor de sede", fuente: "backend-api/docs/REGLAS.md", valor: "Supervisor" }
        ],
        flujos: [
          { dato: "Gestión de sedes", fuente: "frontend-app/src/pages/CentrosDeCosto.tsx" }
        ],
        reglas_negocio_ubicacion: [
          { dato: "Reglas documentadas en REGLAS.md", fuente: "backend-api/docs/REGLAS.md" }
        ],
        reglas_inquebrantables: [
          { dato: "Trazabilidad completa obligatoria", fuente: "backend-api/docs/REGLAS.md" }
        ],
        cambios_base_datos: [
          { dato: "Scripts SQL numerados", fuente: "backend-api/Database/Scripts/001_create_cost_centers.sql" }
        ],
        verificacion: [
          { dato: "Pruebas frontend con npm test", fuente: "frontend-app/package.json", valor: "npm test" }, // alucinación: no existe
          { dato: "Compilación con npm run build", fuente: "frontend-app/package.json", valor: "npm run build" }
        ],
        ramas_pr: [
          { dato: "Ramas principales main", fuente: "frontend-app/.github/workflows/deploy.yml" }
        ],
        despliegue: [
          { dato: "Despliegue histórico en puerto 3000 con PM2", fuente: "frontend-app/README.md", valor: "3000" }
        ],
        como_escribir_issues: [
          { dato: "Mencionar centro de costo afectado", fuente: "inventario" }
        ],
        contradicciones: [
          {
            descripcion: "README menciona PM2 puerto 3000 pero deploy.yml usa Nginx en puerto 80",
            fuentes: ["frontend-app/README.md", "frontend-app/.github/workflows/deploy.yml"],
            gana: "Nginx en puerto 80 (deploy.yml)",
            motivo: "codigo_sobre_documento"
          }
        ],
        preguntas_abiertas: []
      },
      no_encontrado: []
    });

    const mockLlm = vi.fn().mockImplementation(async (systemPrompt: string, userPrompt: string) => {
      callCount++;
      // Si es resumen de pedazo de documento
      if (systemPrompt.includes("extractor de hechos técnicos")) {
        return JSON.stringify({ hechos: ["Hecho extraído de sección"] });
      }

      // Si es el re-pedido de secciones faltantes
      if (userPrompt.includes("Las siguientes secciones quedaron vacías")) {
        return JSON.stringify({ secciones: {}, no_encontrado: [] });
      }

      // Simular que la primera llamada principal falla con JSON inválido para probar el reintento
      if (callCount === 2) {
        return "Respuesta inválida que no es JSON { incompleto";
      }

      // Segunda llamada principal (reintento) devuelve éxito
      return cannedMainSuccess;
    });

    const result = await runContextScan(root, mockLlm, {
      budget,
      providerLabel: "OpenAI",
      model: "gpt-4o-mini",
      useGit: false
    });

    // 1. Verificar las 16 secciones en el Markdown
    for (let i = 1; i <= 16; i++) {
      expect(result.technicalContext).toContain(`## ${i}. `);
    }

    // 2. No contiene "Repositories/" (alucinación descartada)
    expect(result.technicalContext).not.toContain("Repositories/");

    // 3. En §11 dice que frontend-app no tiene script de pruebas
    expect(result.technicalContext).toContain("frontend-app: no tiene script de pruebas (`test`) en package.json");

    // 4. §14 contiene las 5 viñetas fijas
    expect(result.technicalContext).toContain("- Indicar qué repositorio o módulo toca cada issue.");
    expect(result.technicalContext).toContain("- Citar las reglas afectadas por su código.");
    expect(result.technicalContext).toContain("- Avisar cuando lo pedido contradice una regla vigente.");
    expect(result.technicalContext).toContain("- Incluir las tareas obligatorias del proyecto (documentación, scripts de base de datos, pruebas) cuando apliquen.");
    expect(result.technicalContext).toContain("- Separar lo decidido en la reunión de lo que quedó en duda.");

    // 5. El reporte trae notFullyRead con backend-api/docs/REGLAS.md
    expect(result.report.notFullyRead).toContain("backend-api/docs/REGLAS.md");
    const docEntry = result.report.readLog.find((l) => l.path === "backend-api/docs/REGLAS.md");
    expect(docEntry?.status).toBe("sections");

    // 6. Descartó al menos 2 datos (la capa Repositories y el npm test inexistente)
    expect(result.report.verification.discarded).toBeGreaterThanOrEqual(2);

    // 7. NINGÚN prompt enviado contiene secretos
    for (const call of mockLlm.mock.calls) {
      const sysArg = call[0] || "";
      const userArg = call[1] || "";
      expect(sysArg).not.toContain("NO-DEBE-SALIR");
      expect(sysArg).not.toContain("SuperSecreta123");
      expect(sysArg).not.toContain("10.20.30.40");
      expect(userArg).not.toContain("NO-DEBE-SALIR");
      expect(userArg).not.toContain("SuperSecreta123");
      expect(userArg).not.toContain("10.20.30.40");
    }

    // 8. Reintento funcionó y llmCalls lo cuenta
    expect(result.report.llmCalls).toBeGreaterThanOrEqual(3);

    // 9. ContextScanEvaluator con expected.json
    const expectedPath = path.resolve(process.cwd(), "src/tests/fixtures/context-scan/tres-repos/expected.json");
    const expectedFacts: ExpectedFact[] = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));
    const inventory = buildInventory(root, { useGit: false });
    const evalRes = evaluateScan(result, inventory, expectedFacts);

    expect(evalRes.falseFacts).toHaveLength(0);
    expect(evalRes.found).toBe(evalRes.total);
  });

  it("llama a onProgress con las etapas principales del escaneo", async () => {
    const root = getCleanFixture("sin-git");
    const budget = resolveScanBudget("modelo-pequeno", undefined, 5);
    const progressMessages: string[] = [];

    const cannedResponse = JSON.stringify({
      secciones: {
        proposito: [{ dato: "Plataforma sin git", fuente: "README.md" }],
        repositorios: [],
        tecnologias: [],
        capas_estructura: [],
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
        preguntas_abiertas: []
      },
      no_encontrado: []
    });

    const mockLlm = vi.fn().mockImplementation(async (sys: string) => {
      if (sys.includes("extractor de hechos técnicos")) {
        return JSON.stringify({ hechos: ["Hecho resumido"] });
      }
      return cannedResponse;
    });

    await runContextScan(root, mockLlm, {
      budget,
      providerLabel: "Prueba",
      model: "gpt-4o-mini",
      useGit: false,
      onProgress: (msg) => {
        progressMessages.push(msg);
      }
    });

    expect(progressMessages).toContain("Inventario y lectura del código");
    expect(progressMessages).toContain("Leyendo documentos");
    expect(progressMessages).toContain("Análisis principal con IA");
    expect(progressMessages).toContain("Verificando fuentes y armando el contexto");
  });
});
