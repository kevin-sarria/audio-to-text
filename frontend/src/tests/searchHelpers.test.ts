import { describe, it, expect } from "vitest";
import { normalizeQueryInput, splitHighlight } from "../features/history/searchHelpers.js";

describe("searchHelpers", () => {
  it("normalizeQueryInput recorta y solo busca con 2 o más letras", () => {
    expect(normalizeQueryInput("  migración ")).toBe("migración");
    expect(normalizeQueryInput("a")).toBeUndefined();
    expect(normalizeQueryInput("   ")).toBeUndefined();
    expect(normalizeQueryInput("")).toBeUndefined();
  });

  it("splitHighlight parte el texto en trozos resaltados y normales", () => {
    expect(splitHighlight({ text: "Hablamos de la migración hoy", ranges: [[15, 24]] })).toEqual([
      { text: "Hablamos de la ", highlight: false },
      { text: "migración", highlight: true },
      { text: " hoy", highlight: false }
    ]);
  });

  it("maneja rangos en los bordes y varios rangos", () => {
    expect(splitHighlight({ text: "abc def", ranges: [[0, 3], [4, 7]] })).toEqual([
      { text: "abc", highlight: true },
      { text: " ", highlight: false },
      { text: "def", highlight: true }
    ]);
  });

  it("sin rangos devuelve un solo trozo y recorta rangos inválidos", () => {
    expect(splitHighlight({ text: "hola", ranges: [] })).toEqual([{ text: "hola", highlight: false }]);
    expect(splitHighlight({ text: "hola", ranges: [[2, 99], [-5, -1], [3, 3]] })).toEqual([
      { text: "ho", highlight: false },
      { text: "la", highlight: true }
    ]);
  });
});
