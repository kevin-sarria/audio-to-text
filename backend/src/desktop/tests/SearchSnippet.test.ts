import { describe, it, expect } from "vitest";
import { buildSnippet } from "../library/searchSnippet.js";

describe("buildSnippet", () => {
  it("encuentra sin importar tildes y devuelve rangos sobre el texto ORIGINAL", () => {
    const s = buildSnippet("Hoy hablamos de la migración de la base", ["migracion"])!;
    expect(s.text).toBe("Hoy hablamos de la migración de la base");
    expect(s.ranges).toHaveLength(1);
    expect(s.text.slice(s.ranges[0]![0], s.ranges[0]![1])).toBe("migración");
  });

  it("recorta con contexto y marca el recorte con puntos suspensivos; los rangos incluyen el prefijo", () => {
    const original = `${"x".repeat(100)} migración ${"y".repeat(100)}`;
    const s = buildSnippet(original, ["migracion"])!;
    expect(s.text.startsWith("…")).toBe(true);
    expect(s.text.endsWith("…")).toBe(true);
    expect(s.text.length).toBeLessThan(original.length);
    expect(s.text.slice(s.ranges[0]![0], s.ranges[0]![1])).toBe("migración");
  });

  it("resalta todos los términos presentes en la ventana, ordenados y sin solaparse", () => {
    const s = buildSnippet("Revisar la migración y el presupuesto de la migración", ["presupuesto", "migracion", "mig"])!;
    const marked = s.ranges.map(([a, b]) => s.text.slice(a, b));
    expect(marked).toEqual(["migración", "presupuesto", "migración"]);
    for (let i = 1; i < s.ranges.length; i++) expect(s.ranges[i]![0]).toBeGreaterThanOrEqual(s.ranges[i - 1]![1]);
  });

  it("sin coincidencia devuelve null y los saltos de línea se convierten en espacios sin cambiar la longitud", () => {
    expect(buildSnippet("nada que ver", ["migracion"])).toBeNull();
    const s = buildSnippet("linea uno\nmigración\nlinea tres", ["migracion"])!;
    expect(s.text).toBe("linea uno migración linea tres");
    expect(s.text.slice(s.ranges[0]![0], s.ranges[0]![1])).toBe("migración");
  });
});
