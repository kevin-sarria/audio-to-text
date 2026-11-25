import path from "node:path";
import { describe, it, expect } from "vitest";
import { resolveBotOutputDir } from "../../infrastructure/bot/botOutputDir.js";

describe("resolveBotOutputDir", () => {
  it("usa la carpeta configurada si existe (resuelta a ruta absoluta)", () => {
    expect(resolveBotOutputDir({ botOutputDir: "  C:/reuniones/salida  " }, "C:/repo")).toBe(path.resolve("C:/reuniones/salida"));
  });

  it("sin configuración usa <raíz>/output, igual que el bot", () => {
    expect(resolveBotOutputDir({}, "C:/repo")).toBe(path.resolve("C:/repo", "output"));
    expect(resolveBotOutputDir({ botOutputDir: "   " }, "C:/repo")).toBe(path.resolve("C:/repo", "output"));
  });

  it("si el proceso corre desde backend/ o algorithm-manager-bot/ sube a la raíz", () => {
    expect(resolveBotOutputDir({}, path.join("C:/repo", "backend"))).toBe(path.resolve("C:/repo", "output"));
    expect(resolveBotOutputDir({}, path.join("C:/repo", "algorithm-manager-bot"))).toBe(path.resolve("C:/repo", "output"));
    expect(resolveBotOutputDir({}, path.join("C:/repo", "desktop"))).toBe(path.resolve("C:/repo", "output"));
  });

  it("compara por nombre de carpeta: mybackend no se trata como backend", () => {
    const cwd = path.join("C:/repo", "mybackend");
    expect(resolveBotOutputDir({}, cwd)).toBe(path.resolve(cwd, "output"));
  });
});
