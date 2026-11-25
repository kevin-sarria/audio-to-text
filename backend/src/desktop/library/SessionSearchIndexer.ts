import type { DatabaseSync } from "node:sqlite";
import { flattenJsonText, normalizeSearchText } from "./searchText.js";

export interface SessionTexts {
  title: string;
  body: string;
}

/** Texto original (sin normalizar) de una sesión: sirve para indexar y para construir fragmentos. */
export function buildSessionTexts(db: DatabaseSync, sessionId: string): SessionTexts | null {
  const session = db.prepare("SELECT original_file_name FROM transcription_sessions WHERE id = ?").get(sessionId) as any;
  if (!session) return null;

  const analysis = db
    .prepare("SELECT title, summary, key_decisions, topics_discussed FROM meeting_analyses WHERE session_id = ?")
    .get(sessionId) as any;
  const summary = db
    .prepare("SELECT executive_summary, topics, decisions, open_questions FROM meeting_summaries WHERE session_id = ?")
    .get(sessionId) as any;
  const speakers = db
    .prepare("SELECT COALESCE(custom_name, label) AS name FROM speakers WHERE session_id = ? ORDER BY label")
    .all(sessionId) as { name: string }[];
  const segments = db
    .prepare("SELECT content FROM transcription_segments WHERE session_id = ? ORDER BY start_time_ms")
    .all(sessionId) as { content: string }[];
  const items = db
    .prepare("SELECT task, owner, due_date FROM action_items WHERE session_id = ? ORDER BY position")
    .all(sessionId) as { task: string; owner: string | null; due_date: string | null }[];

  const title = [session.original_file_name, analysis?.title].filter(Boolean).join(" ");
  const body = [
    speakers.map((s) => s.name).join(" "),
    segments.map((s) => s.content).join("\n"),
    analysis?.summary,
    flattenJsonText(analysis?.key_decisions),
    flattenJsonText(analysis?.topics_discussed),
    summary?.executive_summary,
    flattenJsonText(summary?.topics),
    flattenJsonText(summary?.decisions),
    flattenJsonText(summary?.open_questions),
    items.map((i) => [i.task, i.owner, i.due_date].filter(Boolean).join(" ")).join("\n")
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");

  return { title, body };
}

export class SessionSearchIndexer {
  constructor(
    private db: DatabaseSync,
    private now: () => Date = () => new Date()
  ) {}

  public reindexSession(sessionId: string): void {
    const texts = buildSessionTexts(this.db, sessionId);
    if (!texts) return;
    this.db
      .prepare(
        `INSERT INTO session_search (session_id, title_text, body_text, indexed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           title_text = excluded.title_text, body_text = excluded.body_text, indexed_at = excluded.indexed_at`
      )
      .run(sessionId, normalizeSearchText(texts.title), normalizeSearchText(texts.body), this.now().toISOString());
  }

  /** Reindexa las sesiones COMPLETED del usuario sin fila o cuyo análisis/resumen cambió después. Devuelve cuántas. */
  public ensureIndexed(userId: string): number {
    const stale = this.db
      .prepare(
        `SELECT s.id FROM transcription_sessions s
         LEFT JOIN session_search ss ON ss.session_id = s.id
         LEFT JOIN meeting_analyses a ON a.session_id = s.id
         LEFT JOIN meeting_summaries ms ON ms.session_id = s.id
         WHERE s.user_id = ? AND s.status = 'COMPLETED'
           AND (ss.session_id IS NULL
                OR ss.indexed_at < MAX(s.updated_at, COALESCE(a.updated_at, ''), COALESCE(ms.generated_at, '')))`
      )
      .all(userId) as { id: string }[];

    for (const row of stale) this.reindexSession(row.id);
    return stale.length;
  }
}
