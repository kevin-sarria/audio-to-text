import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import type { LiveStatusCallback } from "../../../domain/models/LiveSession.js";
import type { EndReason } from "../../../domain/services/MeetingEndDetector.js";

export interface BrowserLaunchConfig {
  headless?: boolean;
  chromePath?: string;
  botDisplayName?: string;
  /** Carpeta del perfil del navegador (sesión de Google). Por defecto, la de la raíz del repo (CLI). */
  profileDir?: string;
  onStatus?: LiveStatusCallback;
  onEnded?: (reason: EndReason) => void;
  admissionLimitMs?: number;
}

/** Construye el script de PowerShell que cierra los navegadores del bot (función pura, testeable). */
export function buildKillScript(profileDir?: string): string {
  // Comparación literal (IndexOf, sin comodines de -like) y comillas simples duplicadas para PowerShell.
  const needle = (profileDir ?? "bot-chrome-session").replace(/'/g, "''");
  return (
    "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe' or Name = 'brave.exe' or Name = 'msedge.exe'\" | " +
    "ForEach-Object { if ($_.CommandLine -and $_.CommandLine.IndexOf('" + needle + "', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { Stop-Process -Id $_.ProcessId -Force } }"
  );
}

/** Qué pasó al cerrar el navegador del bot: no había ninguno, se cerró bien o hubo que forzarlo. */
export type BotBrowserCloseResult = "none" | "closed" | "forced";

/**
 * Script de PowerShell que cierra el navegador del bot como si se pulsara la X (función pura, testeable).
 * Chromium guarda las cookies en disco cada ~30 s o al cerrarse bien: matarlo de golpe pierde una sesión
 * de Google recién iniciada. Por eso primero pide el cierre normal (taskkill sin /F), espera hasta
 * `waitMs` y solo entonces fuerza. Los navegadores sin ventana (headless) se cierran directamente.
 * Escribe 'none', 'closed' o 'forced'.
 */
export function buildGracefulCloseScript(profileDir: string | undefined, waitMs: number): string {
  const needle = (profileDir ?? "bot-chrome-session").replace(/'/g, "''");
  const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000));
  return [
    `$needle = '${needle}'`,
    "function Find-BotBrowser { @(Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe' or Name = 'brave.exe' or Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($needle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }) }",
    "$procs = Find-BotBrowser",
    "if ($procs.Count -eq 0) { 'none'; exit 0 }",
    "$procs | Where-Object { $_.CommandLine -match '--headless' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    "$main = @($procs | Where-Object { $_.CommandLine -notmatch '--type=' -and $_.CommandLine -notmatch '--headless' })",
    "if ($main.Count -eq 0) { Find-BotBrowser | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; 'none'; exit 0 }",
    "foreach ($p in $main) { taskkill.exe /PID $p.ProcessId 2>&1 | Out-Null }",
    `Wait-Process -Id ($main | ForEach-Object { $_.ProcessId }) -Timeout ${waitSeconds} -ErrorAction SilentlyContinue`,
    "$mainLeft = @($main | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })",
    "Find-BotBrowser | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    "if ($mainLeft.Count -eq 0) { 'closed' } else { 'forced' }"
  ].join("\n");
}

