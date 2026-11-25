import { describe, it, expect } from "vitest";
import { escapeLike, flattenJsonText, normalizeSearchText, parseSearchQuery } from "../library/searchText.js";

describe("searchText", () => {
  it("normaliza sin tildes y en minúsculas conservando la longitud (las posiciones valen para el original)", () => {
    expect(normalizeSearchText("Migración ÁÉÍÓÚ Ñandú")).toBe("migracion aeiou nandu");
    for (const sample of ["Reunión de migración", "😀 Ñandú café", "İstanbul ß straße", "á combinado"]) {
      expect(normalizeSearchText(sample).length).toBe(sample.length);
    }
  });

  it("parseSearchQuery normaliza, descarta términos de menos de 2 letras, deduplica y limita a 5", () => {
    expect(parseSearchQuery("  Migración   BASE ")).toEqual(["migracion", "base"]);
    expect(parseSearchQuery("a b cd")).toEqual(["cd"]);
    expect(parseSearchQuery("uno uno UNO dos")).toEqual(["uno", "dos"]);
    expect(parseSearchQuery("aa bb cc dd ee ff gg")).toEqual(["aa", "bb", "cc", "dd", "ee"]);
    expect(parseSearchQuery(undefined)).toEqual([]);
    expect(parseSearchQuery("   ")).toEqual([]);
    expect(parseSearchQuery("x")).toEqual([]);
  });

  it("escapeLike escapa %, _ y la barra invertida", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });

  it("flattenJsonText junta solo los valores de texto, no las claves", () => {
    const raw = JSON.stringify([{ text: "Migrar el viernes", evidence: "Vamos a migrar" }, "otro texto", 42, null]);
    const flat = flattenJsonText(raw);
    expect(flat).toContain("Migrar el viernes");
    expect(flat).toContain("Vamos a migrar");
    expect(flat).toContain("otro texto");
    expect(flat).not.toContain("evidence");
    expect(flattenJsonText("no es json")).toBe("");
    expect(flattenJsonText(null)).toBe("");
  });
});
