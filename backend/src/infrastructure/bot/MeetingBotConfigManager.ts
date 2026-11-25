import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";
import { MeetingBotConfigDto, MeetingBotStatusDto } from "@audio-to-text/shared";

const DEFAULT_CONFIG: MeetingBotConfigDto = {
  botDisplayName: "Algorithm Assistant Bot",
  botAvatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=algorithm-bot",
  botPreferredBrowser: "auto",
  botGoogleAccountEmail: "",
  botAutoRecord: true,
  botMuteOnJoin: true,
  botGenerateDocx: true,
  botGenerateExcel: true,
  botDefaultPlatform: "AUTO",
  botLanguage: "es"
};

export class MeetingBotConfigManager {
  private static instance: MeetingBotConfigManager;
  private configFilePath: string;
  private profileDir: string;

  constructor() {
    const rootDir = process.cwd().endsWith("backend") || process.cwd().endsWith("algorithm-manager-bot")
      ? path.dirname(process.cwd())
      : process.cwd();
    this.configFilePath = path.resolve(rootDir, ".bot-settings.json");
    this.profileDir = path.resolve(rootDir, ".bot-chrome-session");
  }

  public static getInstance(): MeetingBotConfigManager {
    if (!MeetingBotConfigManager.instance) {
      MeetingBotConfigManager.instance = new MeetingBotConfigManager();
    }
    return MeetingBotConfigManager.instance;
  }

  public getConfig(): MeetingBotConfigDto {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, "utf-8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch {}
    return { ...DEFAULT_CONFIG };
  }

  public updateConfig(partial: Partial<MeetingBotConfigDto>): MeetingBotConfigDto {
    const current = this.getConfig();
    const updated: MeetingBotConfigDto = {
      ...current,
      ...partial
    };
    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(updated, null, 2), "utf-8");
    } catch (err) {
      console.error("[MeetingBotConfigManager] Error al guardar .bot-settings.json:", err);
    }
    return updated;
  }

  public getStatus(): MeetingBotStatusDto {
    const config = this.getConfig();
    const detected = this.detectBrowserExecutable(config.botPreferredBrowser);
    const linkedInfo = this.detectLinkedGoogleAccount();

    return {
      config,
      isGoogleAccountLinked: linkedInfo.linked || Boolean(config.botGoogleAccountEmail),
      linkedGoogleEmail: linkedInfo.email || config.botGoogleAccountEmail || null,
      detectedBrowserName: detected.name,
      detectedBrowserPath: detected.path,
      isMeetingActive: false
    };
  }

  public launchLoginBrowser(): { success: boolean; message: string } {
    const config = this.getConfig();
    const detected = this.detectBrowserExecutable(config.botPreferredBrowser);
    if (!detected.path || !fs.existsSync(detected.path)) {
      throw new Error(`No se encontró el ejecutable del navegador: ${detected.name}`);
    }

    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }

    // Limpiar bloqueos anteriores
    this.cleanStaleLocks();
    this.killBotBrowser();

    const child = child_process.spawn(
      detected.path,
      [
        `--user-data-dir=${this.profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "https://accounts.google.com"
      ],
      {
        detached: true,
        stdio: "ignore"
      }
    );
    child.unref();

    return {
      success: true,
      message: `Se ha abierto ${detected.name} en tu pantalla. Inicia sesión en la ventana y tus credenciales quedarán guardadas automáticamente.`
    };
  }

  public unlinkGoogleAccount(): { success: boolean; message: string } {
    this.killBotBrowser();
    this.cleanStaleLocks();

    try {
      if (fs.existsSync(this.profileDir)) {
        // Remover archivos de sesión para reiniciar perfil
        const files = fs.readdirSync(this.profileDir);
        for (const f of files) {
          const fp = path.join(this.profileDir, f);
          try {
            fs.rmSync(fp, { recursive: true, force: true });
          } catch {}
        }
      }
    } catch {}

    this.updateConfig({ botGoogleAccountEmail: "" });

    return {
      success: true,
      message: "Sesión de Google del bot eliminada correctamente."
    };
  }

  private detectLinkedGoogleAccount(): { linked: boolean; email: string | null } {
    try {
      const localStatePath = path.join(this.profileDir, "Local State");
      if (fs.existsSync(localStatePath)) {
        const raw = fs.readFileSync(localStatePath, "utf-8");
        const json = JSON.parse(raw);
        const infoCache = json.profile?.info_cache;
        if (infoCache) {
          for (const key of Object.keys(infoCache)) {
            const p = infoCache[key];
            if (p?.user_name && p.user_name.includes("@")) {
              return { linked: true, email: p.user_name };
            }
          }
        }
        // Si hay Default folder con Cookies/History, hay sesión
        const defaultDir = path.join(this.profileDir, "Default");
        if (fs.existsSync(defaultDir)) {
          return { linked: true, email: null };
        }
      }
    } catch {}
    return { linked: false, email: null };
  }

  private detectBrowserExecutable(preferred: string): { name: string; path: string } {
    const candidates: Array<{ name: string; path: string }> = [
      { name: "Brave Browser", path: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
      { name: "Brave Browser", path: "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
      { name: "Google Chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
      { name: "Google Chrome", path: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" },
      { name: "Microsoft Edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" },
      { name: "Microsoft Edge", path: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" }
    ];

    if (preferred === "brave") {
      const found = candidates.find((c) => c.name === "Brave Browser" && fs.existsSync(c.path));
      if (found) return found;
    } else if (preferred === "chrome") {
      const found = candidates.find((c) => c.name === "Google Chrome" && fs.existsSync(c.path));
      if (found) return found;
    } else if (preferred === "msedge") {
      const found = candidates.find((c) => c.name === "Microsoft Edge" && fs.existsSync(c.path));
      if (found) return found;
    }

    // Auto detect: check candidates
    for (const c of candidates) {
      if (fs.existsSync(c.path)) return c;
    }

    return { name: "Google Chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" };
  }

  private killBotBrowser(): void {
    if (process.platform === "win32") {
      try {
        child_process.execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe' or Name = 'brave.exe' or Name = 'msedge.exe'\" | ForEach-Object { if ($_.CommandLine -like '*bot-chrome-session*') { Stop-Process -Id $_.ProcessId -Force } }"
          ],
          { stdio: "ignore" }
        );
      } catch {}
    }
  }

  private cleanStaleLocks(): void {
    const lockFiles = ["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile", "DevToolsActivePort", "chrome_debug.log"];
    for (const f of lockFiles) {
      const fullPath = path.join(this.profileDir, f);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {}
      }
    }
  }
}
