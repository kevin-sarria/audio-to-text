import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveBotPaths } from "../bot/BotPaths.js";
import { BotSettingsStore, normalizeDomains } from "../bot/BotSettingsStore.js";
import { DEFAULT_BOT_ALLOWED_DOMAINS } from "@audio-to-text/shared";

describe("BotSettingsStore", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "botset-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("resolveBotPaths cuelga todo de <userData>/bot", () => {
    const p = resolveBotPaths(dir);
    expect(p.dir).toBe(path.join(dir, "bot"));
    expect(p.profileDir).toBe(path.join(dir, "bot", "profile"));
    expect(p.settingsFile).toBe(path.join(dir, "bot", "settings.json"));
    expect(p.outputDir).toBe(path.join(dir, "bot", "output"));
  });

  it("sin archivo devuelve los valores por defecto con lista de permitidos", () => {
    const s = new BotSettingsStore(resolveBotPaths(dir)).get();
    expect(s.botDisplayName).toBeTruthy();
    expect(s.botAllowedDomains).toEqual([...DEFAULT_BOT_ALLOWED_DOMAINS]);
    expect(s.botAllowedPlatforms).toEqual(["GOOGLE_MEET", "MICROSOFT_TEAMS"]);
  });

  it("update persiste y get lo recupera en otra instancia", () => {
    const paths = resolveBotPaths(dir);
    new BotSettingsStore(paths).update({ botDisplayName: "Mi Bot", botAllowedDomains: ["Meet.Google.com", "meet.google.com"] });
    const again = new BotSettingsStore(paths).get();
    expect(again.botDisplayName).toBe("Mi Bot");
    expect(again.botAllowedDomains).toEqual(["meet.google.com"]);
  });

  it("un archivo corrupto vuelve a los valores por defecto sin lanzar", () => {
    const paths = resolveBotPaths(dir);
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.settingsFile, "{no es json", "utf-8");
    expect(new BotSettingsStore(paths).get().botDisplayName).toBeTruthy();
  });

  it("effectiveOutputDir usa botOutputDir si está y si no la carpeta output", () => {
    const paths = resolveBotPaths(dir);
    const store = new BotSettingsStore(paths);
    expect(store.effectiveOutputDir()).toBe(paths.outputDir);
    store.update({ botOutputDir: path.join(dir, "otra") });
    expect(store.effectiveOutputDir()).toBe(path.resolve(dir, "otra"));
  });

  it("normalizeDomains limpia esquema, ruta, mayúsculas, duplicados e inválidos", () => {
    expect(normalizeDomains(["https://Teams.Microsoft.com/path", "  meet.google.com ", "meet.google.com", "no valido", "", "a_b.com"]))
      .toEqual(["teams.microsoft.com", "meet.google.com"]);
  });

  it("las plataformas desconocidas se descartan; una lista vacía se respeta", () => {
    const store = new BotSettingsStore(resolveBotPaths(dir));
    store.update({ botAllowedPlatforms: ["GOOGLE_MEET", "ZOOM" as any] });
    expect(store.get().botAllowedPlatforms).toEqual(["GOOGLE_MEET"]);
    store.update({ botAllowedPlatforms: [] });
    expect(store.get().botAllowedPlatforms).toEqual([]);
  });
});
