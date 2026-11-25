import fs from "node:fs";
import path from "node:path";
import child_process from "node:child_process";

export interface BrowserLaunchConfig {
  headless?: boolean;
  chromePath?: string;
  botDisplayName?: string;
}

export class BrowserLauncher {
  public static getProfileDir(): string {
    const rootDir = process.cwd().endsWith("algorithm-manager-bot")
      ? path.dirname(process.cwd())
      : process.cwd();
    return path.resolve(rootDir, ".bot-chrome-session");
  }

  public static killOrphanedBotChrome(): void {
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
  public static findSystemBrowserExecutable(): string {
    // 0. Revisar preferencia guardada en .bot-settings.json
    try {
      const rootDir = process.cwd().endsWith("algorithm-manager-bot") ? path.dirname(process.cwd()) : process.cwd();
      const cfgPath = path.resolve(rootDir, ".bot-settings.json");
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
        if (cfg.botPreferredBrowser === "brave") {
          const bravePath = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
          if (fs.existsSync(bravePath)) return bravePath;
        } else if (cfg.botPreferredBrowser === "chrome") {
          const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
          if (fs.existsSync(chromePath)) return chromePath;
        } else if (cfg.botPreferredBrowser === "msedge") {
          const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
          if (fs.existsSync(edgePath)) return edgePath;
        }
      }
    } catch {}

    // 1. Variable de entorno explícita si el usuario la define
    if (process.env.BOT_BROWSER_PATH && fs.existsSync(process.env.BOT_BROWSER_PATH)) {
      return process.env.BOT_BROWSER_PATH;
    }

    // 2. Navegador predeterminado del sistema (Brave, Chrome, Edge, etc.)
    const defaultBrowser = BrowserLauncher.getDefaultWindowsBrowser();
    if (defaultBrowser) {
      return defaultBrowser;
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
