import fs from "node:fs";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { BrowserLauncher, BrowserLaunchConfig } from "./BrowserLauncher.js";
import { ExtractedUtterance, PlatformSpeakerExtractor } from "../PlatformSpeakerExtractor.js";
import { BotJoinError } from "../../../domain/models/LiveSession.js";
import { ADMISSION_LIMIT_MS } from "../../../domain/services/MeetingEndDetector.js";
import { LiveRoomMonitor } from "./LiveRoomMonitor.js";
import { createPuppeteerProbe } from "./PuppeteerRoomProbe.js";

const LOGIN_BLOCK = /no puedes unirte a esta videollamada|you can(?:'|’)?t join this video call/i;
const REJECTED = /se rechaz[oó] tu solicitud|denegaron|no te han permitido|denied your request|someone in the call denied/i;
const ADMITTED_SELECTOR = 'button[aria-label*="Salir de la llamada" i], button[aria-label*="Leave call" i]';
const COUNT_SELECTOR = 'button[aria-label*="Mostrar a todos" i], button[aria-label*="Show everyone" i]';
const LOGIN_WAIT_MS = 90_000;

export class GoogleMeetLiveDriver {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private monitor: LiveRoomMonitor | null = null;
  private aborted = false;
  private profileDir: string;

  constructor(profileDir?: string) {
    this.profileDir = profileDir ?? BrowserLauncher.getProfileDir();
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }
  }

  public async joinAndListen(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void> {
    try {
      await this.run(meetingUrl, config, onUtterance);
    } catch (err) {
      await this.leave();
      throw err;
    }
  }

  private async run(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void> {
    const status = config.onStatus ?? (() => {});
    const isHeadless = config.headless ?? false;
    const botName = config.botDisplayName || "Algorithm Assistant Bot";
    const executablePath = config.chromePath || BrowserLauncher.findSystemBrowserExecutable();

    status("OPENING", `Abriendo ${BrowserLauncher.getBrowserDisplayName(executablePath)}…`);
    // Cierre ordenado: si la ventana de inicio de sesión sigue abierta, matarla perdería la sesión de Google.
    await BrowserLauncher.closeBotBrowser(this.profileDir);
    BrowserLauncher.cleanStaleLocks(this.profileDir);

    try {
      this.browser = await puppeteer.launch({
        executablePath,
        headless: isHeadless,
        userDataDir: this.profileDir,
        args: [...BrowserLauncher.getChromeArgs(), "--no-first-run", "--no-default-browser-check"],
        ignoreDefaultArgs: ["--enable-automation"],
        defaultViewport: null
      });
    } catch (err) {
      throw new BotJoinError(
        "BROWSER_FAILED",
        `No se pudo abrir el navegador del bot: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (this.aborted) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      throw new BotJoinError("ROOM_UNAVAILABLE", "La entrada del bot fue cancelada.");
    }

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());
    const page = this.page;

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await this.browser.defaultBrowserContext().overridePermissions("https://meet.google.com", ["microphone", "camera"]);

    await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.exposeFunction("__emitMeetUtterance", (rawSpeaker: string, text: string) => {
      const parsed = PlatformSpeakerExtractor.parseMeetCaption(`${rawSpeaker}: ${text}`);
      onUtterance(
        parsed ?? {
          speakerName: PlatformSpeakerExtractor.sanitizeSpeakerName(rawSpeaker),
          content: text,
          timestamp: new Date().toLocaleTimeString(),
          platform: "GOOGLE_MEET"
        }
      );
    });

    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.innerText || "").includes("Continuar sin"));
      if (btn) (btn as HTMLButtonElement).click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    const url = page.url();
    if (url.includes("workspace.google.com") || url.includes("/unsupported")) {
      throw new BotJoinError(
        "ROOM_UNAVAILABLE",
        "Google Meet redirigió fuera de la sala: el código caducó, la sala no existe o el anfitrión cerró la llamada."
      );
    }

    await this.ensureLoggedIn(page, meetingUrl, isHeadless, status);

    // Apagar micrófono y cámara antes de entrar.
    try {
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyD");
      await page.keyboard.press("KeyE");
      await page.keyboard.up("Control");
    } catch {}

    try {
      const nameInput = await page.$('input[type="text"], input[aria-label*="nombre" i], input[placeholder*="nombre" i]');
      if (nameInput) {
        await nameInput.click();
        await nameInput.type(botName, { delay: 30 });
      }
    } catch {}

    const clicked = await this.clickJoin(page);
    if (!clicked) {
      throw new BotJoinError("ROOM_UNAVAILABLE", "No se encontró el botón para unirse a la reunión en la página de Meet.");
    }

    status("WAITING_ADMISSION", "Solicitud enviada. Pide al anfitrión que admita al bot en la sala.");
    const roomMarker = new URL(meetingUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    this.monitor = new LiveRoomMonitor(
      createPuppeteerProbe(this.browser, page, { admittedSelector: ADMITTED_SELECTOR, countSelector: COUNT_SELECTOR }),
      roomMarker
    );
    await this.monitor.waitForAdmission(config.admissionLimitMs ?? ADMISSION_LIMIT_MS, REJECTED);

    // Subtítulos y observador de diálogo.
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", bubbles: true }));
      const observer = new MutationObserver(() => {
        const captionNodes = document.querySelectorAll('div[jscontroller="D1tHje"], div[class*="zsFvd"], div[class*="T4LgNb"]');
        captionNodes.forEach((node) => {
          const speakerElem = node.querySelector('div[class*="zsFvd"], div[class*="bj4zb"], span[class*="zsFvd"]') || node;
          const textElem = node.querySelector('span[class*="ygThBe"], span');
          if (speakerElem && textElem) {
            const speaker = speakerElem.textContent?.trim() || "Participante";
            const text = textElem.textContent?.trim() || "";
            if (text.length > 2 && (window as any).__lastReportedText !== text) {
              (window as any).__lastReportedText = text;
              (window as any).__emitMeetUtterance(speaker, text);
            }
          }
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    status("LISTENING", "El bot está en la reunión y captando la conversación.");
    if (config.onEnded) this.monitor.startEndWatch(config.onEnded);
  }

  /** Si Meet exige cuenta de Google: en modo visible espera el login; sin ventana falla de inmediato. */
  private async ensureLoggedIn(
    page: Page,
    meetingUrl: string,
    isHeadless: boolean,
    status: NonNullable<BrowserLaunchConfig["onStatus"]>
  ): Promise<void> {
    const text = () => page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (!LOGIN_BLOCK.test(await text())) return;

    const help = "Inicia sesión en Ajustes → Cuenta de Google del bot y vuelve a intentarlo.";
    status("NEEDS_LOGIN", "Google Meet exige iniciar sesión con una cuenta de Google.");
    if (isHeadless) {
      throw new BotJoinError("NEEDS_LOGIN", `Google Meet exige iniciar sesión con una cuenta de Google. ${help}`);
    }

    const deadline = Date.now() + LOGIN_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const current = page.url();
      if (current.includes("workspace.google.com") || current.includes("/unsupported")) {
        await page.goto(meetingUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      }
      if (!LOGIN_BLOCK.test(await text())) return;
    }
    throw new BotJoinError("NEEDS_LOGIN", `No se detectó el inicio de sesión de Google. ${help}`);
  }

  private async clickJoin(page: Page): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button, div[role='button']")).find((b) => {
          const t = (b.textContent || "").toLowerCase();
          return (
            t.includes("pedir unirse") || t.includes("unirse ahora") || t.includes("solicitar unirse") ||
            t.includes("ask to join") || t.includes("join now")
          );
        });
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      });
      if (clicked) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  public async leave(): Promise<void> {
    this.aborted = true;
    this.monitor?.stop();
    this.monitor = null;
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
