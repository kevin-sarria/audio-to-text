import { PrismaClient } from "@prisma/client";
import {
  IRefreshTokenRepository,
  RefreshTokenRecord
} from "../../domain/repositories/IRefreshTokenRepository.js";

export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private prisma: PrismaClient) {}

  public async create(token: RefreshTokenRecord): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        familyId: token.familyId,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt ?? null,
        replacedById: token.replacedById ?? null,
        createdAt: token.createdAt
      }
    });
  }

  public async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const raw = await this.prisma.refreshToken.findUnique({
      where: { tokenHash }
    });

    if (!raw) return null;

    return {
      id: raw.id,
      userId: raw.userId,
      tokenHash: raw.tokenHash,
      familyId: raw.familyId,
      expiresAt: raw.expiresAt,
      revokedAt: raw.revokedAt,
      replacedById: raw.replacedById,
      createdAt: raw.createdAt
    };
  }

  public async revokeToken(id: string, replacedById?: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        replacedById: replacedById ?? null
      }
    });
  }

  public async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }
}
