import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { copyFixture } from "../helpers/contextScanFixtures.js";
import { buildInventory, ProjectInventory } from "../../infrastructure/analysis/contextScan/ProjectInventory.js";
import { ScanResponseSchema, ScanItem } from "../../infrastructure/analysis/contextScan/ContextScanSchema.js";
import { verifyScanResponse } from "../../infrastructure/analysis/contextScan/SourceVerifier.js";
import { buildCiteIndex, normalizeForCite } from "../../infrastructure/analysis/contextScan/verification/citeMatcher.js";
import { renderFact } from "../../infrastructure/analysis/contextScan/ContextScanRenderer.js";

describe("citeMatcher", () => {
  const doc = [
    "# Guía",
    "",
    "## Flujo de ramas (obligatorio)",
    "Todo cambio entra por **pull request** a `develop`. Los PR los aprueba",
    "solo Laura Méndez; sin su aprobación no se fusionan.",
    "Ver [la guía](https://x.test/guia)."
  ].join("\n");
  const idx = buildCiteIndex(doc);

  it("encuentra la cita sin importar tildes, mayúsculas, Markdown ni saltos de línea, y da la línea", () => {
    expect(idx.find("los PR los aprueba solo laura mendez")).toBe(4);
    expect(idx.find("Todo cambio entra por pull request a develop")).toBe(4);
    expect(idx.find("Ver la guía")).toBe(6);
  });

  it("acepta citas recortadas con «…» si los fragmentos aparecen en orden", () => {
    expect(idx.find("Todo cambio entra por pull request … sin su aprobación no se fusionan")).toBe(4);
    expect(idx.find("sin su aprobación no se fusionan … Todo cambio entra")).toBeNull();
  });

  it("rechaza lo que no está y las citas demasiado cortas", () => {
    expect(idx.find("Los PR los aprueba Tomás Rivas")).toBeNull();
    expect(idx.find("PR")).toBeNull();
  });

  it("normalizeForCite deja una forma comparable", () => {
    expect(normalizeForCite("«Sesión  ÚNICA» — `RN-04`")).toBe("sesion unica - rn-04");
  });
});