const LOCAL_APP_DATA_PLACEHOLDER = "%LOCALAPPDATA%";
const PREFERRED_BROWSER_PATHS: Record<string, string[]> = {
  brave: [
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    `${LOCAL_APP_DATA_PLACEHOLDER}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`
  ],
  chrome: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${LOCAL_APP_DATA_PLACEHOLDER}\\Google\\Chrome\\Application\\chrome.exe`
  ],
  msedge: [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    `${LOCAL_APP_DATA_PLACEHOLDER}\\Microsoft\\Edge\\Application\\msedge.exe`
  ]
};

/** Rutas donde buscar el navegador elegido en Ajustes (instalación para todos, 32 bits o solo para el usuario). */
export function preferredBrowserCandidates(
  preferred: string | undefined,
  env: { LOCALAPPDATA?: string } = process.env
): string[] {
  const list = preferred ? PREFERRED_BROWSER_PATHS[preferred] ?? [] : [];
  return list.flatMap((p) => {
    if (!p.startsWith(LOCAL_APP_DATA_PLACEHOLDER)) return [p];
    return env.LOCALAPPDATA ? [env.LOCALAPPDATA + p.slice(LOCAL_APP_DATA_PLACEHOLDER.length)] : [];
  });
}

/** El navegador predeterminado solo sirve si es Chromium (Firefox ignora --user-data-dir y abriría el navegador personal). */
export function isChromiumExecutable(p: string | null | undefined): boolean {
  if (!p) return false;
  const name = p.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  return /^(chrome|brave|msedge|chromium)(\.exe)?$/.test(name);
}

export class BrowserLauncher {
  public static getProfileDir(): string {
    const rootDir = process.cwd().endsWith("algorithm-manager-bot")
      ? path.dirname(process.cwd())
      : process.cwd();
    return path.resolve(rootDir, ".bot-chrome-session");
  }

  /**
   * Cierra los navegadores del bot. Con `profileDir` mata solo los chrome/brave/msedge cuya línea de
   * comandos use ese perfil (escritorio); sin argumento, los del perfil del CLI (`bot-chrome-session`).
   */
  public static killOrphanedBotChrome(profileDir?: string): void {
    if (process.platform === "win32") {
      try {
        child_process.execFileSync(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", buildKillScript(profileDir)],
          { stdio: "ignore" }
        );
      } catch {}
    }
  }

  /**
   * Cierra el navegador del bot sin perder la sesión: pide el cierre normal, espera y solo entonces fuerza.
   * Úsalo siempre que el navegador visible del bot pueda estar abierto (p. ej. tras iniciar sesión en Google).
   */
  public static closeBotBrowser(profileDir?: string, waitMs = 10_000): Promise<BotBrowserCloseResult> {
    if (process.platform !== "win32") return Promise.resolve("none");
    return new Promise((resolve) => {
      child_process.execFile(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", buildGracefulCloseScript(profileDir, waitMs)],
        { encoding: "utf-8", timeout: waitMs + 30_000, windowsHide: true },
        (err, stdout) => {
          const out = String(stdout ?? "").trim().split(/\r?\n/).pop()?.trim();
          if (out === "none" || out === "closed" || out === "forced") return resolve(out);
          // PowerShell falló o no respondió: no dejar el perfil bloqueado.
          if (err) console.warn("[BrowserLauncher] cierre ordenado falló, se fuerza:", err.message);
          BrowserLauncher.killOrphanedBotChrome(profileDir);
          resolve("forced");
        }
      );
    });
  }

  public static getDefaultWindowsBrowser(): string | null {
    if (process.platform !== "win32") return null;
    try {
      const progIdOut = child_process.execFileSync(
        "reg.exe",
        ["query", "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice", "/v", "ProgId"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      const match = progIdOut.match(/ProgId\s+REG_SZ\s+(\S+)/i);
      if (!match || !match[1]) return null;
      const progId = match[1].trim();

      const cmdOut = child_process.execFileSync(
        "reg.exe",
        ["query", `HKEY_CLASSES_ROOT\\${progId}\\shell\\open\\command`, "/ve"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
      );
      const exeMatch = cmdOut.match(/"([^"]+\.exe)"/i) || cmdOut.match(/([^\s]+\.exe)/i);
      if (exeMatch && exeMatch[1] && fs.existsSync(exeMatch[1])) {
        return exeMatch[1];
      }
    } catch {}
    return null;
  }

  public static getBrowserDisplayName(executablePath: string): string {
    const lower = executablePath.toLowerCase();
    if (lower.includes("brave")) return "Brave Browser";
    if (lower.includes("msedge") || lower.includes("edge")) return "Microsoft Edge";
    if (lower.includes("chrome")) return "Google Chrome";
    return path.basename(executablePath);
  }

  public static cleanStaleLocks(profileDir: string): void {
    try {
      const lockFiles = [
        "SingletonLock",
        "SingletonSocket",
        "SingletonCookie",
        "lockfile",
        "DevToolsActivePort",
        "chrome_debug.log"
      ];
      for (const f of lockFiles) {
        const fullPath = path.join(profileDir, f);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
          } catch {}
        }
      }
    } catch {}
  }
  private static readSavedPreference(): string | undefined {
    try {
      const rootDir = process.cwd().endsWith("algorithm-manager-bot") ? path.dirname(process.cwd()) : process.cwd();
      const cfgPath = path.resolve(rootDir, ".bot-settings.json");
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
        return cfg.botPreferredBrowser;
      }
    } catch {}
    return undefined;
  }

  public static findSystemBrowserExecutable(preferred?: string): string {
    // 0. Revisar preferencia (inyectada o guardada en .bot-settings.json)
    const pref = preferred ?? BrowserLauncher.readSavedPreference();
    const preferredPath = preferredBrowserCandidates(pref).find((p) => fs.existsSync(p));
    if (preferredPath) return preferredPath;

    // 1. Variable de entorno explícita si el usuario la define
    if (process.env.BOT_BROWSER_PATH && fs.existsSync(process.env.BOT_BROWSER_PATH)) {
      return process.env.BOT_BROWSER_PATH;
    }

    // 2. Navegador predeterminado del sistema (Brave, Chrome, Edge, etc.)
    const defaultBrowser = BrowserLauncher.getDefaultWindowsBrowser();
    if (isChromiumExecutable(defaultBrowser)) {
      return defaultBrowser as string;
    }

    const candidatePaths: string[] = [
      // Brave Browser en Windows (Prioridad alta)
      "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe` : "",
      // Google Chrome en Windows (64-bit y 32-bit)
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : "",
      // Microsoft Edge en Windows
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      // macOS
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      // Linux
      "/usr/bin/brave-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium"
    ].filter(Boolean);

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return "google-chrome";
  }

  public static getChromeArgs(): string[] {
    return [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--allow-file-access",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--window-size=1280,800"
    ];
  }
}
