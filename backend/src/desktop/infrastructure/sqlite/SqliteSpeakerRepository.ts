import type { DatabaseSync } from "node:sqlite";
import { ISpeakerRepository } from "../../../domain/repositories/ISpeakerRepository.js";
import { Speaker } from "../../../domain/entities/Speaker.js";

export class SqliteSpeakerRepository implements ISpeakerRepository {
  constructor(private db: DatabaseSync) {}

  public async findById(id: string): Promise<Speaker | null> {
    const row = this.db.prepare("SELECT * FROM speakers WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.toDomain(row);
  }

  public async findBySessionId(sessionId: string): Promise<Speaker[]> {
    const rows = this.db
      .prepare("SELECT * FROM speakers WHERE session_id = ? ORDER BY label ASC")
      .all(sessionId) as any[];
    return rows.map((r) => this.toDomain(r));
  }

  public async findBySessionAndLabel(sessionId: string, label: string): Promise<Speaker | null> {
    const row = this.db
      .prepare("SELECT * FROM speakers WHERE session_id = ? AND label = ?")
      .get(sessionId, label) as any;
    if (!row) return null;
    return this.toDomain(row);
  }

  public async create(speaker: Speaker): Promise<Speaker> {
    const stmt = this.db.prepare(`
      INSERT INTO speakers (id, session_id, label, custom_name)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(speaker.id, speaker.sessionId, speaker.label, speaker.customName ?? null);
    return (await this.findById(speaker.id))!;
  }

  public async createMany(speakers: Speaker[]): Promise<void> {
    if (speakers.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    try {
      const stmt = this.db.prepare(`
        INSERT INTO speakers (id, session_id, label, custom_name)
        VALUES (?, ?, ?, ?)
      `);

      for (const spk of speakers) {
        stmt.run(spk.id, spk.sessionId, spk.label, spk.customName ?? null);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  public async update(speaker: Speaker): Promise<Speaker> {
    const stmt = this.db.prepare(`
      UPDATE speakers SET
        custom_name = ?
      WHERE id = ?
    `);

    stmt.run(speaker.customName ?? null, speaker.id);
    // El nombre forma parte del texto buscable: se descarta el índice de la sesión para que se reconstruya
    this.db.prepare("DELETE FROM session_search WHERE session_id = ?").run(speaker.sessionId);
    return (await this.findById(speaker.id))!;
  }

  private toDomain(raw: any): Speaker {
    return new Speaker({
      id: raw.id,
      sessionId: raw.session_id,
      label: raw.label,
      customName: raw.custom_name
    });
  }
}
