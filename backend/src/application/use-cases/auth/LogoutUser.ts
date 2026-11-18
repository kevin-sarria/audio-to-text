import { IRefreshTokenRepository } from "../../../domain/repositories/IRefreshTokenRepository.js";
import { ITokenService } from "../../../domain/services/ITokenService.js";

export interface LogoutUserInput {
  refreshToken?: string;
}

export class LogoutUser {
  constructor(
    private refreshTokenRepository: IRefreshTokenRepository,
    private tokenService: ITokenService
  ) {}

  public async execute(input: LogoutUserInput): Promise<void> {
    if (!input.refreshToken) {
      return;
    }

    const tokenHash = this.tokenService.hashToken(input.refreshToken);
    const storedToken = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (storedToken && !storedToken.revokedAt) {
      await this.refreshTokenRepository.revokeToken(storedToken.id);
    }
  }
}
