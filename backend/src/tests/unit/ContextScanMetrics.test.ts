import { describe, it, expect } from "vitest";
import {
  answerQuestion,
  compileAnswerTerm,
  computeContextMetrics,
  extractScopeNames,
  parseContextSections
} from "../../infrastructure/analysis/contextScan/ContextScanMetrics.js";
import { evaluateScan, ExpectedFact } from "../../infrastructure/analysis/contextScan/ContextScanEvaluator.js";

const CONTEXT = `# Contexto técnico — demo
Generado el 2026-11-21 10:00 · commit(s): api@abc1234 · Prueba / m

## 2. Repositorios
**Del inventario:**
- 2 repositorio(s) — repositorios separados
  - \`api\`

- Estructura multi-repo (fuente: inventario) _(sin confirmar)_

## 5. Glosario (cómo se dice en las reuniones → nombre en el código)
| Cómo se dice en las reuniones | Sinónimos | Nombre en el código | Fuente |
| --- | --- | --- | --- |
| Incidencia | | \`Reclamo\` o \`Novedad\` | api/docs/REGLAS.md |

## 6. Roles y permisos
- Roles permitidos en la app móvil (fuente: api/docs/REGLAS.md) _(sin confirmar)_
- La app móvil admite solo **Supervisor** y **Técnico** (fuente: api/docs/REGLAS.md)

## 12. Ramas, PR y quién aprueba
- Aprobador exclusivo de pull requests (fuente: api/CLAUDE.md)
- Las pruebas de la API corren en prueba* (fuente: api/CLAUDE.md)

## 15. Contradicciones encontradas
No se encontraron contradicciones.
`;

describe("ContextScanMetrics", () => {
  it("parte el contexto en secciones con su clave y separa el bloque del inventario", () => {
    const sections = parseContextSections(CONTEXT);
    const keys = sections.map((s) => s.key);
    expect(keys).toEqual(["repositorios", "glosario", "roles_permisos", "ramas_pr", "contradicciones"]);

    const repos = sections.find((s) => s.key === "repositorios")!;
    expect(repos.modelLines.join("\n")).not.toContain("2 repositorio(s)");
    expect(repos.modelLines.join("\n")).toContain("Estructura multi-repo");
  });

  it("cuenta temas y «sin confirmar» solo en las líneas del modelo de las secciones de datos", () => {
    const m = computeContextMetrics(CONTEXT);
    // repositorios (1) + roles (2) + ramas (2); el glosario y el inventario no cuentan.
    expect(m.dataLines).toBe(5);
    // «Roles permitidos…», «Aprobador exclusivo…» y «Las pruebas… prueba*». «Estructura multi-repo» sí responde el layout.
    expect(m.themeLines).toBe(3);
    expect(m.unconfirmedLines).toBe(2);
    expect(m.themeRate).toBe(60);
    expect(m.unconfirmedRate).toBe(40);
    expect(m.themeExamples[0]).toContain("[roles_permisos]");
  });

  it("saca los nombres del proyecto de los bloques del inventario, no de las líneas del modelo", () => {
    const md = `## 2. Repositorios
**Del inventario:**
- 2 repositorio(s) — repositorios separados
  - \`api\`
  - \`web\` (remoto: https://x.test/web.git)

- Repositorio \`inventado-por-el-modelo\` (fuente: inventario)

## 11. Cómo se verifica un cambio
**Del inventario:**
- Carpeta \`web\`:
  - \`npm test\`
- \`worker/package.json\` sin pruebas

## 13. Despliegue y entornos
**Del inventario:**
- \`Dockerfile\` (dockerfile):
  - \`EXPOSE 8000\`
`;
    expect(extractScopeNames(md).sort()).toEqual(["api", "web", "worker"]);
  });

  it("una pregunta se responde solo si todos los términos están en la misma línea de la sección", () => {
    const yes = answerQuestion(CONTEXT, {
      id: "roles", pregunta: "¿Qué roles entran a la app?", seccion: "roles_permisos",
      respuesta: ["movil|app", "Supervisor", "Tecnico"]
    });
    expect(yes.answered).toBe(true);
    expect(yes.evidence).toContain("Supervisor");

    const theme = answerQuestion(CONTEXT, {
      id: "aprueba", pregunta: "¿Quién aprueba?", seccion: "ramas_pr", respuesta: ["Laura Mendez"]
    });
    expect(theme.answered).toBe(false);

    const wrongSection = answerQuestion(CONTEXT, {
      id: "x", pregunta: "?", seccion: "despliegue", respuesta: ["Supervisor"]
    });
    expect(wrongSection.answered).toBe(false);
  });

  it("las filas de la tabla del glosario cuentan como una línea", () => {
    const r = answerQuestion(CONTEXT, {
      id: "g", pregunta: "¿Qué es una Incidencia?", seccion: "glosario", respuesta: ["Incidencia", "Reclamo", "Novedad"]
    });
    expect(r.answered).toBe(true);
  });

  it("compileAnswerTerm: palabras completas, alternativas y prefijos", () => {
    expect(compileAnswerTerm("PR").test("los pr se aprueban")).toBe(true);
    expect(compileAnswerTerm("PR").test("pruebas unitarias")).toBe(false);
    expect(compileAnswerTerm("identic*").test("es identico en los 3")).toBe(true);
    expect(compileAnswerTerm("pull request|PR").test("todo entra por pull request")).toBe(true);
    expect(compileAnswerTerm("Técnico").test("tecnico")).toBe(true);
    expect(compileAnswerTerm("db/scripts*").test("van en db/scripts/ numerados")).toBe(true);
  });
});

describe("ContextScanEvaluator — preguntas y métricas", () => {
  it("evalúa las preguntas aparte de los hechos y adjunta las métricas", () => {
    const expected: ExpectedFact[] = [
      { id: "c1", descripcion: "menciona Reclamo", tipo: "context-contains", texto: "Reclamo" },
      { id: "q1", tipo: "pregunta", seccion: "roles_permisos", pregunta: "¿Roles app?", respuesta: ["Supervisor"] },
      { id: "q2", tipo: "pregunta", seccion: "ramas_pr", pregunta: "¿Quién aprueba?", respuesta: ["Laura"] }
    ];
    const result = evaluateScan(
      { technicalContext: CONTEXT, report: {} as any },
      {} as any,
      expected
    );
    expect(result.found).toBe(1);
    expect(result.total).toBe(1);
    expect(result.questions.total).toBe(2);
    expect(result.questions.answered).toBe(1);
    expect(result.metrics.dataLines).toBe(5);
  });
});