describe("SourceVerifier — verificación por cita (fixture multi-repo-git)", () => {
  let root = "";
  let inventory: ProjectInventory;

  beforeAll(() => {
    root = copyFixture("multi-repo-git");
    inventory = buildInventory(root, { useGit: true });
  });
  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  const verify = (secciones: Record<string, unknown>, discardTopics = false) =>
    verifyScanResponse(ScanResponseSchema.parse({ secciones, no_encontrado: [] }), inventory, root, { discardTopics });

  it("confirma por cita, completa archivo:línea y no marca como tema un valor concreto", () => {
    const { data } = verify({
      ramas_pr: [
        {
          valor: "Los PR los aprueba solo Laura Méndez",
          cita: "Los PR los aprueba solo Laura Méndez; sin su aprobación no se fusionan.",
          fuente: "campo-api/CLAUDE.md"
        }
      ]
    });
    const item = data.secciones.ramas_pr[0]!;
    expect(item.estado).toBe("confirmado");
    expect(item.fuente).toBe("campo-api/CLAUDE.md:4");
    expect(item.tema).toBe(false);
  });

  it("si la cita no está en la fuente indicada, la busca en los demás archivos y corrige la fuente", () => {
    const { data } = verify({
      roles_permisos: [
        {
          valor: "A la app móvil solo entran Supervisor y Tecnico",
          cita: "Solo los roles Supervisor y Tecnico pueden entrar a la app móvil.",
          fuente: "campo-api/README.md"
        }
      ]
    });
    const item = data.secciones.roles_permisos[0]!;
    expect(item.estado).toBe("confirmado");
    expect(item.fuente).toMatch(/docs\/REGLAS_NEGOCIO\.md:\d+$/);
  });

  it("acepta fuentes relativas al repo y no trata «CI/CD» como carpeta", () => {
    const { data, discarded } = verify({
      capas_estructura: [
        {
          valor: "La lógica de negocio vive en src/CampoApi/Services/ y el pipeline de CI/CD corre en GitHub Actions",
          cita: "El pipeline de CI/CD corre en GitHub Actions.",
          fuente: "README.md"
        },
        {
          valor: "Controladores en src/CampoApi/Controllers/",
          fuente: "src/CampoApi/Controllers/IncidenciasController.cs"
        }
      ]
    });
    expect(discarded).toHaveLength(0);
    expect(data.secciones.capas_estructura.map((i: ScanItem) => i.estado)).toEqual(["confirmado", "sin_confirmar"]);
  });

  it("una ruta inexistente sin cita se descarta; con cita confirmada se respeta", () => {
    const { discarded } = verify({
      capas_estructura: [{ valor: "Repositorios en src/CampoApi/Repositories/", fuente: "campo-api/README.md" }]
    });
    expect(discarded[0]?.reason).toBe("la ruta no existe");

    const { data } = verify({
      despliegue: [
        {
          valor: "En desarrollo las fotos van a disco en wwwroot/fotos y en servidores a S3",
          cita: "En desarrollo las fotos van a disco (wwwroot/fotos); en pruebas y producción, a S3.",
          fuente: "campo-api/src/CampoApi/Services/FotoStorage.cs"
        }
      ]
    });
    expect(data.secciones.despliegue[0]?.estado).toBe("confirmado");
  });

  it("un dato deducido queda «deducido» con sus fuentes, distinto de «sin confirmar»", () => {
    const { data } = verify({
      roles_permisos: [
        {
          valor: "El panel y la app calculan los permisos con modelos distintos (PERMISOS_POR_ROL vs claim cap)",
          cita: null,
          fuente: "campo-panel/src/auth/permisosPanel.ts",
          deducido_de: ["campo-panel/src/auth/permisosPanel.ts", "campo-movil/src/auth/permisosMovil.ts"]
        }
      ]
    });
    const item = data.secciones.roles_permisos[0]!;
    expect(item.estado).toBe("deducido");
    expect(item.fuente).toBe("campo-panel/src/auth/permisosPanel.ts, campo-movil/src/auth/permisosMovil.ts");
    expect(renderFact(item)).toContain("_(deducido de campo-panel/src/auth/permisosPanel.ts");
  });

  it("marca los temas; con discardTopics los descarta, salvo que una cita confirmada traiga el dato", () => {
    const secciones = {
      ramas_pr: [
        { valor: "Aprobador exclusivo de pull requests", fuente: "campo-api/CLAUDE.md" },
        {
          valor: "Aprobación obligatoria de PR",
          cita: "Los PR los aprueba solo Laura Méndez",
          fuente: "campo-api/CLAUDE.md"
        }
      ],
      verificacion: [{ valor: "Comando de pruebas en campo-api", fuente: "inventario" }]
    };
    const first = verify(secciones);
    expect(first.stats.topics).toBe(2);
    expect(first.data.secciones.ramas_pr[0]!.tema).toBe(true);

    const final = verify(secciones, true);
    expect(final.data.secciones.ramas_pr).toHaveLength(1);
    expect(final.data.secciones.verificacion).toHaveLength(0);
    expect(final.discarded.filter((d) => d.reason === "nombra el tema sin dar el dato")).toHaveLength(2);
    // El que sobrevive se muestra con la cita, que es la que trae el nombre.
    expect(renderFact(final.data.secciones.ramas_pr[0]!)).toContain("«Los PR los aprueba solo Laura Méndez»");
  });

  it("acepta el formato anterior (dato sin valor) copiando dato a valor", () => {
    const parsed = ScanResponseSchema.parse({
      secciones: { proposito: [{ dato: "API REST de Campo en .NET 8", fuente: "campo-api/README.md" }] }
    });
    expect(parsed.secciones.proposito[0]!.valor).toBe("API REST de Campo en .NET 8");
  });
});
