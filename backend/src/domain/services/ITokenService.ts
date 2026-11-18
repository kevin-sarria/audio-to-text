export interface TokenPayload {
  userId: string;
  email: string;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  familyId: string;
  expiresIn: number;
}

export interface ITokenService {
  generateTokens(payload: TokenPayload, existingFamilyId?: string): GeneratedTokens;
  verifyAccessToken(token: string): TokenPayload;
  hashToken(token: string): string;
}
