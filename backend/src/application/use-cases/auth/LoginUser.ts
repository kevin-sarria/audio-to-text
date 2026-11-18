import crypto from "node:crypto";
import { IUserRepository } from "../../../domain/repositories/IUserRepository.js";
import { IPasswordHasher } from "../../../domain/services/IPasswordHasher.js";
import { ITokenService, GeneratedTokens } from "../../../domain/services/ITokenService.js";
import { IRefreshTokenRepository } from "../../../domain/repositories/IRefreshTokenRepository.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";
import { ICaptchaVerifier } from "../../../domain/services/ICaptchaVerifier.js";
import { User } from "../../../domain/entities/User.js";

export interface LoginUserInput {
  email: string;
  password: string;
  recaptchaToken?: string;
}

export interface LoginUserOutput {
  user: User;
  tokens: GeneratedTokens;
}

export class LoginUser {
  constructor(
    private userRepository: IUserRepository,
    private passwordHasher: IPasswordHasher,
    private tokenService: ITokenService,
    private refreshTokenRepository: IRefreshTokenRepository,
    private captchaVerifier?: ICaptchaVerifier
  ) {}

  public async execute(input: LoginUserInput): Promise<LoginUserOutput> {
    if (this.captchaVerifier && !(await this.captchaVerifier.verify(input.recaptchaToken))) {
      throw new UnauthorizedError("Validación de reCAPTCHA fallida.");
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    // Mensaje genérico para evitar enumeración de usuarios
    const genericAuthError = new UnauthorizedError("Credenciales inválidas.");

    if (!user || !user.passwordHash || !user.isActive()) {
      throw genericAuthError;
    }

    const isValidPassword = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw genericAuthError;
    }

    const tokens = this.tokenService.generateTokens({
      userId: user.id,
      email: user.email
    });

    const tokenHash = this.tokenService.hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.create({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      familyId: tokens.familyId,
      expiresAt,
      createdAt: new Date()
    });

    return { user, tokens };
  }
}
