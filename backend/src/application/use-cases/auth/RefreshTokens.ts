import crypto from "node:crypto";
import { IUserRepository } from "../../../domain/repositories/IUserRepository.js";
import { ITokenService, GeneratedTokens } from "../../../domain/services/ITokenService.js";
import { IRefreshTokenRepository } from "../../../domain/repositories/IRefreshTokenRepository.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";

export interface RefreshTokensInput {
  refreshToken: string;
}

export class RefreshTokens {
  constructor(
    private userRepository: IUserRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private tokenService: ITokenService
  ) {}

  public async execute(input: RefreshTokensInput): Promise<GeneratedTokens> {
    const tokenHash = this.tokenService.hashToken(input.refreshToken);
    const storedToken = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedError("Token de refresco inválido.");
    }

    // Detección de reuso de token revocado -> revocar toda la familia inmediatamente
    if (storedToken.revokedAt) {
      await this.refreshTokenRepository.revokeFamily(storedToken.familyId);
      throw new UnauthorizedError(
        "Reuso de token detectado. Todas las sesiones de este dispositivo han sido revocadas por seguridad."
      );
    }

    // Verificar expiración temporal
    if (storedToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("El token de refresco ha expirado.");
    }

    const user = await this.userRepository.findById(storedToken.userId);
    if (!user || !user.isActive()) {
      throw new UnauthorizedError("Usuario no encontrado o inactivo.");
    }

    // Rotar token: generar nuevo par manteniendo el mismo familyId
    const newTokens = this.tokenService.generateTokens(
      {
        userId: user.id,
        email: user.email
      },
      storedToken.familyId
    );

    const newTokenId = crypto.randomUUID();
    const newTokenHash = this.tokenService.hashToken(newTokens.refreshToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 1. Revocar el token anterior apuntando al nuevo
    await this.refreshTokenRepository.revokeToken(storedToken.id, newTokenId);

    // 2. Almacenar el nuevo token
    await this.refreshTokenRepository.create({
      id: newTokenId,
      userId: user.id,
      tokenHash: newTokenHash,
      familyId: storedToken.familyId,
      expiresAt: newExpiresAt,
      createdAt: new Date()
    });

    return newTokens;
  }
}
