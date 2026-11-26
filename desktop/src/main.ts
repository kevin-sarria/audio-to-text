// Debe ir primero: fija APP_MODE antes de que se evalúe el entorno del backend
import "../../backend/src/desktop/bootstrapEnv.js";
import crypto from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, Menu, Notification, ipcMain, shell, session, dialog } from "electron";
import { resolveDesktopPaths } from "./paths.js";
import { ElectronSecretVault } from "./secretVault.js";
import { configureWindowSecurity } from "./windowSecurity.js";
import puppeteer from "puppeteer-core";
import { createBotEngine } from "./botEngine.js";
import { createBotTray, type BotTray } from "./botTray.js";
import { BrowserLauncher } from "../../algorithm-manager-bot/src/infrastructure/connectors/live/BrowserLauncher.js";
import {
  startDesktopServer,
  DesktopServerInstance
} from "../../backend/src/desktop/server.js";

// 1. Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let desktopServer: DesktopServerInstance | null = null;
let botTray: BotTray | null = null;
let isQuitting = false;
let shutdownPromise: Promise<void> | null = null;
const SHUTDOWN_LIMIT_MS = 120_000;

async function bootstrap() {
  app.setAppUserModelId("com.audio2text.app");
  // 2. Resolver rutas y binarios
  const paths = resolveDesktopPaths();

  // Variables de entorno para modo escritorio
  process.env.APP_MODE = "desktop";
  if (paths.ffmpegPath) process.env.FFMPEG_PATH = paths.ffmpegPath;
  if (paths.ffprobePath) process.env.FFPROBE_PATH = paths.ffprobePath;
  if (paths.whisperPath) process.env.WHISPER_CPP_PATH = paths.whisperPath;

  // 3. Generar token criptográfico único por arranque
  const launchToken = crypto.randomBytes(32).toString("hex");

  // 4. Bóveda segura de claves
  const vault = new ElectronSecretVault(paths.userDataDir);

  // 4b. Bandeja y notificaciones del bot (la ventana aún no existe: showWindow usa mainWindow de forma perezosa)
  botTray = createBotTray({
    // En desarrollo el icono está en desktop/build; empaquetado va en resources (extraResources).
    iconPath: app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(__dirname, "../build/icon.png"),
    showWindow: () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    },
    leaveMeeting: () => (desktopServer ? desktopServer.bot.leave() : Promise.resolve()),
    quit: () => app.quit()
  });

  // 5. Iniciar servidor Express embebido en puerto aleatorio
  desktopServer = await startDesktopServer({
    userDataDir: paths.userDataDir,
    resourcesDir: paths.resourcesDir,
    vault,
    launchToken,
    botEngine: createBotEngine(vault),
    locateBrowser: (preferred) => BrowserLauncher.findSystemBrowserExecutable(preferred),
    browserDisplayName: (p) => BrowserLauncher.getBrowserDisplayName(p),
    closeBotBrowser: () => BrowserLauncher.closeBotBrowser(path.join(app.getPath("userData"), "bot", "profile")),
    probeAccount: async ({ profileDir, browserPath }) => {
      BrowserLauncher.cleanStaleLocks(profileDir);
      const browser = await puppeteer.launch({
        executablePath: browserPath,
        headless: true,
        userDataDir: profileDir,
        args: ["--no-first-run", "--no-default-browser-check"]
      });
      try {
        const page = await browser.newPage();
        await page.goto("https://myaccount.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise((r) => setTimeout(r, 2000));
        const text = await page.evaluate(() => document.body?.innerText ?? "");
        return { url: page.url(), text };
      } finally {
        await browser.close().catch(() => {});
      }
    },
    onBotEvent: (session, previous) => botTray?.onBotEvent(session, previous)
  });

  const serverUrl = `http://127.0.0.1:${desktopServer.port}`;

  // 6. Inyectar cookie accessToken antes de cargar la interfaz
  await session.defaultSession.cookies.set({
    url: serverUrl,
    name: "accessToken",
    value: launchToken,
    httpOnly: true,
    sameSite: "strict",
    path: "/"
  });

  // 7. Crear ventana principal de la aplicación
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 500,
    title: "Audio2Text",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // El preload (sandbox) no puede leer package.json: la versión real llega como argumento
      additionalArguments: [`--app-version=${app.getVersion()}`]
    }
  });

  // Ocultar a la bandeja solo con una sesión del bot activa y sin estar saliendo
  mainWindow.on("close", (event) => {
    if (shutdownPromise || (!isQuitting && desktopServer?.bot.isActive())) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // 8. Configurar políticas de seguridad de Electron
  configureWindowSecurity(mainWindow, serverUrl);

  // 9. Configuración del menú nativo mínimo
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Archivo",
      submenu: [
        {
          label: "Abrir carpeta de datos",
          click: () => shell.openPath(paths.userDataDir)
        },
        { type: "separator" },
        { label: "Salir", role: "quit" }
      ]
    },
    {
      label: "Ver",
      submenu: [
        { label: "Recargar", role: "reload" },
        { label: "Forzar recarga", role: "forceReload" },
        { type: "separator" },
        { label: "Restablecer zoom", role: "resetZoom" },
        { label: "Acercar", role: "zoomIn" },
        { label: "Alejar", role: "zoomOut" },
        { type: "separator" },
        { label: "Pantalla completa", role: "togglefullscreen" }
      ]
    },
    {
      label: "Ayuda",
      submenu: [
        {
          label: "Carpeta de datos del usuario",
          click: () => shell.openPath(paths.userDataDir)
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  // 10. Handler seguro de IPC para abrir carpeta de datos
  ipcMain.handle("open-data-folder", (event) => {
    // Validar que el remitente pertenezca a la ventana principal
    if (event.sender.id !== mainWindow?.webContents.id) {
      throw new Error("Remitente no autorizado");
    }
    return shell.openPath(paths.userDataDir);
  });

  // 10b. Handler seguro de IPC para seleccionar carpeta del proyecto
  ipcMain.handle("select-project-folder", async (event) => {
    if (event.sender.id !== mainWindow?.webContents.id) {
      throw new Error("Remitente no autorizado");
    }
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Seleccionar Carpeta del Repositorio / Proyecto",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  // 11. Cargar la aplicación
  await mainWindow.loadURL(`${serverUrl}/`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Reactivar ventana si el usuario intenta abrir una segunda instancia
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(bootstrap);

// Cierre ordenado
app.on("before-quit", (event) => {
  isQuitting = true;
  // Mientras haya un apagado en curso, cualquier otra petición de salida se ignora.
  if (shutdownPromise) {
    event.preventDefault();
    return;
  }
  const serverToClose = desktopServer;
  if (!serverToClose) return;
  event.preventDefault();
  desktopServer = null;

  const shutdown = async () => {
    try {
      if (serverToClose.bot.isActive()) {
        try {
          if (Notification.isSupported()) {
            new Notification({ title: "Audio2Text", body: "Guardando la reunión antes de cerrar…" }).show();
          }
        } catch {}
        await serverToClose.bot.leave().catch(() => {});
      }
      await serverToClose.close();
    } catch (err) {
      console.error("Error al cerrar servidor desktop:", err);
    }
  };

  // Un único tope global: si algo se cuelga, la app sale igualmente.
  shutdownPromise = Promise.race([shutdown(), new Promise<void>((r) => setTimeout(r, SHUTDOWN_LIMIT_MS))]).then(() => {
    botTray?.destroy();
    botTray = null;
    app.exit(0);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
