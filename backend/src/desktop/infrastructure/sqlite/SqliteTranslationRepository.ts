import type { DatabaseSync } from "node:sqlite";
import { ITranslationRepository } from "../../../domain/repositories/ITranslationRepository.js";
import { Translation } from "../../../domain/entities/Translation.js";

export class SqliteTranslationRepository implements ITranslationRepository {
  constructor(private db: DatabaseSync) {}

  public async findBySessionAndLanguage(
    sessionId: string,
    targetLanguage: string
  ): Promise<Translation | null> {
    const row = this.db
      .prepare("SELECT * FROM translations WHERE session_id = ? AND target_language = ?")
      .get(sessionId, targetLanguage) as any;

    if (!row) return null;
    return this.toDomain(row);
  }

  public async create(translation: Translation): Promise<Translation> {
    const stmt = this.db.prepare(`
      INSERT INTO translations (id, session_id, target_language, translated_text, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      translation.id,
      translation.sessionId,
      translation.targetLanguage,
      translation.translatedText,
      translation.createdAt.toISOString()
    );

    const row = this.db
      .prepare("SELECT * FROM translations WHERE id = ?")
      .get(translation.id) as any;
    return this.toDomain(row);
  }

  private toDomain(raw: any): Translation {
    return new Translation({
      id: raw.id,
      sessionId: raw.session_id,
      targetLanguage: raw.target_language,
      translatedText: raw.translated_text,
      createdAt: new Date(raw.created_at)
    });
  }
}
