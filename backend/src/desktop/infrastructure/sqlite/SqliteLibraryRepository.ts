import type { DatabaseSync } from "node:sqlite";
import type { ActionItemDto, ActionItemWithMeetingDto, LibrarySessionItemDto, MeetingSummaryDto, SessionSource } from "@audio-to-text/shared";
import { buildSnippet } from "../../library/searchSnippet.js";
import { buildSessionTexts, SessionSearchIndexer } from "../../library/SessionSearchIndexer.js";
import { escapeLike, normalizeSearchText, parseSearchQuery } from "../../library/searchText.js";

export interface LibraryListQuery {
  userId: string;
  page: number;
  limit: number;
  source?: SessionSource;
  q?: string;
  from?: string;
  to?: string;
  participant?: string;
  folderId?: string;
}

const GENERIC_SPEAKER = /^(speaker[_ ]?\d+|hablante \d+|participante( \d+)?)$/i;

const OCCURRED_AT = "COALESCE(s.occurred_at, s.created_at)";

export class SqliteLibraryRepository {
  constructor(private db: DatabaseSync) {}

  public listSessions(query: LibraryListQuery): { items: LibrarySessionItemDto[]; total: number } {
    const where: string[] = ["s.user_id = ?"];
    const whereParams: (string | number)[] = [query.userId];
    let join = "";
    let matchSelect = "";
    const selectParams: string[] = [];

    if (query.source) {
      where.push("s.source = ?");
      whereParams.push(query.source);
    }

    if (query.from) {
      where.push(`${OCCURRED_AT} >= ?`);
      whereParams.push(new Date(query.from).toISOString());
    }
    if (query.to) {
      where.push(`${OCCURRED_AT} <= ?`);
      whereParams.push(new Date(query.to).toISOString());
    }
    if (query.folderId) {
      where.push("s.project_folder_id = ?");
      whereParams.push(query.folderId);
    }
    if (query.participant) {
      const names = this.matchingNames(this.speakerNames(query.userId), query.participant);
      if (names.length === 0) {
        where.push("0 = 1");
      } else {
        where.push(
          `EXISTS (SELECT 1 FROM speakers sp WHERE sp.session_id = s.id AND COALESCE(sp.custom_name, sp.label) IN (${names.map(() => "?").join(", ")}))`
        );
        whereParams.push(...names);
      }
    }

    const terms = parseSearchQuery(query.q);
    if (terms.length > 0) {
      new SessionSearchIndexer(this.db).ensureIndexed(query.userId);
      join = "JOIN session_search ss ON ss.session_id = s.id";
      for (const term of terms) {
        const like = `%${escapeLike(term)}%`;
        where.push("(ss.title_text LIKE ? ESCAPE '\\' OR ss.body_text LIKE ? ESCAPE '\\')");
        whereParams.push(like, like);
      }
      const counts = terms.map((t) => {
        selectParams.push(t, t);
        return `((LENGTH(ss.body_text) - LENGTH(REPLACE(ss.body_text, ?, ''))) / ${t.length} + (LENGTH(ss.title_text) - LENGTH(REPLACE(ss.title_text, ?, ''))) / ${t.length})`;
      });
      matchSelect = `, (${counts.join(" + ")}) AS match_count`;
    }

    const whereSql = where.join(" AND ");
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM transcription_sessions s ${join} WHERE ${whereSql}`)
      .get(...whereParams) as { count: number };

    const order = terms.length > 0 ? `match_count DESC, ${OCCURRED_AT} DESC, s.id DESC` : `${OCCURRED_AT} DESC, s.id DESC`;
    const rows = this.db
      .prepare(
        `SELECT s.id, s.original_file_name, s.file_format, s.project_folder_id, s.status, s.duration_seconds,
                s.file_size_bytes, s.audio_expires_at, s.is_audio_purged, s.created_at, s.source,
                ${OCCURRED_AT} AS occurred_at${matchSelect}
         FROM transcription_sessions s ${join}
         WHERE ${whereSql}
         ORDER BY ${order}
         LIMIT ? OFFSET ?`
      )
      .all(...selectParams, ...whereParams, query.limit, (query.page - 1) * query.limit) as any[];

    const items = rows.map((r) => {
      const item = this.toItem(r);
      if (terms.length > 0) {
        item.matchCount = Number(r.match_count);
        const texts = buildSessionTexts(this.db, r.id);
        item.snippet = texts ? buildSnippet(texts.body, terms) ?? buildSnippet(texts.title, terms) : null;
      }
      return item;
    });

    return { items, total: Number(totalRow.count) };
  }

  public listActionItems(
    q: { userId: string; page: number; limit: number; status: "open" | "done" | "all"; owner?: string; sessionId?: string }
  ): { items: ActionItemWithMeetingDto[]; total: number; openTotal: number } {
    const where: string[] = ["s.user_id = ?"];
    const params: (string | number)[] = [q.userId];

    if (q.status === "open") where.push("a.done = 0");
    if (q.status === "done") where.push("a.done = 1");
    if (q.sessionId) {
      where.push("a.session_id = ?");
      params.push(q.sessionId);
    }
    if (q.owner) {
      const names = this.matchingNames(this.listOwners(q.userId), q.owner);
      if (names.length === 0) where.push("0 = 1");
      else {
        where.push(`a.owner IN (${names.map(() => "?").join(", ")})`);
        params.push(...names);
      }
    }

    const whereSql = where.join(" AND ");
    const total = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS count FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id WHERE ${whereSql}`)
          .get(...params) as { count: number }
      ).count
    );
    const openTotal = Number(
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id WHERE s.user_id = ? AND a.done = 0"
          )
          .get(q.userId) as { count: number }
      ).count
    );

    const rows = this.db
      .prepare(
        `SELECT a.*, s.original_file_name AS session_title, ${OCCURRED_AT} AS occurred_at
         FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id
         WHERE ${whereSql}
         ORDER BY ${OCCURRED_AT} DESC, s.id DESC, a.position ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, q.limit, (q.page - 1) * q.limit) as any[];

    const items = rows.map((r) => ({ ...toActionItem(r), sessionTitle: r.session_title, occurredAt: r.occurred_at }));
    return { items, total, openTotal };
  }

  /** Responsables distintos de los puntos de acción del usuario, ordenados. */
  public listOwners(userId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT a.owner AS owner FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id
         WHERE s.user_id = ? AND a.owner IS NOT NULL AND TRIM(a.owner) <> ''`
      )
      .all(userId) as { owner: string }[];
    return rows.map((r) => r.owner).sort((a, b) => a.localeCompare(b, "es"));
  }

  /** Nombres distintos de hablantes del usuario (personalizado o etiqueta), sin etiquetas genéricas de diarización. */
  public listParticipants(userId: string): string[] {
    return this.speakerNames(userId)
      .filter((name) => !GENERIC_SPEAKER.test(name))
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  private speakerNames(userId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT COALESCE(sp.custom_name, sp.label) AS name
         FROM speakers sp JOIN transcription_sessions s ON s.id = sp.session_id
         WHERE s.user_id = ?`
      )
      .all(userId) as { name: string }[];
    return rows.map((r) => r.name);
  }

  /** Nombres que contienen el texto buscado, sin tildes ni mayúsculas. */
  private matchingNames(names: string[], needle: string): string[] {
    const n = normalizeSearchText(needle.trim());
    if (!n) return [];
    return names.filter((name) => normalizeSearchText(name).includes(n));
  }

  private toItem(r: any): LibrarySessionItemDto {
    return {
      id: r.id,
      originalFileName: r.original_file_name,
      fileFormat: r.file_format,
      projectFolderId: r.project_folder_id ?? null,
      status: r.status,
      durationSeconds: r.duration_seconds !== null && r.duration_seconds !== undefined ? Number(r.duration_seconds) : null,
      fileSizeBytes: String(r.file_size_bytes ?? 0),
      audioExpiresAt: r.audio_expires_at,
      isAudioPurged: Boolean(r.is_audio_purged),
      createdAt: r.created_at,
      source: r.source === "BOT" ? "BOT" : "AUDIO",
      occurredAt: r.occurred_at
    };
  }

  public sessionExistsForUser(userId: string, sessionId: string): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 AS x FROM transcription_sessions WHERE id = ? AND user_id = ?").get(sessionId, userId)
    );
  }

  /** El llamador debe validar antes que la sesión pertenece al usuario (ver `sessionExistsForUser`). */
  public getMeetingSummary(sessionId: string): MeetingSummaryDto | null {
    const row = this.db.prepare("SELECT * FROM meeting_summaries WHERE session_id = ?").get(sessionId) as any;
    if (!row) return null;

    const items = this.db
      .prepare("SELECT * FROM action_items WHERE session_id = ? ORDER BY position ASC")
      .all(sessionId) as any[];

    const openQuestions = parseJsonArray<{ text: string; askedBy?: string }>(row.open_questions).map((q) => ({
      text: q.text,
      askedBy: q.askedBy ?? null
    }));

    return {
      sessionId,
      language: row.language,
      executiveSummary: row.executive_summary,
      note: row.note ?? null,
      generatedAt: row.generated_at,
      topics: parseJsonArray(row.topics),
      decisions: parseJsonArray(row.decisions),
      openQuestions,
      participants: parseJsonArray(row.participants),
      chapters: parseJsonArray(row.chapters),
      actionItems: items.map(toActionItem)
    };
  }

  /** Marca o desmarca un punto de acción; null si no existe o no pertenece al usuario. */
  public setActionItemDone(userId: string, itemId: string, done: boolean, now: Date = new Date()): ActionItemDto | null {
    const owned = this.db
      .prepare(
        `SELECT a.id FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id
         WHERE a.id = ? AND s.user_id = ?`
      )
      .get(itemId, userId);
    if (!owned) return null;

    this.db
      .prepare("UPDATE action_items SET done = ?, done_at = ? WHERE id = ?")
      .run(done ? 1 : 0, done ? now.toISOString() : null, itemId);

    const row = this.db.prepare("SELECT * FROM action_items WHERE id = ?").get(itemId) as any;
    return toActionItem(row);
  }
}

function parseJsonArray<T = any>(raw: unknown): T[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toActionItem(r: any): ActionItemDto {
  return {
    id: r.id,
    sessionId: r.session_id,
    task: r.task,
    owner: r.owner ?? null,
    dueDate: r.due_date ?? null,
    evidence: r.evidence,
    done: Boolean(r.done),
    doneAt: r.done_at ?? null
  };
}
