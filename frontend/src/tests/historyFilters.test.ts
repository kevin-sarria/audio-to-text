import { describe, it, expect } from "vitest";
import { buildLibraryParams, EMPTY_FILTERS, hasActiveFilters } from "../features/history/historyFilters.js";

describe("historyFilters", () => {
  it("sin filtros ni búsqueda solo manda page y limit", () => {
    expect(buildLibraryParams(EMPTY_FILTERS, undefined, 2, 20)).toEqual({ page: 2, limit: 20 });
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("manda solo los filtros con valor y la búsqueda", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, source: "BOT", participant: "Ana", folderId: "f1" }, "migracion", 1, 20);
    expect(params).toEqual({ page: 1, limit: 20, q: "migracion", source: "BOT", participant: "Ana", folderId: "f1" });
  });

  it("convierte las fechas (día local) en instantes ISO: desde = inicio del día, hasta = fin del día", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, from: "2026-11-10", to: "2026-11-12" }, undefined, 1, 20);
    expect(params["from"]).toBe(new Date(2026, 10, 10, 0, 0, 0, 0).toISOString());
    expect(params["to"]).toBe(new Date(2026, 10, 12, 23, 59, 59, 999).toISOString());
  });

  it("ignora fechas mal formadas y detecta filtros activos", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, from: "10/11/2026", to: "" }, undefined, 1, 20);
    expect(params).toEqual({ page: 1, limit: 20 });
    expect(hasActiveFilters({ ...EMPTY_FILTERS, from: "2026-11-10" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, source: "AUDIO" })).toBe(true);
  });

  it("el origen ALL y los textos vacíos no viajan; una búsqueda vacía tampoco", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, source: "ALL", participant: "", folderId: "" }, "", 3, 10);
    expect(Object.keys(params).sort()).toEqual(["limit", "page"]);
    expect(params).toEqual({ page: 3, limit: 10 });
  });

  it("un solo extremo del rango de fechas no arrastra al otro", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, to: "2026-11-12" }, undefined, 1, 20);
    expect(params["from"]).toBeUndefined();
    expect(params["to"]).toBe(new Date(2026, 10, 12, 23, 59, 59, 999).toISOString());
  });
});
