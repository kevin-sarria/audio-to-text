import { NotImplementedError } from "../../../domain/errors/NotImplementedError.js";
import { GeneratedTokens } from "../../../domain/services/ITokenService.js";
import { User } from "../../../domain/entities/User.js";

export interface LoginWithGoogleInput {
  idToken: string;
  recaptchaToken?: string;
}

export interface LoginWithGoogleOutput {
  user: User;
  tokens: GeneratedTokens;
}

export class LoginWithGoogle {
  public async execute(_input: LoginWithGoogleInput): Promise<LoginWithGoogleOutput> {
    // Stub documentado para integración con Google OAuth en siguiente fase
    throw new NotImplementedError("Autenticación con Google OAuth");
  }
}
