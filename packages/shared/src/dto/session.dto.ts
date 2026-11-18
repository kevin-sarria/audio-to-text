import { z } from "zod";
import { SessionStatus } from "../enums.js";
import { SpeakerDto } from "./speaker.dto.js";

export const CreateSessionDtoSchema = z.object({
  sourceLanguage: z.string().max(10).optional(),
  recaptchaToken: z.string().optional()
});

export type CreateSessionDto = z.infer<typeof CreateSessionDtoSchema>;

export interface TranscriptionSegmentDto {
  id: string;
  sessionId: string;
  speakerId: string;
  speakerLabel?: string;
  speakerCustomName?: string | null;
  startTimeMs: number;
  endTimeMs: number;
  content: string;
  confidenceScore?: number | null;
}

export interface TranscriptionSessionDto {
  id: string;
  userId?: string | null;
  guestToken?: string | null;
  projectFolderId?: string | null;
  analysisTitle?: string | null;
  originalFileName: string;
  fileFormat: string;
  durationSeconds?: number | null;
  fileSizeBytes: string; // Serializado como string para JSON desde BigInt
  storagePath?: string | null;
  audioExpiresAt: string;
  isAudioPurged: boolean;
  status: SessionStatus;
  sourceLanguage?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  speakers?: SpeakerDto[];
  segments?: TranscriptionSegmentDto[];
}

export const ListSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(SessionStatus).optional()
});

export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

export interface PaginatedSessionsResponseDto {
  data: TranscriptionSessionDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
