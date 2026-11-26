import { Router } from "express";
import type { AuthController } from "../controllers/AuthController.js";
import { SessionController } from "../controllers/SessionController.js";
import { ExportController } from "../controllers/ExportController.js";
import { EventsController } from "../controllers/EventsController.js";
import { MeetingAnalysisController } from "../controllers/MeetingAnalysisController.js";
import { ProjectFolderController } from "../controllers/ProjectFolderController.js";
import { ITokenService } from "../../../domain/services/ITokenService.js";
import { createAuthRoutes } from "./auth.routes.js";
import { createSessionRoutes } from "./sessions.routes.js";
import { createExportRoutes } from "./export.routes.js";
import { createEventsRoutes } from "./events.routes.js";
import { createProjectFolderRoutes } from "./projectFolder.routes.js";
import { createBotRoutes } from "./bot.routes.js";
import { ProfileRegistry } from "../../../infrastructure/analysis/profiles/ProfileRegistry.js";

export interface ApiRoutesDependencies {
  authController?: AuthController;
  sessionController: SessionController;
  exportController: ExportController;
  eventsController: EventsController;
  meetingAnalysisController?: MeetingAnalysisController;
  projectFolderController?: ProjectFolderController;
  tokenService: ITokenService;
  /** En escritorio el bot se controla desde /api/desktop/bot (autenticado); el router web no se monta. */
  disableLegacyBotRoutes?: boolean;
}

export function createApiRouter(deps: ApiRoutesDependencies): Router {
  const router = Router();

  if (deps.authController) {
    router.use("/auth", createAuthRoutes(deps.authController, deps.tokenService));
  }
  router.use(
    "/sessions",
    createSessionRoutes(deps.sessionController, deps.tokenService, deps.meetingAnalysisController)
  );
  router.use("/sessions", createExportRoutes(deps.exportController, deps.tokenService));
  router.use("/events", createEventsRoutes(deps.eventsController));

  if (deps.projectFolderController) {
    router.use("/project-folders", createProjectFolderRoutes(deps.projectFolderController, deps.tokenService));
  }

  // Rutas del Bot Autónomo de Reuniones (Meet & Teams)
  if (!deps.disableLegacyBotRoutes) {
    router.use("/bot", createBotRoutes());
  }

  // Perfiles de reglas de negocio disponibles (Parte B del prompt). Lista estática, sin datos del usuario.
  router.get("/project-profiles", (_req, res) => {
    res.json({ success: true, data: ProfileRegistry.listProfiles() });
  });

  router.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return router;
}
