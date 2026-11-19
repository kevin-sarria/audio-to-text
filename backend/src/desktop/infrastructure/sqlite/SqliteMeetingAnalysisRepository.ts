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
        SET title = ?, project_context = ?, summary = ?, key_decisions = ?, topics_discussed = ?, issues = ?,
            already_resolved = ?, in_progress = ?, global_open_questions = ?, backlog = ?, repo_hours_totals = ?,
            updated_at = ?
        WHERE session_id = ?
      `);

      stmt.run(
        analysis.title || null,
        analysis.projectContext || null,
        analysis.summary,
        JSON.stringify(analysis.keyDecisions),
        JSON.stringify(analysis.topicsDiscussed),
        JSON.stringify(analysis.issues),
        JSON.stringify(analysis.alreadyResolved),
        JSON.stringify(analysis.inProgress),
        JSON.stringify(analysis.globalOpenQuestions),
        JSON.stringify(analysis.backlog),
        analysis.repoHoursTotals ? JSON.stringify(analysis.repoHoursTotals) : null,
        analysis.updatedAt.toISOString(),
        analysis.sessionId
      );
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO meeting_analyses (
          id, session_id, title, project_context, summary, key_decisions, topics_discussed, issues,
          already_resolved, in_progress, global_open_questions, backlog, repo_hours_totals,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        JSON.stringify(analysis.alreadyResolved),
        JSON.stringify(analysis.inProgress),
        JSON.stringify(analysis.globalOpenQuestions),
        JSON.stringify(analysis.backlog),
        analysis.repoHoursTotals ? JSON.stringify(analysis.repoHoursTotals) : null,
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
    let alreadyResolved: string[] = [];
    let inProgress: string[] = [];
    let globalOpenQuestions: string[] = [];
    let backlog: string[] = [];
    let repoHoursTotals = null;

    try {
      keyDecisions = typeof raw.key_decisions === "string" ? JSON.parse(raw.key_decisions) : raw.key_decisions || [];
    } catch {}

    try {
      topicsDiscussed = typeof raw.topics_discussed === "string" ? JSON.parse(raw.topics_discussed) : raw.topics_discussed || [];
    } catch {}

    try {
      issues = typeof raw.issues === "string" ? JSON.parse(raw.issues) : raw.issues || [];
    } catch {}

    try {
      if (raw.already_resolved) {
        alreadyResolved = typeof raw.already_resolved === "string" ? JSON.parse(raw.already_resolved) : raw.already_resolved;
      }
    } catch {}

    try {
      if (raw.in_progress) {
        inProgress = typeof raw.in_progress === "string" ? JSON.parse(raw.in_progress) : raw.in_progress;
      }
    } catch {}

    try {
      if (raw.global_open_questions) {
        globalOpenQuestions = typeof raw.global_open_questions === "string" ? JSON.parse(raw.global_open_questions) : raw.global_open_questions;
      }
    } catch {}

    try {
      if (raw.backlog) {
        backlog = typeof raw.backlog === "string" ? JSON.parse(raw.backlog) : raw.backlog;
      }
    } catch {}

    try {
      if (raw.repo_hours_totals) {
        repoHoursTotals = typeof raw.repo_hours_totals === "string" ? JSON.parse(raw.repo_hours_totals) : raw.repo_hours_totals;
      }
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
      alreadyResolved,
      inProgress,
      globalOpenQuestions,
      backlog,
      repoHoursTotals,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at)
    });
  }
}
