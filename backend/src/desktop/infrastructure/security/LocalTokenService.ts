import crypto from "node:crypto";
import {
  ITokenService,
  TokenPayload,
  GeneratedTokens
} from "../../../domain/services/ITokenService.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";
import { LOCAL_USER_ID, LOCAL_USER_EMAIL } from "../sqlite/migrations.js";

export class LocalTokenService implements ITokenService {
  constructor(private launchToken: string) {
    if (!launchToken) {
      throw new Error("LocalTokenService requiere un launchToken válido.");
    }
  }

  public verifyAccessToken(token: string): TokenPayload {
    if (!token) {
      throw new UnauthorizedError("Token de acceso no proporcionado.");
    }

    const tokenBuf = Buffer.from(token, "utf8");
    const launchBuf = Buffer.from(this.launchToken, "utf8");

    // Prevenir excepción de timingSafeEqual cuando las longitudes difieren
    if (tokenBuf.length !== launchBuf.length) {
      throw new UnauthorizedError("Token de acceso inválido.");
    }

    if (!crypto.timingSafeEqual(tokenBuf, launchBuf)) {
      throw new UnauthorizedError("Token de acceso inválido.");
    }

    return {
      userId: LOCAL_USER_ID,
      email: LOCAL_USER_EMAIL
    };
  }

  public generateTokens(_payload: TokenPayload, _existingFamilyId?: string): GeneratedTokens {
    throw new Error("NotImplementedError: El modo escritorio no soporta generación dinámica de tokens.");
  }

  public hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
