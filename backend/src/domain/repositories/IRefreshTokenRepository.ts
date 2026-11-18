export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedById?: string | null;
  createdAt: Date;
}

export interface IRefreshTokenRepository {
  create(token: RefreshTokenRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeToken(id: string, replacedById?: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}
