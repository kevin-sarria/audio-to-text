import { Router } from "express";
import { ProjectFolderController } from "../controllers/ProjectFolderController.js";
import { createOptionalAuthMiddleware } from "../middlewares/optionalAuth.js";
import { validateBody } from "../middlewares/validate.js";
import { CreateProjectFolderSchema, UpdateProjectFolderSchema } from "@audio-to-text/shared";
import { ITokenService } from "../../../domain/services/ITokenService.js";

export function createProjectFolderRoutes(
  controller: ProjectFolderController,
  tokenService: ITokenService
): Router {
  const router = Router();
  const optionalAuth = createOptionalAuthMiddleware(tokenService);

  router.use(optionalAuth);

  router.post("/", validateBody(CreateProjectFolderSchema), controller.create);
  router.post("/scan-context", controller.scanContext);
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  router.put("/:id", validateBody(UpdateProjectFolderSchema), controller.update);
  router.delete("/:id", controller.delete);

  return router;
}
