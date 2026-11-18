import { describe, it, expect } from "vitest";
import { RefreshTokens } from "../../application/use-cases/auth/RefreshTokens.js";
import {
  IRefreshTokenRepository,
  RefreshTokenRecord
} from "../../domain/repositories/IRefreshTokenRepository.js";
import { IUserRepository } from "../../domain/repositories/IUserRepository.js";
import { User } from "../../domain/entities/User.js";
import { AuthProvider, UserStatus } from "../../domain/value-objects/AuthProvider.js";
import { ITokenService, TokenPayload, GeneratedTokens } from "../../domain/services/ITokenService.js";
import { UnauthorizedError } from "../../domain/errors/UnauthorizedError.js";

class InMemoryRefreshTokenRepo implements IRefreshTokenRepository {
  public tokens: Map<string, RefreshTokenRecord> = new Map();

  async create(token: RefreshTokenRecord): Promise<void> {
    this.tokens.set(token.tokenHash, { ...token });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const t = this.tokens.get(tokenHash);
    return t ? { ...t } : null;
  }

  async revokeToken(id: string, replacedById?: string): Promise<void> {
    for (const [hash, record] of this.tokens.entries()) {
      if (record.id === id) {
        this.tokens.set(hash, {
          ...record,
          revokedAt: new Date(),
          replacedById: replacedById ?? null
        });
      }
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const [hash, record] of this.tokens.entries()) {
      if (record.familyId === familyId) {
        this.tokens.set(hash, {
          ...record,
          revokedAt: new Date()
        });
      }
    }
  }
}

class InMemoryUserRepo implements IUserRepository {
  public users: Map<string, User> = new Map();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }
  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email === email) return u;
    }
    return null;
  }
  async findByGoogleSub(): Promise<User | null> {
    return null;
  }
  async create(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }
  async update(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }
}

class MockTokenService implements ITokenService {
  generateTokens(payload: TokenPayload, existingFamilyId?: string): GeneratedTokens {
    const familyId = existingFamilyId || "family-123";
    const rand = Math.random().toString(36).substring(7);
    return {
      accessToken: `access-token-${rand}`,
      refreshToken: `refresh-token-${rand}`,
      familyId,
      expiresIn: 900
    };
  }

  verifyAccessToken(_token: string): TokenPayload {
    return { userId: "user-1", email: "user@test.local" };
  }

  hashToken(token: string): string {
    return `hash-${token}`;
  }
}

describe("RefreshTokens Use Case & Token Family Revocation", () => {
  it("debe rotar el token exitosamente manteniendo el mismo familyId", async () => {
    const userRepo = new InMemoryUserRepo();
    const tokenRepo = new InMemoryRefreshTokenRepo();
    const tokenService = new MockTokenService();
    const useCase = new RefreshTokens(userRepo, tokenRepo, tokenService);

    const testUser = new User({
      id: "user-1",
      email: "user@test.local",
      authProvider: AuthProvider.LOCAL,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await userRepo.create(testUser);

    const rawToken = "initial-refresh-token";
    const tokenHash = tokenService.hashToken(rawToken);
    const familyId = "family-abc";

    await tokenRepo.create({
      id: "token-record-1",
      userId: testUser.id,
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + 1000000),
      createdAt: new Date()
    });

    const newTokens = await useCase.execute({ refreshToken: rawToken });

    expect(newTokens.familyId).toBe(familyId);
    expect(newTokens.refreshToken).toBeDefined();

    // El token antiguo debe estar revocado
    const oldRecord = await tokenRepo.findByTokenHash(tokenHash);
    expect(oldRecord?.revokedAt).toBeDefined();
    expect(oldRecord?.replacedById).toBeDefined();
  });

  it("si se intenta reutilizar un token previamente revocado, se revoca inmediatamente toda la familia", async () => {
    const userRepo = new InMemoryUserRepo();
    const tokenRepo = new InMemoryRefreshTokenRepo();
    const tokenService = new MockTokenService();
    const useCase = new RefreshTokens(userRepo, tokenRepo, tokenService);

    const testUser = new User({
      id: "user-1",
      email: "user@test.local",
      authProvider: AuthProvider.LOCAL,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await userRepo.create(testUser);

    const familyId = "compromised-family-999";

    // Token 1: Ya revocado (por ejemplo robado por un atacante)
    const compromisedToken = "stolen-token";
    const compromisedHash = tokenService.hashToken(compromisedToken);
    await tokenRepo.create({
      id: "record-1",
      userId: testUser.id,
      tokenHash: compromisedHash,
      familyId,
      expiresAt: new Date(Date.now() + 1000000),
      revokedAt: new Date(), // YA REVOCADO
      createdAt: new Date()
    });

    // Token 2: Token legítimo y vigente actualmente en la misma familia
    const legitimateToken = "legitimate-token";
    const legitimateHash = tokenService.hashToken(legitimateToken);
    await tokenRepo.create({
      id: "record-2",
      userId: testUser.id,
      tokenHash: legitimateHash,
      familyId,
      expiresAt: new Date(Date.now() + 1000000),
      revokedAt: null,
      createdAt: new Date()
    });

    // El atacante intenta usar el token 1 revocado
    await expect(useCase.execute({ refreshToken: compromisedToken })).rejects.toThrow(
      UnauthorizedError
    );

    // Como consecuencia de la detección de reuso, el token legítimo también debe haber sido revocado
    const legitRecord = await tokenRepo.findByTokenHash(legitimateHash);
    expect(legitRecord?.revokedAt).toBeDefined();
  });
});
