import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDesktopBotRoutes } from "../http/routes/bot.routes.js";
import { BotSessionService, type BotEngine } from "../bot/BotSessionService.js";
import { BotSettingsStore } from "../bot/BotSettingsStore.js";
import { resolveBotPaths } from "../bot/BotPaths.js";
import { errorHandler } from "../../interfaces/http/middlewares/errorHandler.js";

describe("bot.routes (escritorio)", () => {
  let dir: string;
  let server: http.Server;
  let base: string;
  let engine: BotEngine;
  let login: any;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "botroutes-"));
    const paths = resolveBotPaths(dir);
    const settings = new BotSettingsStore(paths);
    engine = {
      start: vi.fn(async (i) => { i.onStatus("LISTENING", "ok"); return "s1"; }),
      finalize: vi.fn(async () => ({ utterances: 3, deliveryFile: "C:/out/r.json" })),
      abort: vi.fn(async () => {})
    };
    const sessions = new BotSessionService({
      engine,
      getConfig: () => settings.get(),
      resolveBrowserPath: () => "C:/brave.exe",
      profileDir: paths.profileDir,
      outputDir: () => settings.effectiveOutputDir(),
      importMeetings: () => ({ imported: 1, alreadyImported: 0, failed: [], folderMissing: false, folder: "C:/out" })
    });
    login = {
      openLoginBrowser: vi.fn(() => ({ success: true, message: "abierto" })),
      verify: vi.fn(async () => ({ linked: true, email: "a@b.com", message: "ok" })),
      unlink: vi.fn(() => ({ success: true, message: "borrado" })),
      isVerifying: vi.fn(() => false),
      lastCheck: vi.fn(() => null),
      browserInfo: vi.fn(() => ({ name: "Brave", path: "C:/brave.exe" }))
    };
    const app = express();
    app.use(express.json());
    app.use("/bot", createDesktopBotRoutes({ sessions, settings, login }));
    app.use(errorHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as any).port}/bot`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const call = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(base + p, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  const flush = () => new Promise((r) => setTimeout(r, 5));

  it("GET /session devuelve IDLE al inicio", async () => {
    const r = await call("GET", "/session");
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe("IDLE");
  });

  it("POST /join con enlace válido responde la sesión y luego queda escuchando", async () => {
    const r = await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe("OPENING");
    await flush();
    expect((await call("GET", "/session")).json.data.state).toBe("LISTENING");
  });

  it("POST /join con enlace no permitido responde 400 con el motivo", async () => {
    const r = await call("POST", "/join", { url: "https://zoom.us/j/1" });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/zoom/i);
  });

  it("POST /join sin url responde 400", async () => {
    expect((await call("POST", "/join", {})).status).toBe(400);
  });

  it("POST /join con el bot ocupado responde 409", async () => {
    await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    const r = await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    expect(r.status).toBe(409);
  });

  it("POST /leave termina y devuelve ENDED; sin sesión responde 409", async () => {
    expect((await call("POST", "/leave")).status).toBe(409);
    await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    await flush();
    const r = await call("POST", "/leave");
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe("ENDED");
  });

  it("login, verify y unlink responden; con el bot ocupado responden 409", async () => {
    expect((await call("POST", "/login")).json.message).toBe("abierto");
    expect((await call("POST", "/login/verify")).json.data).toMatchObject({ linked: true, email: "a@b.com" });
    expect((await call("POST", "/unlink")).json.message).toBe("borrado");

    await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    await flush();
    for (const p of ["/login", "/login/verify", "/unlink"]) {
      expect((await call("POST", p)).status).toBe(409);
    }
  });

  it("MF2: unlink con fallo responde 409 con success:false y el mensaje", async () => {
    login.unlink = vi.fn(() => ({ success: false, message: "archivos en uso" }));
    const r = await call("POST", "/unlink");
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ success: false, error: "archivos en uso" });
  });

  it("R-3: mientras se verifica la sesión, join/login/unlink responden 409 BUSY", async () => {
    login.isVerifying = vi.fn(() => true);
    const j = await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    expect(j.status).toBe(409);
    expect(j.json.code).toBe("BUSY");
    for (const p of ["/login", "/unlink"]) {
      expect((await call("POST", p)).status).toBe(409);
    }
    expect(engine.start).not.toHaveBeenCalled();
  });

  it("GET /status mantiene la forma que ya usa la interfaz", async () => {
    const r = await call("GET", "/status");
    expect(r.json.data).toMatchObject({
      isGoogleAccountLinked: false,
      loginChecked: false,
      detectedBrowserName: "Brave",
      isMeetingActive: false
    });
    expect(r.json.data.config.botAllowedDomains).toContain("meet.google.com");
  });

  it("PUT /config persiste y normaliza la lista de permitidos", async () => {
    const r = await call("PUT", "/config", { botAllowedDomains: ["Meet.Google.com", "meet.google.com"], botAllowedPlatforms: ["GOOGLE_MEET"] });
    expect(r.status).toBe(200);
    expect(r.json.data.botAllowedDomains).toEqual(["meet.google.com"]);
    expect((await call("GET", "/config")).json.data.botAllowedPlatforms).toEqual(["GOOGLE_MEET"]);
  });

  it("PUT /config rechaza plataformas inválidas con 400", async () => {
    expect((await call("PUT", "/config", { botAllowedPlatforms: ["ZOOM"] })).status).toBe(400);
  });
});
