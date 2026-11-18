import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  ITokenService,
  TokenPayload,
  GeneratedTokens
} from "../../domain/services/ITokenService.js";
import { UnauthorizedError } from "../../domain/errors/UnauthorizedError.js";

export interface JwtTokenServiceConfig {
  accessSecret: string;
  refreshSecret: string;
  accessExpiresIn?: string;
  refreshExpiresIn?: string;
}

export class JwtTokenService implements ITokenService {
  constructor(private config: JwtTokenServiceConfig) {}

  public generateTokens(payload: TokenPayload, existingFamilyId?: string): GeneratedTokens {
    const familyId = existingFamilyId || crypto.randomUUID();

    const accessToken = jwt.sign(
      {
        sub: payload.userId,
        email: payload.email
      },
      this.config.accessSecret,
      {
        expiresIn: (this.config.accessExpiresIn || "15m") as any
      }
    );

    // Refresh token criptográficamente seguro
    const refreshToken = crypto.randomBytes(40).toString("hex");

    return {
      accessToken,
      refreshToken,
      familyId,
      expiresIn: 15 * 60 // 15 minutos en segundos
    };
  }

  public verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.config.accessSecret) as any;
      return {
        userId: decoded.sub,
        email: decoded.email
      };
    } catch {
      throw new UnauthorizedError("Token de acceso inválido o expirado.");
    }
  }

  public hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
