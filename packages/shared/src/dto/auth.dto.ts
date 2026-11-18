import { z } from "zod";
import { AuthProvider, UserStatus } from "../enums.js";

export const RegisterDtoSchema = z.object({
  email: z.string().email("Correo electrónico inválido").max(255),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no puede superar 128 caracteres"),
  fullName: z.string().max(150).optional(),
  recaptchaToken: z.string().optional()
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
  recaptchaToken: z.string().optional()
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const GoogleLoginDtoSchema = z.object({
  idToken: z.string().min(1, "El token de Google es requerido"),
  recaptchaToken: z.string().optional()
});

export type GoogleLoginDto = z.infer<typeof GoogleLoginDtoSchema>;

export interface UserResponseDto {
  id: string;
  email: string;
  authProvider: AuthProvider;
  status: UserStatus;
  fullName?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: UserResponseDto;
}
