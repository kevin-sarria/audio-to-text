import { describe, it, expect } from "vitest";
import { describeImportResult } from "../features/history/importResult.js";
import type { ImportBotMeetingsResultDto } from "@audio-to-text/shared";

const base: ImportBotMeetingsResultDto = { imported: 0, alreadyImported: 0, failed: [], folderMissing: false, folder: "C:/salida" };

describe("describeImportResult", () => {
  it("informa cuántas reuniones nuevas se importaron", () => {
    expect(describeImportResult({ ...base, imported: 2, alreadyImported: 1 })).toEqual({
      severity: "success",
      message: "Se importaron 2 reuniones nuevas (1 ya estaba importada)."
    });
    expect(describeImportResult({ ...base, imported: 1 }).message).toBe("Se importó 1 reunión nueva.");
  });

  it("sin novedades lo dice claramente", () => {
    expect(describeImportResult({ ...base, alreadyImported: 3 })).toEqual({
      severity: "info",
      message: "No hay reuniones nuevas. 3 ya estaban importadas."
    });
    expect(describeImportResult(base)).toEqual({ severity: "info", message: "No hay reuniones nuevas para importar." });
  });

  it("avisa de archivos con error y nombra el primero", () => {
    const r = describeImportResult({
      ...base,
      imported: 1,
      failed: [
        { file: "reunion_a.json", reason: "JSON inválido o archivo ilegible" },
        { file: "reunion_b.json", reason: "Archivo no válido" }
      ]
    });
    expect(r.severity).toBe("warning");
    expect(r.message).toContain("Se importó 1 reunión nueva.");
    expect(r.message).toContain("2 archivos no se pudieron importar");
    expect(r.message).toContain("reunion_a.json: JSON inválido o archivo ilegible");
  });

  it("si la carpeta de entrega no existe lo explica con su ruta", () => {
    const r = describeImportResult({ ...base, folderMissing: true });
    expect(r.severity).toBe("warning");
    expect(r.message).toContain("C:/salida");
    expect(r.message).toContain("no existe");
  });
});
