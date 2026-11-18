import { PrismaClient, AuthProvider as PrismaAuthProvider, UserStatus as PrismaUserStatus } from "@prisma/client";
import { IUserRepository } from "../../domain/repositories/IUserRepository.js";
import { User } from "../../domain/entities/User.js";
import { UserProfile } from "../../domain/entities/UserProfile.js";
import { AuthProvider, UserStatus } from "../../domain/value-objects/AuthProvider.js";

export class PrismaUserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  public async findById(id: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true }
    });
    return raw ? this.toDomain(raw) : null;
  }

  public async findByEmail(email: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });
    return raw ? this.toDomain(raw) : null;
  }

  public async findByGoogleSub(googleSub: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({
      where: { googleSub },
      include: { profile: true }
    });
    return raw ? this.toDomain(raw) : null;
  }

  public async create(user: User): Promise<User> {
    const raw = await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash ?? null,
        authProvider: user.authProvider as PrismaAuthProvider,
        googleSub: user.googleSub ?? null,
        status: user.status as PrismaUserStatus,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profile: user.profile
          ? {
              create: {
                id: user.profile.id,
                fullName: user.profile.fullName ?? null,
                avatarUrl: user.profile.avatarUrl ?? null,
                preferences: user.profile.preferences ? JSON.parse(JSON.stringify(user.profile.preferences)) : undefined
              }
            }
          : undefined
      },
      include: { profile: true }
    });

    return this.toDomain(raw);
  }

  public async update(user: User): Promise<User> {
    const raw = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.email,
        passwordHash: user.passwordHash ?? null,
        authProvider: user.authProvider as PrismaAuthProvider,
        googleSub: user.googleSub ?? null,
        status: user.status as PrismaUserStatus,
        updatedAt: user.updatedAt
      },
      include: { profile: true }
    });

    return this.toDomain(raw);
  }

  private toDomain(raw: any): User {
    const profile = raw.profile
      ? new UserProfile({
          id: raw.profile.id,
          userId: raw.profile.userId,
          fullName: raw.profile.fullName,
          avatarUrl: raw.profile.avatarUrl,
          preferences: raw.profile.preferences as Record<string, unknown> | null
        })
      : null;

    return new User({
      id: raw.id,
      email: raw.email,
      passwordHash: raw.passwordHash,
      authProvider: raw.authProvider as AuthProvider,
      googleSub: raw.googleSub,
      status: raw.status as UserStatus,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      profile
    });
  }
}
