import puppeteer, { Browser, Page } from "puppeteer-core";
import { BrowserLauncher, BrowserLaunchConfig } from "./BrowserLauncher.js";
import { ExtractedUtterance, PlatformSpeakerExtractor } from "../PlatformSpeakerExtractor.js";
import { BotJoinError } from "../../../domain/models/LiveSession.js";
import { ADMISSION_LIMIT_MS } from "../../../domain/services/MeetingEndDetector.js";
import { LiveRoomMonitor } from "./LiveRoomMonitor.js";
import { createPuppeteerProbe } from "./PuppeteerRoomProbe.js";

export class TeamsLiveDriver {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private monitor: LiveRoomMonitor | null = null;
  private aborted = false;

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
    const executablePath = config.chromePath || BrowserLauncher.findSystemBrowserExecutable();
    const isHeadless = config.headless ?? true;
    const botName = config.botDisplayName || "Algorithm Assistant Bot";

    console.info(`[TeamsLiveDriver] Lanzando navegador (${executablePath}) para Microsoft Teams...`);

    status("OPENING", `Abriendo ${BrowserLauncher.getBrowserDisplayName(executablePath)}…`);
    BrowserLauncher.killOrphanedBotChrome();

    try {
      this.browser = await puppeteer.launch({
        executablePath,
        headless: isHeadless,
        args: BrowserLauncher.getChromeArgs(),
        defaultViewport: { width: 1280, height: 800 }
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

    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions("https://teams.microsoft.com", ["microphone", "camera"]);

    console.info(`[TeamsLiveDriver] Navegando a reunión de Teams: ${meetingUrl}`);
    await this.page.goto(meetingUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Exponer emisión de eventos a Node
    await this.page.exposeFunction(
      "__emitTeamsUtterance",
      (author: string, text: string) => {
        const parsed = PlatformSpeakerExtractor.parseTeamsCaption(author, text);
        onUtterance(parsed);
      }
    );

    // Botón "Continuar en este explorador" si Teams intenta abrir la app de escritorio
    try {
      await new Promise((r) => setTimeout(r, 3000));
      await this.page.evaluate(() => {
        const joinWebBtn = document.querySelector('button[data-tid="joinOnWeb"], button[id="openTeamsClientInBrowser"]');
        if (joinWebBtn) {
          (joinWebBtn as HTMLButtonElement).click();
        }
      });
      console.info("[TeamsLiveDriver] Seleccionada opción de unirse por navegador.");
    } catch {}

    // Escribir nombre del bot en la pantalla de pre-ingreso
    try {
      const nameInput = await this.page.$('input[data-tid="prejoin-display-name-input"], input[id="username"]');
      if (nameInput) {
        await nameInput.click();
        await nameInput.type(botName, { delay: 40 });
        console.info(`[TeamsLiveDriver] Nombre configurado: "${botName}"`);
      }
    } catch {}

    // Hacer clic en "Unirse ahora"
    let joinClicked = false;
    try {
      joinClicked = await this.page.evaluate(() => {
        const joinBtn = document.querySelector('button[data-tid="prejoin-join-button"]');
        if (joinBtn) {
          (joinBtn as HTMLButtonElement).click();
          return true;
        }
        return false;
      });
      console.info("[TeamsLiveDriver] Clic en 'Unirse ahora' ejecutado.");
    } catch {}
    if (!joinClicked) {
      throw new BotJoinError("ROOM_UNAVAILABLE", "No se encontró el botón para unirse a la reunión en la página de Teams.");
    }

    status("WAITING_ADMISSION", "Solicitud enviada. Pide al anfitrión que admita al bot en la sala.");
    // Teams cambia la URL al entrar, por eso no hay marcador de sala.
    this.monitor = new LiveRoomMonitor(
      createPuppeteerProbe(this.browser, this.page, {
        admittedSelector: 'button[data-tid="hangup-button"], button#hangup-button',
        countSelector: 'button[data-tid="calling-roster-button"], button[id="roster-button"]'
      }),
      ""
    );
    await this.monitor.waitForAdmission(config.admissionLimitMs ?? ADMISSION_LIMIT_MS, /rechaz|denied|no se permiti/i);

    // Observer de subtítulos cerrados de Teams
    await this.page.evaluate(() => {
      const observer = new MutationObserver(() => {
        const captionItems = document.querySelectorAll('div[data-tid="closed-caption-item"], div[class*="ui-chat__item"]');
        captionItems.forEach((item) => {
          const authorElem = item.querySelector('[class*="author"], [data-tid="caption-author"]');
          const textElem = item.querySelector('[class*="caption-text"], [data-tid="caption-text"]');
          if (authorElem && textElem) {
            const author = authorElem.textContent?.trim() || "Participante Teams";
            const text = textElem.textContent?.trim() || "";
            if (text.length > 2 && (window as any).__lastTeamsReportedText !== text) {
              (window as any).__lastTeamsReportedText = text;
              (window as any).__emitTeamsUtterance(author, text);
            }
          }
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });

    status("LISTENING", "El bot está en la reunión y captando la conversación.");
    if (config.onEnded) this.monitor.startEndWatch(config.onEnded);
  }

  public async leave(): Promise<void> {
    this.aborted = true;
    this.monitor?.stop();
    this.monitor = null;
    if (this.browser) {
      console.info("[TeamsLiveDriver] Saliendo de la reunión de Microsoft Teams...");
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
