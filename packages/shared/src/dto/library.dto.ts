import { z } from "zod";
import type { SessionStatus } from "../enums.js";

export type SessionSource = "AUDIO" | "BOT";

export interface SearchSnippetDto {
  text: string;
  /** Pares [inicio, fin) sobre `text` que hay que resaltar. */
  ranges: [number, number][];
}

export interface LibrarySessionItemDto {
  id: string;
  originalFileName: string;
  fileFormat: string;
  projectFolderId: string | null;
  status: SessionStatus;
  durationSeconds: number | null;
  fileSizeBytes: string;
  audioExpiresAt: string;
  isAudioPurged: boolean;
  createdAt: string;
  source: SessionSource;
  /** Fecha real de la reunión (para audios, la de creación). */
  occurredAt: string;
  snippet?: SearchSnippetDto | null;
  matchCount?: number;
}

export interface ImportBotMeetingsResultDto {
  imported: number;
  alreadyImported: number;
  failed: { file: string; reason: string }[];
  folderMissing: boolean;
  folder: string;
}

const isoInstant = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha ISO inválida");

export const LibrarySessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  source: z.enum(["AUDIO", "BOT"]).optional(),
  q: z.string().trim().max(200).optional(),
  from: isoInstant.optional(),
  to: isoInstant.optional(),
  participant: z.string().trim().max(100).optional(),
  folderId: z.string().trim().max(100).optional()
});

export type LibrarySessionsQuery = z.infer<typeof LibrarySessionsQuerySchema>;

export interface ActionItemDto {
  id: string;
  sessionId: string;
  task: string;
  owner: string | null;
  /** Texto libre, tal como se dijo en la reunión (no se interpreta como fecha). */
  dueDate: string | null;
  evidence: string;
  done: boolean;
  doneAt: string | null;
}

export interface MeetingSummaryDto {
  sessionId: string;
  language: string;
  executiveSummary: string;
  note: string | null;
  generatedAt: string;
  topics: { title: string; summary: string }[];
  decisions: { text: string; evidence: string }[];
  openQuestions: { text: string; askedBy: string | null }[];
  participants: { name: string; speakingSeconds: number; speakingPercent: number }[];
  chapters: { title: string; startSec: number; endSec: number }[];
  actionItems: ActionItemDto[];
}

export const UpdateActionItemSchema = z.object({ done: z.boolean() });
export type UpdateActionItemInput = z.infer<typeof UpdateActionItemSchema>;

export interface ActionItemWithMeetingDto extends ActionItemDto {
  sessionTitle: string;
  /** Fecha real de la reunión a la que pertenece. */
  occurredAt: string;
}

export const ActionItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["open", "done", "all"]).default("open"),
  owner: z.string().trim().max(100).optional(),
  sessionId: z.string().trim().max(100).optional()
});
export type ActionItemsQuery = z.infer<typeof ActionItemsQuerySchema>;
