import { z } from "zod";
import { SessionStatus } from "@audio-to-text/shared";

export const CreateSessionBodySchema = z.object({
  sourceLanguage: z.string().max(10).optional(),
  recaptchaToken: z.string().optional()
});

export const ListSessionsParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(SessionStatus).optional()
});

export const RenameSpeakerSchema = z.object({
  customName: z
    .string()
    .trim()
    .min(1, "El nombre del hablante no puede estar vacío")
    .max(100, "El nombre no puede superar 100 caracteres")
});
