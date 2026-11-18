// Debe ir primero: fija APP_MODE antes de que se evalúe env.ts (ver bootstrapEnv.ts)
import "./bootstrapEnv.js";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createApp } from "../interfaces/http/app.js";
import { createDesktopContainer } from "./composition-root.desktop.js";
import { createDesktopRoutes } from "./http/desktop.routes.js";
import { ISecretVault } from "./infrastructure/settings/ISecretVault.js";

export interface StartDesktopServerOptions {
  userDataDir: string;
  resourcesDir: string;
  vault: ISecretVault;
  launchToken: string;
  port?: number;
}

export interface DesktopServerInstance {
  port: number;
  close: () => Promise<void>;
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
    launchToken
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
      tokenService: container.tokenService
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
    resourcesDir
  });
  app.use("/api/desktop", desktopRoutes);

  // 5. Iniciar servidor HTTP en 127.0.0.1
  const server = http.createServer(app);

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

  return {
    port: boundPort,
    close: async () => {
      console.log("[DesktopServer] Cerrando servidor HTTP y dependencias locales...");
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      await container.close();
    }
  };
}
