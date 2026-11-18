import { NotImplementedError } from "../../domain/errors/NotImplementedError.js";

export class GoogleOAuthClient {
  constructor(
    private clientId?: string,
    private clientSecret?: string
  ) {}

  public async verifyIdToken(_idToken: string): Promise<{ email: string; sub: string; name?: string }> {
    throw new NotImplementedError("GoogleOAuthClient.verifyIdToken");
  }
}
