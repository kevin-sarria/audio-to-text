import { Request, Response, NextFunction } from "express";
import { ITokenService } from "../../../domain/services/ITokenService.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
      guestToken?: string;
    }
  }
}

export function createAuthenticateMiddleware(tokenService: ITokenService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return next(new UnauthorizedError("Token de autenticación requerido."));
    }

    try {
      const payload = tokenService.verifyAccessToken(token);
      req.user = payload;
      next();
    } catch (err) {
      next(err);
    }
  };
}
