import { Router } from "express";
import { ExportController } from "../controllers/ExportController.js";
import { validateQuery } from "../middlewares/validate.js";
import { ExportSessionQueryValidator } from "../validators/export.validator.js";
import { createOptionalAuthMiddleware } from "../middlewares/optionalAuth.js";
import { ITokenService } from "../../../domain/services/ITokenService.js";

export function createExportRoutes(
  exportController: ExportController,
  tokenService: ITokenService
): Router {
  const router = Router();
  const optionalAuth = createOptionalAuthMiddleware(tokenService);

  router.get(
    "/:id/export",
    optionalAuth,
    validateQuery(ExportSessionQueryValidator),
    exportController.export
  );

  return router;
}
