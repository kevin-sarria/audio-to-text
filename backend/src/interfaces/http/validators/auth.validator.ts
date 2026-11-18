import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email("Correo electrónico inválido").max(255),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(128, "La contraseña no puede superar 128 caracteres"),
  fullName: z.string().max(150).optional(),
  recaptchaToken: z.string().optional()
});

export const LoginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
  recaptchaToken: z.string().optional()
});

export const GoogleLoginSchema = z.object({
  idToken: z.string().min(1, "El token de Google es requerido"),
  recaptchaToken: z.string().optional()
});
