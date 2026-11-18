import type { DatabaseSync } from "node:sqlite";
import { IUserRepository } from "../../../domain/repositories/IUserRepository.js";
import { User } from "../../../domain/entities/User.js";
import { UserProfile } from "../../../domain/entities/UserProfile.js";
import { AuthProvider, UserStatus } from "../../../domain/value-objects/AuthProvider.js";

export class SqliteUserRepository implements IUserRepository {
  constructor(private db: DatabaseSync) {}

  public async findById(id: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.toDomain(row);
  }

  public async findByEmail(email: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!row) return null;
    return this.toDomain(row);
  }

  public async findByGoogleSub(googleSub: string): Promise<User | null> {
    const row = this.db.prepare("SELECT * FROM users WHERE google_sub = ?").get(googleSub) as any;
    if (!row) return null;
    return this.toDomain(row);
  }

  public async create(user: User): Promise<User> {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, password_hash, auth_provider, google_sub, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      user.id,
      user.email,
      user.passwordHash ?? null,
      user.authProvider,
      user.googleSub ?? null,
      user.status,
      user.createdAt.toISOString(),
      user.updatedAt.toISOString()
    );

    if (user.profile) {
      const profStmt = this.db.prepare(`
        INSERT INTO user_profiles (id, user_id, full_name, avatar_url, preferences)
        VALUES (?, ?, ?, ?, ?)
      `);
      profStmt.run(
        user.profile.id,
        user.id,
        user.profile.fullName ?? null,
        user.profile.avatarUrl ?? null,
        user.profile.preferences ? JSON.stringify(user.profile.preferences) : null
      );
    }

    return (await this.findById(user.id))!;
  }

  public async update(user: User): Promise<User> {
    const stmt = this.db.prepare(`
      UPDATE users SET
        email = ?,
        password_hash = ?,
        auth_provider = ?,
        google_sub = ?,
        status = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      user.email,
      user.passwordHash ?? null,
      user.authProvider,
      user.googleSub ?? null,
      user.status,
      user.updatedAt.toISOString(),
      user.id
    );

    if (user.profile) {
      const profStmt = this.db.prepare(`
        INSERT INTO user_profiles (id, user_id, full_name, avatar_url, preferences)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          full_name = excluded.full_name,
          avatar_url = excluded.avatar_url,
          preferences = excluded.preferences
      `);
      profStmt.run(
        user.profile.id,
        user.id,
        user.profile.fullName ?? null,
        user.profile.avatarUrl ?? null,
        user.profile.preferences ? JSON.stringify(user.profile.preferences) : null
      );
    }

    return (await this.findById(user.id))!;
  }

  private toDomain(raw: any): User {
    const profRow = this.db
      .prepare("SELECT * FROM user_profiles WHERE user_id = ?")
      .get(raw.id) as any;

    let profile: UserProfile | null = null;
    if (profRow) {
      let preferences = {};
      try {
        if (profRow.preferences) preferences = JSON.parse(profRow.preferences);
      } catch {}
      profile = new UserProfile({
        id: profRow.id,
        userId: profRow.user_id,
        fullName: profRow.full_name,
        avatarUrl: profRow.avatar_url,
        preferences
      });
    }

    return new User({
      id: raw.id,
      email: raw.email,
      passwordHash: raw.password_hash,
      authProvider: raw.auth_provider as AuthProvider,
      googleSub: raw.google_sub,
      status: raw.status as UserStatus,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at),
      profile
    });
  }
}
