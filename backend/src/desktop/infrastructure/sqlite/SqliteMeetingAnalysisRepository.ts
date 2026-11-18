import type { DatabaseSync } from "node:sqlite";
import { IMeetingAnalysisRepository } from "../../../domain/repositories/IMeetingAnalysisRepository.js";
import { MeetingAnalysis } from "../../../domain/entities/MeetingAnalysis.js";

export class SqliteMeetingAnalysisRepository implements IMeetingAnalysisRepository {
  constructor(private db: DatabaseSync) {}

  public async findBySessionId(sessionId: string): Promise<MeetingAnalysis | null> {
    const row = this.db
      .prepare("SELECT * FROM meeting_analyses WHERE session_id = ?")
      .get(sessionId) as any;

    if (!row) return null;
    return this.toDomain(row);
  }

  public async save(analysis: MeetingAnalysis): Promise<MeetingAnalysis> {
    const existing = await this.findBySessionId(analysis.sessionId);

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE meeting_analyses
        SET title = ?, project_context = ?, summary = ?, key_decisions = ?, topics_discussed = ?, issues = ?, updated_at = ?
        WHERE session_id = ?
      `);

      stmt.run(
        analysis.title || null,
        analysis.projectContext || null,
        analysis.summary,
        JSON.stringify(analysis.keyDecisions),
        JSON.stringify(analysis.topicsDiscussed),
        JSON.stringify(analysis.issues),
        analysis.updatedAt.toISOString(),
        analysis.sessionId
      );
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO meeting_analyses (id, session_id, title, project_context, summary, key_decisions, topics_discussed, issues, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        analysis.id,
        analysis.sessionId,
        analysis.title || null,
        analysis.projectContext || null,
        analysis.summary,
        JSON.stringify(analysis.keyDecisions),
        JSON.stringify(analysis.topicsDiscussed),
        JSON.stringify(analysis.issues),
        analysis.createdAt.toISOString(),
        analysis.updatedAt.toISOString()
      );
    }

    const saved = await this.findBySessionId(analysis.sessionId);
    return saved!;
  }

  public async deleteBySessionId(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM meeting_analyses WHERE session_id = ?").run(sessionId);
  }

  private toDomain(raw: any): MeetingAnalysis {
    let keyDecisions: string[] = [];
    let topicsDiscussed: string[] = [];
    let issues: any[] = [];

    try {
      keyDecisions = typeof raw.key_decisions === "string" ? JSON.parse(raw.key_decisions) : raw.key_decisions || [];
    } catch {}

    try {
      topicsDiscussed = typeof raw.topics_discussed === "string" ? JSON.parse(raw.topics_discussed) : raw.topics_discussed || [];
    } catch {}

    try {
      issues = typeof raw.issues === "string" ? JSON.parse(raw.issues) : raw.issues || [];
    } catch {}

    return new MeetingAnalysis({
      id: raw.id,
      sessionId: raw.session_id,
      title: raw.title ?? null,
      projectContext: raw.project_context ?? null,
      summary: raw.summary,
      keyDecisions,
      topicsDiscussed,
      issues,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at)
    });
  }
}
