import fs from "node:fs";
import path from "node:path";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { BrowserLauncher, BrowserLaunchConfig } from "./BrowserLauncher.js";
import { ExtractedUtterance, PlatformSpeakerExtractor } from "../PlatformSpeakerExtractor.js";

export class GoogleMeetLiveDriver {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private profileDir: string;

  constructor() {
    this.profileDir = BrowserLauncher.getProfileDir();
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }
  }

  public async joinAndListen(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void> {
    const executablePath = config.chromePath || BrowserLauncher.findSystemBrowserExecutable();
    const browserDisplayName = BrowserLauncher.getBrowserDisplayName(executablePath);
    const isHeadless = config.headless ?? false;
    const botName = config.botDisplayName || "Algorithm Assistant Bot";

    console.info(`[GoogleMeetLiveDriver] Abriendo ${browserDisplayName} (${executablePath})`);
    console.info(`[GoogleMeetLiveDriver] Modo Visible: ${!isHeadless} | Perfil: ${this.profileDir}`);

    BrowserLauncher.killOrphanedBotChrome();
    BrowserLauncher.cleanStaleLocks(this.profileDir);

    this.browser = await puppeteer.launch({
      executablePath,
      headless: isHeadless,
      userDataDir: this.profileDir,
      args: [
        ...BrowserLauncher.getChromeArgs(),
        "--no-first-run",
        "--no-default-browser-check"
      ],
      ignoreDefaultArgs: ["--enable-automation"],
      defaultViewport: null
    });

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());

    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    );

    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const context = this.browser.defaultBrowserContext();
    await context.overridePermissions("https://meet.google.com", ["microphone", "camera"]);

    console.info(`[GoogleMeetLiveDriver] Navegando a sala: ${meetingUrl}`);
    await this.page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Exponer emisión de eventos a Node
    await this.page.exposeFunction(
      "__emitMeetUtterance",
      (rawSpeaker: string, text: string) => {
        const parsed = PlatformSpeakerExtractor.parseMeetCaption(`${rawSpeaker}: ${text}`);
        if (parsed) {
          onUtterance(parsed);
        } else {
          onUtterance({
            speakerName: PlatformSpeakerExtractor.sanitizeSpeakerName(rawSpeaker),
            content: text,
            timestamp: new Date().toLocaleTimeString(),
            platform: "GOOGLE_MEET"
          });
        }
      }
    );

    await new Promise((r) => setTimeout(r, 2500));

    // Si aparece diálogo "Continuar sin micrófono y cámara", hacer clic
    await this.page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        (b.innerText || "").includes("Continuar sin")
      );
      if (btn) btn.click();
    });

    await new Promise((r) => setTimeout(r, 1500));

    // Comprobar si Google Meet exige cuenta de Google o si redirigió
    let pageText = await this.page.evaluate(() => document.body.innerText || "");
    let currentUrl = this.page.url();

    if (currentUrl.includes("workspace.google.com") || currentUrl.includes("/unsupported")) {
      console.warn("\n" + "!".repeat(70));
      console.warn("⚠️  GOOGLE MEET REDIRIGIÓ FUERA DE LA SALA");
      console.warn("!".repeat(70));
      console.warn(` URL actual: ${currentUrl}`);
      console.warn(" Esto ocurre si el código de reunión ha caducado, la sala no existe");
      console.warn(" o el anfitrión cerró la videollamada.");
      console.warn(" 👉 Asegúrate de que la reunión esté abierta y sea un enlace activo.");
      console.warn("!".repeat(70) + "\n");
    }

    if (pageText.includes("No puedes unirte a esta videollamada")) {
      console.warn("\n" + "!".repeat(70));
      console.warn("⚠️  GOOGLE MEET EXIGE INICIAR SESIÓN CON UNA CUENTA DE GOOGLE");
      console.warn("!".repeat(70));
      console.warn(" Esta sala fue creada desde una cuenta personal de Gmail.");
      console.warn(" Google bloquea a invitados anónimos y exige tener una cuenta iniciada.");
      console.warn("");
      console.warn(" 👉 Si ves la ventana de Brave abierta, haz clic en 'Iniciar sesión'.");
      console.warn("    O ejecuta en tu terminal: npm run bot:login");
      console.warn("!".repeat(70) + "\n");

      // Esperar hasta 90 segundos si el usuario inicia sesión en la ventana abierta
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        currentUrl = this.page.url();
        if (currentUrl.includes("workspace.google.com") || currentUrl.includes("/unsupported")) {
          // Reintentar volver a la sala
          await this.page.goto(meetingUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
        }
        pageText = await this.page.evaluate(() => document.body.innerText || "");
        if (!pageText.includes("No puedes unirte a esta videollamada") && !this.page.url().includes("workspace.google.com")) {
          console.info("[GoogleMeetLiveDriver] ✅ Sesión de Google detectada. Continuando acceso a la sala...");
          break;
        }
      }
    }

    // Apagar micrófono y cámara antes de entrar
    try {
      await this.page.keyboard.down("Control");
      await this.page.keyboard.press("KeyD");
      await this.page.keyboard.press("KeyE");
      await this.page.keyboard.up("Control");
    } catch {}

    // Escribir nombre si hay campo de texto
    try {
      const nameInput = await this.page.$(
        'input[type="text"], input[aria-label*="nombre" i], input[placeholder*="nombre" i]'
      );
      if (nameInput) {
        await nameInput.click();
        await nameInput.type(botName, { delay: 30 });
      }
    } catch {}

    // Hacer clic en "Pedir unirse" o "Unirse ahora"
    let clicked = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      clicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, div[role='button']"));
        const btn = buttons.find((b) => {
          const t = (b.textContent || "").toLowerCase();
          return (
            t.includes("pedir unirse") ||
            t.includes("unirse ahora") ||
            t.includes("solicitar unirse") ||
            t.includes("ask to join") ||
            t.includes("join now")
          );
        });
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (clicked) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (clicked) {
      console.info("\n🔔 [GoogleMeetLiveDriver] ¡SOLICITUD DE ENTRADA ENVIADA A LA SALA!");
      console.info("👉 Anfitrión: En tu pantalla de Meet verás la notificación para admitir al bot. Haz clic en 'Admitir'.\n");
    }

    // Guardar captura para verificación de diagnóstico
    try {
      const outDir = path.resolve(process.cwd(), "output");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      await this.page.screenshot({ path: path.join(outDir, "meet-estado-actual.png") });
    } catch {}

    // Activar subtítulos e inyectar observador de diálogo en vivo
    await this.page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", bubbles: true }));

      const observer = new MutationObserver(() => {
        const captionNodes = document.querySelectorAll(
          'div[jscontroller="D1tHje"], div[class*="zsFvd"], div[class*="T4LgNb"]'
        );
        captionNodes.forEach((node) => {
          const speakerElem =
            node.querySelector('div[class*="zsFvd"], div[class*="bj4zb"], span[class*="zsFvd"]') || node;
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
  }

  public async leave(): Promise<void> {
    if (this.browser) {
      console.info("[GoogleMeetLiveDriver] Cerrando sesión y ventana de Google Meet...");
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
