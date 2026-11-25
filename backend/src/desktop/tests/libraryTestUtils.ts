import type { DatabaseSync } from "node:sqlite";
import { LOCAL_USER_ID } from "../infrastructure/sqlite/migrations.js";

export { LOCAL_USER_ID };

export interface InsertSessionOptions {
  id: string;
  userId?: string;
  name?: string;
  source?: "AUDIO" | "BOT";
  fileFormat?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string | null;
  externalId?: string | null;
  projectFolderId?: string | null;
}

export function insertSession(db: DatabaseSync, o: InsertSessionOptions): void {
  const createdAt = o.createdAt ?? "2026-11-20T10:00:00.000Z";
  db.prepare(
    `INSERT INTO transcription_sessions (
      id, user_id, guest_token_hash, project_folder_id, original_file_name, file_format,
      duration_seconds, file_size_bytes, storage_path, audio_expires_at, is_audio_purged,
      status, source_language, error_message, created_at, updated_at, source, external_id, occurred_at, source_meta
    ) VALUES (?, ?, NULL, ?, ?, ?, 60, 0, NULL, ?, 1, ?, 'es', NULL, ?, ?, ?, ?, ?, NULL)`
  ).run(
    o.id,
    o.userId ?? LOCAL_USER_ID,
    o.projectFolderId ?? null,
    o.name ?? `Sesión ${o.id}`,
    o.fileFormat ?? "mp3",
    createdAt,
    o.status ?? "COMPLETED",
    createdAt,
    o.updatedAt ?? createdAt,
    o.source ?? "AUDIO",
    o.externalId ?? null,
    o.occurredAt ?? null
  );
}

export function insertSpeaker(db: DatabaseSync, o: { id: string; sessionId: string; label: string; customName?: string | null }): void {
  db.prepare("INSERT INTO speakers (id, session_id, label, custom_name) VALUES (?, ?, ?, ?)").run(
    o.id,
    o.sessionId,
    o.label,
    o.customName ?? null
  );
}

export function insertSegment(
  db: DatabaseSync,
  o: { id: string; sessionId: string; speakerId: string; startMs: number; endMs: number; content: string }
): void {
  db.prepare(
    "INSERT INTO transcription_segments (id, session_id, speaker_id, start_time_ms, end_time_ms, content, confidence_score) VALUES (?, ?, ?, ?, ?, ?, NULL)"
  ).run(o.id, o.sessionId, o.speakerId, o.startMs, o.endMs, o.content);
}

export function insertMeetingSummary(
  db: DatabaseSync,
  o: {
    sessionId: string;
    executiveSummary?: string;
    note?: string | null;
    topics?: unknown[];
    decisions?: unknown[];
    openQuestions?: unknown[];
    participants?: unknown[];
    chapters?: unknown[];
  }
): void {
  db.prepare(
    `INSERT INTO meeting_summaries (id, session_id, language, executive_summary, note, generated_at, topics, decisions, open_questions, participants, chapters)
     VALUES (?, ?, 'es', ?, ?, '2026-11-25T14:31:00.000Z', ?, ?, ?, ?, ?)`
  ).run(
    `ms-${o.sessionId}`,
    o.sessionId,
    o.executiveSummary ?? "Resumen de prueba.",
    o.note ?? null,
    JSON.stringify(o.topics ?? []),
    JSON.stringify(o.decisions ?? []),
    JSON.stringify(o.openQuestions ?? []),
    JSON.stringify(o.participants ?? []),
    JSON.stringify(o.chapters ?? [])
  );
}

export function insertActionItem(
  db: DatabaseSync,
  o: { id: string; sessionId: string; position?: number; task?: string; owner?: string | null; dueDate?: string | null; evidence?: string; done?: boolean }
): void {
  db.prepare(
    "INSERT INTO action_items (id, session_id, position, task, owner, due_date, evidence, done, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    o.id,
    o.sessionId,
    o.position ?? 0,
    o.task ?? `Tarea ${o.id}`,
    o.owner ?? null,
    o.dueDate ?? null,
    o.evidence ?? "cita",
    o.done ? 1 : 0,
    o.done ? "2026-11-26T10:00:00.000Z" : null
  );
}
