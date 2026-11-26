// Debe ir primero: fija APP_MODE antes de que se evalúe env.ts (ver bootstrapEnv.ts)
import "./bootstrapEnv.js";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createApp } from "../interfaces/http/app.js";
import { createDesktopContainer } from "./composition-root.desktop.js";
import { createDesktopRoutes } from "./http/desktop.routes.js";
import { ISecretVault } from "./infrastructure/settings/ISecretVault.js";
import type { BotSessionDto, BotSessionState } from "@audio-to-text/shared";
import type { BotEngine } from "./bot/BotSessionService.js";
import type { BotLoginDeps, BotBrowserCloseResult } from "./bot/BotLoginService.js";

export interface StartDesktopServerOptions {
  userDataDir: string;
  resourcesDir: string;
  vault: ISecretVault;
  launchToken: string;
  port?: number;
  botEngine: BotEngine;
  locateBrowser: (preferred: string) => string;
  browserDisplayName: (browserPath: string) => string;
  probeAccount: BotLoginDeps["probeAccount"];
  closeBotBrowser: () => Promise<BotBrowserCloseResult>;
  onBotEvent?: (session: BotSessionDto, previous: BotSessionState) => void;
}

export interface DesktopServerInstance {
  port: number;
  close: () => Promise<void>;
  bot: {
    current: () => BotSessionDto;
    isActive: () => boolean;
    leave: () => Promise<BotSessionDto>;
  };
}

export async function startDesktopServer(
  options: StartDesktopServerOptions
): Promise<DesktopServerInstance> {
  const { userDataDir, resourcesDir, vault, launchToken } = options;

  // 1. Inicializar contenedor de Clean Architecture para modo escritorio
  const container = createDesktopContainer({
    userDataDir,
    resourcesDir,
    vault,
    launchToken,
    botEngine: options.botEngine,
    locateBrowser: options.locateBrowser,
    browserDisplayName: options.browserDisplayName,
    probeAccount: options.probeAccount,
    closeBotBrowser: options.closeBotBrowser,
    onBotEvent: options.onBotEvent
  });

  // 2. Directorio de distribución frontend estático
  let serveStaticDir = path.join(resourcesDir, "frontend-dist");
  if (!fs.existsSync(serveStaticDir)) {
    // En desarrollo, resourcesDir es <repo>/desktop/resources: el build del frontend está en <repo>/frontend/dist
    // (no se usa import.meta: en el bundle CJS de Electron queda vacío)
    const devStaticDir = path.resolve(resourcesDir, "../../frontend/dist");
    if (fs.existsSync(devStaticDir)) {
      serveStaticDir = devStaticDir;
    }
  }

  // 3. Crear aplicación Express configurada con protección anti DNS-rebinding
  let boundPort = options.port ?? 0;
  const allowedHosts: string[] = [];

  const app = createApp(
    {
      sessionController: container.sessionController,
      exportController: container.exportController,
      eventsController: container.eventsController,
      meetingAnalysisController: container.meetingAnalysisController,
      projectFolderController: container.projectFolderController,
      tokenService: container.tokenService,
      disableLegacyBotRoutes: true
    },
    {
      serveStaticDir: fs.existsSync(serveStaticDir) ? serveStaticDir : undefined,
      allowedHosts,
      // Sin CORS: la interfaz se sirve del mismo origen. Los orígenes ajenos se rechazan en createApp.
      disableCors: true
    }
  );

  // 4. Montar rutas especializadas de escritorio (/api/desktop/*)
  const desktopRoutes = createDesktopRoutes({
    settingsStore: container.settingsStore,
    secretVault: vault,
    modelManager: container.modelManager,
    tokenService: container.tokenService,
    whisperBinaryPath: container.whisperBinaryPath,
    resourcesDir,
    importBotMeetings: container.importBotMeetings,
    libraryRepository: container.libraryRepository,
    botSessions: container.botSessions,
    botSettings: container.botSettings,
    botLogin: container.botLogin
  });
  app.use("/api/desktop", desktopRoutes);

  // 5. Iniciar servidor HTTP en 127.0.0.1
  const server = http.createServer(app);
  // Permitir peticiones largas para análisis de reuniones extensas con modelos LLM
  server.requestTimeout = 480000; // 8 minutos
  server.headersTimeout = 60000;
  server.timeout = 480000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(boundPort, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        boundPort = address.port;
      }
      allowedHosts.push(`127.0.0.1:${boundPort}`, `localhost:${boundPort}`);
      console.log(`[DesktopServer] Servidor Express local activo en http://127.0.0.1:${boundPort}`);
      resolve();
    });
  });

  // Importa las reuniones que el bot dejó mientras la app estaba cerrada (no bloquea el arranque)
  setImmediate(() => {
    try {
      const r = container.importBotMeetings.execute();
      if (r.imported > 0 || r.failed.length > 0) {
        console.log(
          `[Library] Importación al arrancar: ${r.imported} nuevas, ${r.alreadyImported} ya importadas, ${r.failed.length} con error.`
        );
      }
    } catch (err) {
      console.error("[Library] Error importando reuniones del bot al arrancar:", err);
    }
  });

  return {
    port: boundPort,
    bot: {
      current: () => container.botSessions.current(),
      isActive: () => container.botSessions.isActive(),
      leave: () => container.botSessions.leave()
    },
    close: async () => {
      console.log("[DesktopServer] Cerrando servidor HTTP y dependencias locales...");
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await container.close();
    }
  };
}
