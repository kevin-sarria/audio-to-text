import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import { buildInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import {
  parseScanResponse,
  findIncompleteSections,
  ScanResponse,
  ScanResponseSchema
} from "../../infrastructure/analysis/contextScan/ContextScanSchema.js";
import { verifyScanResponse } from "../../infrastructure/analysis/contextScan/SourceVerifier.js";

describe("ContextScan - Schema y SourceVerifier", () => {
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

  it("parseScanResponse acepta JSON puro y envuelto en fences ```json, rechaza basura con mensaje descriptivo", () => {
    const validJson = `
\`\`\`json
{
  "secciones": {
    "proposito": [
      { "dato": "Sistema de gestión", "fuente": "README.md" }
    ]
  },
  "no_encontrado": ["roles_permisos"]
}
\`\`\`
`;
    const res1 = parseScanResponse(validJson);
    expect(res1.ok).toBe(true);
    if (res1.ok) {
      expect(res1.data.secciones.proposito?.[0]?.dato).toBe("Sistema de gestión");
      expect(res1.data.no_encontrado).toContain("roles_permisos");
    }

    const invalidJson = "Esto no es un JSON en absoluto";
    const res2 = parseScanResponse(invalidJson);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error.length).toBeLessThanOrEqual(1500);
      expect(res2.error.toLowerCase()).toContain("error al parsear json");
    }
  });

  it("findIncompleteSections detecta secciones vacías o con datos en blanco", () => {
    const data: ScanResponse = ScanResponseSchema.parse({
      secciones: {
        proposito: [{ dato: "   ", fuente: "README.md" }], // en blanco
        tecnologias: [], // vacía
        contradicciones: [], // contradicciones vacía NO cuenta como incompleta
        preguntas_abiertas: [] // preguntas_abiertas vacía NO cuenta como incompleta
      },
      no_encontrado: ["roles_permisos"] // en no_encontrado no cuenta como incompleta
    });

    const incomplete = findIncompleteSections(data);
    expect(incomplete).toContain("proposito");
    expect(incomplete).toContain("tecnologias");
    expect(incomplete).not.toContain("contradicciones");
    expect(incomplete).not.toContain("preguntas_abiertas");
    expect(incomplete).not.toContain("roles_permisos");
  });

  it("verifyScanResponse descarta fuentes inexistentes, comandos inválidos, secretos y fuera de ruta", () => {
    const root = getCleanFixture("tres-repos");
    const inventory = buildInventory(root, { useGit: false });

    const rawResponse: ScanResponse = ScanResponseSchema.parse({
      secciones: {
        capas_estructura: [
          {
            dato: "Capa de persistencia con patrón Repository en backend-api/Repositories/",
            fuente: "inventario",
            valor: "backend-api/Repositories/"
          }
        ],
        verificacion: [
          {
            dato: "Pruebas unitarias del frontend ejecutadas con npm test",
            fuente: "frontend-app/package.json",
            valor: "npm test"
          },
          {
            dato: "Compilación de frontend con npm run build",
            fuente: "frontend-app/package.json",
            valor: "npm run build"
          }
        ],
        tecnologias: [
          {
            dato: "El frontend utiliza React 18 como librería principal",
            fuente: "frontend-app/package.json",
            valor: "React 18"
          }
        ],
        glosario: [
          {
            termino_reunion: "Sede",
            sinonimos: ["Sucursal"],
            nombre_codigo: "CostCenter",
            fuente: "backend-api/Models/Entities/CostCenter.cs"
          }
        ],
        proposito: [
          {
            dato: "Información fuera del proyecto",
            fuente: "../fuera.txt"
          },
          {
            dato: "Dato tomado de archivo de secretos",
            fuente: "backend-api/appsettings.json"
          }
        ]
      },
      no_encontrado: []
    });

    const { data: verified, stats, discarded } = verifyScanResponse(rawResponse, inventory, root);

    // 1. Descarta capa Repository porque la ruta backend-api/Repositories/ no existe y no hay cita que la respalde
    expect(verified.secciones.capas_estructura).toHaveLength(0);
    expect(discarded.some((d) => d.section === "capas_estructura" && d.reason.includes("ruta no existe"))).toBe(true);

    // 2. Descarta npm test del frontend (no existe en comandos de frontend-app)
    const verifItems = verified.secciones.verificacion || [];
    expect(verifItems.some((v) => v.valor === "npm test")).toBe(false);
    expect(discarded.some((d) => d.section === "verificacion" && d.reason.includes("comando no existe"))).toBe(true);

    // 3. Acepta npm run build
    expect(verifItems.some((v) => v.valor === "npm run build")).toBe(true);

    // 4. Marca sin confirmar una versión que no está en la fuente (React 18 vs react 19.1.0 en package.json)
    const tecItems = verified.secciones.tecnologias || [];
    expect(tecItems[0]?.estado).toBe("sin_confirmar");

    // 5. Verifica glosario sede -> CostCenter
    const gloItems = verified.secciones.glosario || [];
    expect(gloItems[0]?.estado).toBe("confirmado");

    // 6. Rechaza fuente fuera del proyecto y fuente secreta
    expect(discarded.some((d) => d.reason.includes("fuente fuera del proyecto"))).toBe(true);
    expect(discarded.some((d) => d.reason.includes("fuente con secretos"))).toBe(true);

    expect(stats.discarded).toBeGreaterThanOrEqual(4);
    // «Confirmado» exige una cita comprobada: el glosario sí (CostCenter está en el archivo);
    // «npm run build» existe en el inventario pero no está literal en package.json → sin confirmar.
    expect(stats.verified).toBeGreaterThanOrEqual(1);
    expect(verifItems.find((v) => v.valor === "npm run build")?.estado).toBe("sin_confirmar");
  });
});
