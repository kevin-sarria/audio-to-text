import { z } from "zod";

export const RenameSpeakerDtoSchema = z.object({
  customName: z
    .string()
    .trim()
    .min(1, "El nombre del hablante no puede estar vacío")
    .max(100, "El nombre no puede superar 100 caracteres")
});

export type RenameSpeakerDto = z.infer<typeof RenameSpeakerDtoSchema>;

export interface SpeakerDto {
  id: string;
  sessionId: string;
  label: string;
  customName?: string | null;
}
