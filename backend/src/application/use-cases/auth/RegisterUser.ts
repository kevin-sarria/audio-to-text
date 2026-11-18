import crypto from "node:crypto";
import { AuthProvider, UserStatus } from "../../../domain/value-objects/AuthProvider.js";
import { User } from "../../../domain/entities/User.js";
import { UserProfile } from "../../../domain/entities/UserProfile.js";
import { IUserRepository } from "../../../domain/repositories/IUserRepository.js";
import { IPasswordHasher } from "../../../domain/services/IPasswordHasher.js";
import { ITokenService, GeneratedTokens } from "../../../domain/services/ITokenService.js";
import { IRefreshTokenRepository } from "../../../domain/repositories/IRefreshTokenRepository.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { ICaptchaVerifier } from "../../../domain/services/ICaptchaVerifier.js";

export interface RegisterUserInput {
  email: string;
  password: string;
  fullName?: string;
  recaptchaToken?: string;
}

export interface RegisterUserOutput {
  user: User;
  tokens: GeneratedTokens;
}

export class RegisterUser {
  constructor(
    private userRepository: IUserRepository,
    private passwordHasher: IPasswordHasher,
    private tokenService: ITokenService,
    private refreshTokenRepository: IRefreshTokenRepository,
    private captchaVerifier?: ICaptchaVerifier
  ) {}

  public async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    if (this.captchaVerifier && !(await this.captchaVerifier.verify(input.recaptchaToken))) {
      throw new ValidationError("Validación de reCAPTCHA fallida.");
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new ValidationError("El correo electrónico ya se encuentra registrado.");
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const userId = crypto.randomUUID();
    const now = new Date();

    const profile = new UserProfile({
      id: crypto.randomUUID(),
      userId,
      fullName: input.fullName?.trim() || null,
      preferences: {}
    });

    const user = new User({
      id: userId,
      email: normalizedEmail,
      passwordHash,
      authProvider: AuthProvider.LOCAL,
      googleSub: null,
      status: UserStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      profile
    });

    const savedUser = await this.userRepository.create(user);
    const tokens = this.tokenService.generateTokens({
      userId: savedUser.id,
      email: savedUser.email
    });

    // Guardar hash del refresh token
    const tokenHash = this.tokenService.hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepository.create({
      id: crypto.randomUUID(),
      userId: savedUser.id,
      tokenHash,
      familyId: tokens.familyId,
      expiresAt,
      createdAt: new Date()
    });

    return { user: savedUser, tokens };
  }
}
