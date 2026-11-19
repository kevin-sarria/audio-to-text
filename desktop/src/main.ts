// Debe ir primero: fija APP_MODE antes de que se evalúe el entorno del backend
import "../../backend/src/desktop/bootstrapEnv.js";
import crypto from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, Menu, ipcMain, shell, session, dialog } from "electron";
import { resolveDesktopPaths } from "./paths.js";
import { ElectronSecretVault } from "./secretVault.js";
import { configureWindowSecurity } from "./windowSecurity.js";
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

async function bootstrap() {
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

  // 5. Iniciar servidor Express embebido en puerto aleatorio
  desktopServer = await startDesktopServer({
    userDataDir: paths.userDataDir,
    resourcesDir: paths.resourcesDir,
    vault,
    launchToken
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
      webSecurity: true
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
    mainWindow.focus();
  }
});

app.whenReady().then(bootstrap);

// Cierre ordenado
app.on("before-quit", async (event) => {
  if (desktopServer) {
    event.preventDefault();
    const serverToClose = desktopServer;
    desktopServer = null;
    try {
      await serverToClose.close();
    } catch (err) {
      console.error("Error al cerrar servidor desktop:", err);
    }
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
