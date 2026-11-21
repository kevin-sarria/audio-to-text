import { describe, it, expect } from "vitest";
import {
  concreteSignals,
  isConcrete,
  stripRenderNoise
} from "../../infrastructure/analysis/contextScan/FactConcreteness.js";

describe("FactConcreteness — dato vs tema", () => {
  it.each([
    "Aprobador exclusivo de pull requests",
    "Roles permitidos en la app móvil",
    "Estrategia de inicialización de base de datos",
    "Estrategia de migraciones",
    "Flujo de aprobación de PR",
    "Gestión de sedes",
    "Trazabilidad completa obligatoria",
    "Uso de CI/CD",
    "Separación lectura/escritura",
    "- Aprobador de pull requests (fuente: CONTRIBUTING.md)",
    "- Roles de la API (fuente: docs/roles.md) _(sin confirmar)_"
  ])("«%s» es un tema", (text) => {
    expect(isConcrete(text)).toBe(false);
  });

  it.each([
    ["Los PR los aprueba solo María López; sin su aprobación no se fusionan", "nombre_propio"],
    ["No hay migraciones: el esquema se crea con EnsureCreated al arrancar", "identificador"],
    ["Los scripts manuales van en db/scripts/", "ruta"],
    ["La lógica vive en src/Services", "ruta"],
    ["Las reglas están en REGLAS_NEGOCIO.md", "ruta"],
    ["Las pruebas se corren con npm test", "comando"],
    ["Escucha en el puerto 8080", "numero"],
    ["Usa la base `campo_compartida`", "cita"],
    ["El panel dice «Nueva Sede»", "cita"],
    ["Documentación en https://docs.ejemplo.test/api", "url"],
    ["Se despliega con GitHub Actions", "identificador"],
    ["Solo roles Supervisor y Tecnico entran a la app", "nombre_propio"],
    ["Ramas principales: main y develop", "identificador"],
    ["Los cambios entran desde feature/nombre", "ruta"],
    ["Autenticación con JWT", "identificador"],
    ["Endpoints protegidos con [Authorize(Roles = \"Admin\")]", "identificador"],
    ["Reglas citadas como RN-01", "numero"],
    ["La app sincroniza con campo-api al recuperar señal", "identificador"],
    ["FastAPI como framework del servicio", "identificador"]
  ])("«%s» es un dato (%s)", (text, signal) => {
    expect(isConcrete(text)).toBe(true);
    expect(concreteSignals(text)).toContain(signal);
  });

  it("nombrar el repo o citar la regla entre paréntesis no convierte un tema en dato", () => {
    const scopeNames = ["campo-api", "campo-movil"];
    expect(isConcrete("Comando de ejecución de pruebas en campo-api", { scopeNames })).toBe(false);
    expect(isConcrete("Repositorio campo-movil", { scopeNames })).toBe(false);
    expect(isConcrete("Roles permitidos para acceder a la app móvil (RN-02)", { scopeNames })).toBe(false);
    // Con la respuesta, sí es dato.
    expect(isConcrete("Las pruebas de campo-api se corren con dotnet test", { scopeNames })).toBe(true);
    expect(isConcrete("Solo Supervisor y Tecnico entran a la app (RN-02)", { scopeNames })).toBe(true);
    // Un repo que NO es del proyecto (p. ej. una dependencia) sí cuenta.
    expect(isConcrete("Sincroniza con otro-servicio", { scopeNames })).toBe(true);
  });

  it("«CI/CD» y «React/Vite» no cuentan como rutas", () => {
    expect(concreteSignals("Pipeline de CI/CD")).not.toContain("ruta");
    expect(concreteSignals("frontend/backend separados")).not.toContain("ruta");
  });

  it("la palabra en mayúscula al inicio de una oración no es nombre propio", () => {
    expect(concreteSignals("Roles permitidos. Sedes activas")).not.toContain("nombre_propio");
  });

  it("stripRenderNoise quita viñeta, fuente y marca de sin confirmar", () => {
    expect(stripRenderNoise("- Algo concreto (fuente: a/b.md) _(sin confirmar)_")).toBe("Algo concreto");
  });
});
