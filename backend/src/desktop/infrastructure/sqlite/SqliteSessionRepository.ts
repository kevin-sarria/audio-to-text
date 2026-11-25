import type { DatabaseSync } from "node:sqlite";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { TranscriptionSession } from "../../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../../domain/entities/TranscriptionSegment.js";
import { Translation } from "../../../domain/entities/Translation.js";
import { SessionStatus } from "../../../domain/value-objects/SessionStatus.js";

export class SqliteSessionRepository implements ISessionRepository {
  constructor(private db: DatabaseSync) {}

  public async findById(id: string): Promise<TranscriptionSession | null> {
    const raw = this.db.prepare("SELECT * FROM transcription_sessions WHERE id = ?").get(id) as any;
    if (!raw) return null;

    const speakers = this.loadSpeakers(id);
    const segments = this.loadSegments(id);
    const translations = this.loadTranslations(id);

    return this.toDomain(raw, speakers, segments, translations);
  }

  public async findByUserId(
    userId: string,
    skip: number,
    take: number
  ): Promise<{ sessions: TranscriptionSession[]; total: number }> {
    const totalRow = this.db
      .prepare("SELECT COUNT(*) as count FROM transcription_sessions WHERE user_id = ?")
      .get(userId) as any;
    const total = totalRow ? Number(totalRow.count) : 0;

    const rows = this.db
      .prepare(
        "SELECT * FROM transcription_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
      )
      .all(userId, take, skip) as any[];

    const sessions = rows.map((r) => {
      const speakers = this.loadSpeakers(r.id);
      return this.toDomain(r, speakers, [], []);
    });

    return { sessions, total };
  }

  public async findExpiredPendingPurge(take: number, now: Date): Promise<TranscriptionSession[]> {
    const nowIso = now.toISOString();
    const rows = this.db
      .prepare(
        "SELECT * FROM transcription_sessions WHERE audio_expires_at <= ? AND is_audio_purged = 0 ORDER BY audio_expires_at ASC LIMIT ?"
      )
      .all(nowIso, take) as any[];

    return rows.map((r) => this.toDomain(r, [], [], []));
  }

  public async create(session: TranscriptionSession): Promise<TranscriptionSession> {
    const stmt = this.db.prepare(`
      INSERT INTO transcription_sessions (
        id, user_id, guest_token_hash, project_folder_id, original_file_name, file_format,
        duration_seconds, file_size_bytes, storage_path, audio_expires_at,
        is_audio_purged, status, source_language, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.userId ?? null,
      session.guestTokenHash ?? null,
      session.projectFolderId ?? null,
      session.originalFileName,
      session.fileFormat,
      session.durationSeconds ?? null,
      Number(session.fileSizeBytes),
      session.storagePath ?? null,
      session.audioExpiresAt.toISOString(),
      session.isAudioPurged ? 1 : 0,
      session.status,
      session.sourceLanguage ?? null,
      session.errorMessage ?? null,
      session.createdAt.toISOString(),
      session.updatedAt.toISOString()
    );

    return (await this.findById(session.id))!;
  }

  public async update(session: TranscriptionSession): Promise<TranscriptionSession> {
    const stmt = this.db.prepare(`
      UPDATE transcription_sessions SET
        project_folder_id = ?,
        duration_seconds = ?,
        storage_path = ?,
        is_audio_purged = ?,
        status = ?,
        source_language = ?,
        error_message = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      session.projectFolderId ?? null,
      session.durationSeconds ?? null,
      session.storagePath ?? null,
      session.isAudioPurged ? 1 : 0,
      session.status,
      session.sourceLanguage ?? null,
      session.errorMessage ?? null,
      session.updatedAt.toISOString(),
      session.id
    );

    return (await this.findById(session.id))!;
  }

  public async delete(id: string): Promise<void> {
    // Una reunión del bot borrada no debe reimportarse desde su reunion_*.json (que nunca se toca)
    this.db
      .prepare(
        "INSERT OR IGNORE INTO bot_import_exclusions (external_id, excluded_at) SELECT external_id, ? FROM transcription_sessions WHERE id = ? AND source = 'BOT' AND external_id IS NOT NULL"
      )
      .run(new Date().toISOString(), id);
    this.db.prepare("DELETE FROM transcription_sessions WHERE id = ?").run(id);
  }

  private loadSpeakers(sessionId: string): Speaker[] {
    const rows = this.db
      .prepare("SELECT * FROM speakers WHERE session_id = ? ORDER BY label ASC")
      .all(sessionId) as any[];

    return rows.map(
      (s) =>
        new Speaker({
          id: s.id,
          sessionId: s.session_id,
          label: s.label,
          customName: s.custom_name
        })
    );
  }

  private loadSegments(sessionId: string): TranscriptionSegment[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM transcription_segments WHERE session_id = ? ORDER BY start_time_ms ASC"
      )
      .all(sessionId) as any[];

    return rows.map(
      (seg) =>
        new TranscriptionSegment({
          id: seg.id,
          sessionId: seg.session_id,
          speakerId: seg.speaker_id,
          startTimeMs: Number(seg.start_time_ms),
          endTimeMs: Number(seg.end_time_ms),
          content: seg.content,
          confidenceScore:
            seg.confidence_score !== null && seg.confidence_score !== undefined
              ? Number(seg.confidence_score)
              : null
        })
    );
  }

  private loadTranslations(sessionId: string): Translation[] {
    const rows = this.db
      .prepare("SELECT * FROM translations WHERE session_id = ?")
      .all(sessionId) as any[];

    return rows.map(
      (t) =>
        new Translation({
          id: t.id,
          sessionId: t.session_id,
          targetLanguage: t.target_language,
          translatedText: t.translated_text,
          createdAt: new Date(t.created_at)
        })
    );
  }

  private toDomain(
    raw: any,
    speakers: Speaker[] = [],
    segments: TranscriptionSegment[] = [],
    translations: Translation[] = []
  ): TranscriptionSession {
    return new TranscriptionSession({
      id: raw.id,
      userId: raw.user_id,
      guestTokenHash: raw.guest_token_hash,
      projectFolderId: raw.project_folder_id ?? null,
      originalFileName: raw.original_file_name,
      fileFormat: raw.file_format,
      durationSeconds:
        raw.duration_seconds !== null && raw.duration_seconds !== undefined
          ? Number(raw.duration_seconds)
          : null,
      fileSizeBytes: BigInt(raw.file_size_bytes ?? 0),
      storagePath: raw.storage_path,
      audioExpiresAt: new Date(raw.audio_expires_at),
      isAudioPurged: Boolean(raw.is_audio_purged),
      status: raw.status as SessionStatus,
      sourceLanguage: raw.source_language,
      errorMessage: raw.error_message,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at),
      speakers,
      segments,
      translations
    });
  }
}
