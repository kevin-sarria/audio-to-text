import { describe, it, expect } from "vitest";
import { buildKillScript } from "../infrastructure/connectors/live/BrowserLauncher.js";

describe("buildKillScript", () => {
  it("sin argumento filtra por bot-chrome-session (CLI)", () => {
    expect(buildKillScript()).toContain("'bot-chrome-session'");
  });

  it("con perfil filtra por la ruta literal y no por bot-chrome-session", () => {
    const script = buildKillScript("C:\\Users\\Ana\\AppData\\bot\\profile");
    expect(script).toContain("'C:\\Users\\Ana\\AppData\\bot\\profile'");
    expect(script).not.toContain("bot-chrome-session");
  });

  it("duplica las comillas simples de la ruta", () => {
    const script = buildKillScript("C:\\Users\\O'Neil\\bot\\profile");
    expect(script).toContain("O''Neil");
  });

  it("no usa -like, así los comodines de la ruta no rompen el filtro", () => {
    expect(buildKillScript("C:\\a[1]*\\p")).not.toContain("-like");
  });
});
