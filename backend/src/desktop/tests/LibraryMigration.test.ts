import { describe, it, expect } from "vitest";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { MIGRATIONS, runMigrations } from "../infrastructure/sqlite/migrations.js";
import { insertSession, LOCAL_USER_ID } from "./libraryTestUtils.js";
import type { DatabaseSync } from "node:sqlite";

const columns = (db: DatabaseSync, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("Migración 6 (biblioteca de reuniones)", () => {
  it("una base nueva trae columnas y tablas de la biblioteca", () => {
    const db = openSqliteDatabase({ dbPath: ":memory:" });
    expect(columns(db, "transcription_sessions")).toEqual(
      expect.arrayContaining(["source", "external_id", "occurred_at", "source_meta"])
    );
    expect(columns(db, "meeting_summaries")).toEqual(
      expect.arrayContaining(["session_id", "language", "executive_summary", "note", "generated_at", "topics", "decisions", "open_questions", "participants", "chapters"])
    );
    expect(columns(db, "action_items")).toEqual(
      expect.arrayContaining(["id", "session_id", "position", "task", "owner", "due_date", "evidence", "done", "done_at"])
    );
    expect(columns(db, "session_search")).toEqual(
      expect.arrayContaining(["session_id", "title_text", "body_text", "indexed_at"])
    );
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    db.close();
  });

  it("migrar una base con datos conserva las filas existentes como origen AUDIO", () => {
    const sqlite = process.getBuiltinModule("node:sqlite")!;
    const db = new sqlite.DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (let i = 0; i < 5; i++) db.exec(MIGRATIONS[i]!);
    db.exec("PRAGMA user_version = 5");

    // sesión "antigua": solo con las columnas de antes de la migración 6
    db.prepare(
      `INSERT INTO transcription_sessions (id, user_id, original_file_name, file_format, file_size_bytes, audio_expires_at, is_audio_purged, status, created_at, updated_at)
       VALUES ('legacy-1', ?, 'viejo.mp3', 'mp3', 100, '2026-12-01T00:00:00.000Z', 0, 'COMPLETED', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`
    ).run(LOCAL_USER_ID);

    runMigrations(db);

    const row = db.prepare("SELECT source, external_id, occurred_at, original_file_name FROM transcription_sessions WHERE id = 'legacy-1'").get() as any;
    expect(row).toMatchObject({ source: "AUDIO", external_id: null, occurred_at: null, original_file_name: "viejo.mp3" });
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    db.close();
  });

  it("el índice único impide duplicar (source, external_id) pero admite varios audios sin external_id", () => {
    const db = openSqliteDatabase({ dbPath: ":memory:" });
    insertSession(db, { id: "b1", source: "BOT", externalId: "bot-session-1", fileFormat: "bot" });
    expect(() => insertSession(db, { id: "b2", source: "BOT", externalId: "bot-session-1", fileFormat: "bot" })).toThrow();
    insertSession(db, { id: "a1" });
    insertSession(db, { id: "a2" });
    insertSession(db, { id: "b3", source: "BOT", externalId: "bot-session-2", fileFormat: "bot" });
    expect((db.prepare("SELECT COUNT(*) AS c FROM transcription_sessions").get() as any).c).toBe(4);
    db.close();
  });

  it("borrar una sesión borra en cascada su resumen, puntos de acción e índice", () => {
    const db = openSqliteDatabase({ dbPath: ":memory:" });
    insertSession(db, { id: "s1" });
    db.prepare("INSERT INTO meeting_summaries (id, session_id, language, executive_summary, generated_at, topics, decisions, open_questions, participants, chapters) VALUES ('m1','s1','es','x','2026-11-25T00:00:00.000Z','[]','[]','[]','[]','[]')").run();
    db.prepare("INSERT INTO action_items (id, session_id, position, task, evidence) VALUES ('ai1','s1',0,'t','e')").run();
    db.prepare("INSERT INTO session_search (session_id, title_text, body_text, indexed_at) VALUES ('s1','t','b','2026-11-25T00:00:00.000Z')").run();

    db.prepare("DELETE FROM transcription_sessions WHERE id = 's1'").run();

    for (const table of ["meeting_summaries", "action_items", "session_search"]) {
      expect((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as any).c).toBe(0);
    }
    db.close();
  });
});
