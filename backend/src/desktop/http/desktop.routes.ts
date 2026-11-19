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

export interface DesktopRoutesDeps {
  settingsStore: SettingsStore;
  secretVault: ISecretVault;
  modelManager: ModelManager;
  tokenService: ITokenService;
  whisperBinaryPath: string;
  ffmpegBinaryPath?: string;
  resourcesDir: string;
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

  return router;
}
