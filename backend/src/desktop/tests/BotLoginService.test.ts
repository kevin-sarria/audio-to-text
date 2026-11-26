import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BotLoginService, interpretAccountPage } from "../bot/BotLoginService.js";
import { resolveBotPaths } from "../bot/BotPaths.js";

describe("interpretAccountPage", () => {
  it("con correo visible y sin redirección al login: vinculada", () => {
    expect(interpretAccountPage("https://myaccount.google.com/?pli=1", "Hola, Ana\nana.bot@gmail.com\nCuenta")).toEqual({
      linked: true,
      email: "ana.bot@gmail.com"
    });
  });

  it("redirigida a accounts.google.com: no vinculada aunque haya un correo en el texto", () => {
    expect(interpretAccountPage("https://accounts.google.com/signin/v2", "Usar otra cuenta x@y.com")).toEqual({
      linked: false,
      email: null
    });
  });

  it("en myaccount sin correo legible: no vinculada", () => {
    expect(interpretAccountPage("https://myaccount.google.com/", "Cargando")).toEqual({ linked: false, email: null });
  });

  it("URL no parseable: no vinculada aunque haya un correo", () => {
    expect(interpretAccountPage("no es una url", "ana@gmail.com")).toEqual({ linked: false, email: null });
  });

  it("dominio que solo empieza igual (accounts.google.com.evil.com) no cuenta como cuenta vinculada", () => {
    // Decisión: solo myaccount.google.com (host exacto) puede dar vinculada; cualquier otro host no.
    expect(interpretAccountPage("https://accounts.google.com.evil.com/", "ana@gmail.com")).toEqual({ linked: false, email: null });
  });

  it("accounts.google.com solo en la query no hace que la página parezca login", () => {
    expect(
      interpretAccountPage("https://myaccount.google.com/?continue=https://accounts.google.com", "ana@gmail.com")
    ).toEqual({ linked: true, email: "ana@gmail.com" });
  });
});

describe("BotLoginService", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "botlogin-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function make(over: Record<string, unknown> = {}) {
    const paths = resolveBotPaths(dir);
    const spawn = vi.fn(() => ({ unref: () => {}, on: () => {} }));
    const killBotBrowser = vi.fn();
    const deps = {
      paths,
      getPreferredBrowser: () => "auto",
      locateBrowser: () => "C:/Brave/brave.exe",
      displayName: () => "Brave Browser",
      spawn: spawn as any,
      killBotBrowser,
      exists: () => true,
      probeAccount: async () => ({ url: "https://myaccount.google.com/", text: "ana@gmail.com" }),
      ...over
    };
    return { svc: new BotLoginService(deps as any), paths, spawn, killBotBrowser };
  }

  it("openLoginBrowser lanza el navegador visible con el perfil del bot", () => {
    const { svc, paths, spawn, killBotBrowser } = make();
    const r = svc.openLoginBrowser();
    expect(r.success).toBe(true);
    expect(killBotBrowser).toHaveBeenCalled();
    const [exe, args] = spawn.mock.calls[0] as any;
    expect(exe).toBe("C:/Brave/brave.exe");
    expect(args).toContain(`--user-data-dir=${paths.profileDir}`);
    expect(args).toContain("https://accounts.google.com");
    expect(fs.existsSync(paths.profileDir)).toBe(true);
  });

  it("openLoginBrowser falla con mensaje claro si no hay navegador", () => {
    const { svc } = make({ exists: () => false });
    expect(() => svc.openLoginBrowser()).toThrow(/navegador/i);
  });

  it("openLoginBrowser registra un listener de error del proceso (un fallo async no tumba el backend)", () => {
    const on = vi.fn();
    const { svc } = make({ spawn: vi.fn(() => ({ unref: () => {}, on })) as any });
    svc.openLoginBrowser();
    expect(on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("verify devuelve el correo real y lo recuerda en lastCheck", async () => {
    const { svc } = make();
    expect(svc.lastCheck()).toBeNull();
    const r = await svc.verify();
    expect(r).toMatchObject({ linked: true, email: "ana@gmail.com" });
    expect(svc.lastCheck()).toMatchObject({ linked: true });
  });

  it("R-3: isVerifying es true solo mientras dura la verificación", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { svc } = make({ probeAccount: async () => { await gate; return { url: "https://myaccount.google.com/", text: "a@b.com" }; } });
    expect(svc.isVerifying()).toBe(false);
    const p = svc.verify();
    expect(svc.isVerifying()).toBe(true);
    release();
    await p;
    expect(svc.isVerifying()).toBe(false);
  });

  it("verify sin sesión informa que falta iniciar sesión", async () => {
    const { svc } = make({ probeAccount: async () => ({ url: "https://accounts.google.com/signin", text: "" }) });
    const r = await svc.verify();
    expect(r.linked).toBe(false);
    expect(r.message).toMatch(/inicia sesi/i);
  });

  it("verify captura fallos del navegador y no lanza", async () => {
    const { svc } = make({ probeAccount: async () => { throw new Error("boom"); } });
    const r = await svc.verify();
    expect(r.linked).toBe(false);
    expect(r.message).toMatch(/no se pudo verificar/i);
  });

  it("verify y unlink llaman a killBotBrowser", async () => {
    const { svc, killBotBrowser } = make();
    await svc.verify();
    expect(killBotBrowser).toHaveBeenCalledTimes(1);
    svc.unlink();
    expect(killBotBrowser).toHaveBeenCalledTimes(2);
  });

  it("dos verify concurrentes comparten una sola comprobación del perfil", async () => {
    const probeAccount = vi.fn(async () => ({ url: "https://myaccount.google.com/", text: "ana@gmail.com" }));
    const { svc } = make({ probeAccount });
    const [a, b] = await Promise.all([svc.verify(), svc.verify()]);
    expect(probeAccount).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ linked: true, email: "ana@gmail.com" });
  });

  it("unlink con un borrado fallido devuelve success:false y conserva lastCheck", async () => {
    const { svc, paths } = make({ rm: () => { throw new Error("EBUSY"); } });
    fs.mkdirSync(path.join(paths.profileDir, "Default"), { recursive: true });
    fs.writeFileSync(path.join(paths.profileDir, "Default", "Cookies"), "x");
    await svc.verify();
    const before = svc.lastCheck();
    const r = svc.unlink();
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/en uso/i);
    expect(svc.lastCheck()).toEqual(before);
    expect(fs.existsSync(path.join(paths.profileDir, "Default", "Cookies"))).toBe(true);
  });

  it("unlink borra el contenido del perfil y olvida la verificación", async () => {
    const { svc, paths } = make();
    fs.mkdirSync(path.join(paths.profileDir, "Default"), { recursive: true });
    fs.writeFileSync(path.join(paths.profileDir, "Default", "Cookies"), "x");
    await svc.verify();
    const r = svc.unlink();
    expect(r.success).toBe(true);
    expect(fs.readdirSync(paths.profileDir)).toEqual([]);
    expect(svc.lastCheck()).toBeNull();
  });
});
