import puppeteer, { Browser, Page } from "puppeteer-core";
import { BrowserLauncher, BrowserLaunchConfig } from "./BrowserLauncher.js";
import { ExtractedUtterance, PlatformSpeakerExtractor } from "../PlatformSpeakerExtractor.js";

export class TeamsLiveDriver {
  private browser: Browser | null = null;
  private page: Page | null = null;

  public async joinAndListen(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void> {
    const executablePath = config.chromePath || BrowserLauncher.findSystemBrowserExecutable();
    const isHeadless = config.headless ?? true;
    const botName = config.botDisplayName || "Algorithm Assistant Bot";

    console.info(`[TeamsLiveDriver] Lanzando navegador (${executablePath}) para Microsoft Teams...`);

    BrowserLauncher.killOrphanedBotChrome();

    this.browser = await puppeteer.launch({
      executablePath,
      headless: isHeadless,
      args: BrowserLauncher.getChromeArgs(),
      defaultViewport: { width: 1280, height: 800 }
    });

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
    try {
      await this.page.evaluate(() => {
        const joinBtn = document.querySelector('button[data-tid="prejoin-join-button"]');
        if (joinBtn) {
          (joinBtn as HTMLButtonElement).click();
        }
      });
      console.info("[TeamsLiveDriver] Clic en 'Unirse ahora' ejecutado.");
    } catch {}

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
  }

  public async leave(): Promise<void> {
    if (this.browser) {
      console.info("[TeamsLiveDriver] Saliendo de la reunión de Microsoft Teams...");
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
