import { describe, it, expect } from "vitest";
import {
  buildKillScript,
  buildGracefulCloseScript,
  preferredBrowserCandidates
} from "../infrastructure/connectors/live/BrowserLauncher.js";

describe("buildGracefulCloseScript", () => {
  const profile = "C:\\Users\\Ana\\AppData\\bot\\profile";

  it("pide el cierre normal (taskkill sin /F) a la ventana del navegador para que guarde las cookies", () => {
    const script = buildGracefulCloseScript(profile, 10_000);
    expect(script).toContain("taskkill.exe /PID");
    expect(script).not.toMatch(/taskkill[^;\n]*\/F/i);
  });

  it("solo fuerza el cierre después de esperar el tiempo indicado", () => {
    const script = buildGracefulCloseScript(profile, 10_000);
    expect(script).toContain("Wait-Process");
    expect(script).toContain("-Timeout 10");
    expect(script.indexOf("Wait-Process")).toBeLessThan(script.lastIndexOf("Stop-Process"));
  });

  it("devuelve none, closed o forced para que la app sepa qué pasó", () => {
    const script = buildGracefulCloseScript(profile, 10_000);
    expect(script).toContain("'none'");
    expect(script).toContain("'closed'");
    expect(script).toContain("'forced'");
  });

  it("filtra por la ruta literal del perfil, con comillas simples duplicadas y sin -like", () => {
    const script = buildGracefulCloseScript("C:\\Users\\O'Neil\\bot\\profile", 10_000);
    expect(script).toContain("O''Neil");
    expect(script).not.toContain("-like");
  });

  it("sin perfil usa el del CLI (bot-chrome-session)", () => {
    expect(buildGracefulCloseScript(undefined, 5_000)).toContain("'bot-chrome-session'");
  });
});

describe("preferredBrowserCandidates", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\Ana\\AppData\\Local" };

  it("Chrome se busca también en (x86) y en la instalación por usuario", () => {
    const list = preferredBrowserCandidates("chrome", env);
    expect(list).toContain("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
    expect(list).toContain("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
    expect(list).toContain("C:\\Users\\Ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe");
  });

  it("Edge se busca en Program Files y en (x86)", () => {
    const list = preferredBrowserCandidates("msedge", env);
    expect(list).toContain("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");
    expect(list).toContain("C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe");
  });

  it("auto o un valor desconocido no tienen candidatos propios", () => {
    expect(preferredBrowserCandidates("auto", env)).toEqual([]);
    expect(preferredBrowserCandidates(undefined, env)).toEqual([]);
  });

  it("sin LOCALAPPDATA no mete rutas vacías", () => {
    expect(preferredBrowserCandidates("chrome", {})).not.toContain("");
  });
});

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
