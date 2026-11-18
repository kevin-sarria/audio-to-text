import type { DatabaseSync } from "node:sqlite";
import { ISegmentRepository } from "../../../domain/repositories/ISegmentRepository.js";
import { TranscriptionSegment } from "../../../domain/entities/TranscriptionSegment.js";

export class SqliteSegmentRepository implements ISegmentRepository {
  constructor(private db: DatabaseSync) {}

  public async findBySessionId(sessionId: string): Promise<TranscriptionSegment[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM transcription_segments WHERE session_id = ? ORDER BY start_time_ms ASC"
      )
      .all(sessionId) as any[];

    return rows.map((r) => this.toDomain(r));
  }

  public async create(segment: TranscriptionSegment): Promise<TranscriptionSegment> {
    const stmt = this.db.prepare(`
      INSERT INTO transcription_segments (id, session_id, speaker_id, start_time_ms, end_time_ms, content, confidence_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      segment.id,
      segment.sessionId,
      segment.speakerId,
      segment.startTimeMs,
      segment.endTimeMs,
      segment.content,
      segment.confidenceScore ?? null
    );

    const row = this.db
      .prepare("SELECT * FROM transcription_segments WHERE id = ?")
      .get(segment.id) as any;
    return this.toDomain(row);
  }

  public async createMany(segments: TranscriptionSegment[]): Promise<void> {
    if (segments.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    try {
      const stmt = this.db.prepare(`
        INSERT INTO transcription_segments (id, session_id, speaker_id, start_time_ms, end_time_ms, content, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const seg of segments) {
        stmt.run(
          seg.id,
          seg.sessionId,
          seg.speakerId,
          seg.startTimeMs,
          seg.endTimeMs,
          seg.content,
          seg.confidenceScore ?? null
        );
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  public async deleteBySessionId(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM transcription_segments WHERE session_id = ?").run(sessionId);
  }

  private toDomain(raw: any): TranscriptionSegment {
    return new TranscriptionSegment({
      id: raw.id,
      sessionId: raw.session_id,
      speakerId: raw.speaker_id,
      startTimeMs: Number(raw.start_time_ms),
      endTimeMs: Number(raw.end_time_ms),
      content: raw.content,
      confidenceScore:
        raw.confidence_score !== null && raw.confidence_score !== undefined
          ? Number(raw.confidence_score)
          : null
    });
  }
}
