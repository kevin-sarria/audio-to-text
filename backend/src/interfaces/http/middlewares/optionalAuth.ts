import { Request, Response, NextFunction } from "express";
import { ITokenService } from "../../../domain/services/ITokenService.js";

export function createOptionalAuthMiddleware(tokenService: ITokenService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      try {
        const payload = tokenService.verifyAccessToken(token);
        req.user = payload;
      } catch {
        // Token opcional inválido se ignora
      }
    }

    const guestHeader = req.headers["x-guest-token"];
    if (typeof guestHeader === "string") {
      req.guestToken = guestHeader;
    } else if (typeof req.query["guestToken"] === "string") {
      req.guestToken = req.query["guestToken"];
    }

    next();
  };
}
