import { Router } from "express";
import { AuthController } from "../controllers/AuthController.js";
import { validateBody } from "../middlewares/validate.js";
import { RegisterSchema, LoginSchema } from "../validators/auth.validator.js";
import { authRateLimiter } from "../middlewares/rateLimit.js";
import { createAuthenticateMiddleware } from "../middlewares/authenticate.js";
import { ITokenService } from "../../../domain/services/ITokenService.js";

export function createAuthRoutes(
  authController: AuthController,
  tokenService: ITokenService
): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(tokenService);

  router.post(
    "/register",
    authRateLimiter,
    validateBody(RegisterSchema),
    authController.register
  );

  router.post(
    "/login",
    authRateLimiter,
    validateBody(LoginSchema),
    authController.login
  );

  router.post("/refresh", authController.refresh);
  router.post("/logout", authController.logout);
  router.get("/me", authenticate, authController.me);

  return router;
}
