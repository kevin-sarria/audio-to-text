import { Router } from "express";
import { SettingsStore } from "../infrastructure/settings/SettingsStore.js";
import { ISecretVault } from "../infrastructure/settings/ISecretVault.js";
import { ModelManager } from "../infrastructure/settings/ModelManager.js";
import { ITokenService } from "../../domain/services/ITokenService.js";
import { createAuthenticateMiddleware } from "../../interfaces/http/middlewares/authenticate.js";
import { createSettingsRoutes } from "./routes/settings.routes.js";
import { createCustomProvidersRoutes } from "./routes/customProviders.routes.js";
import { createLlmModelsRoutes } from "./routes/llmModels.routes.js";
import { createModelsRoutes } from "./routes/models.routes.js";
import { createBotRoutes } from "../../interfaces/http/routes/bot.routes.js";
import { createLibraryRoutes } from "./routes/library.routes.js";
import type { ImportBotMeetings } from "../library/ImportBotMeetings.js";
import type { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";

export interface DesktopRoutesDeps {
  settingsStore: SettingsStore;
  secretVault: ISecretVault;
  modelManager: ModelManager;
  tokenService: ITokenService;
  whisperBinaryPath: string;
  ffmpegBinaryPath?: string;
  resourcesDir: string;
  importBotMeetings: ImportBotMeetings;
  libraryRepository: SqliteLibraryRepository;
}

export function createDesktopRoutes(deps: DesktopRoutesDeps): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(deps.tokenService);

  // Todas las rutas de escritorio requieren autenticación local mediante cookie accessToken
  router.use(authenticate);

  router.use(createSettingsRoutes(deps));
  router.use(createCustomProvidersRoutes(deps));
  router.use(createLlmModelsRoutes(deps));
  router.use(createModelsRoutes(deps));
  router.use("/bot", createBotRoutes());
  router.use(createLibraryRoutes(deps));

  return router;
}
