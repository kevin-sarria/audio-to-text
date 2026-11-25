import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SessionSearchIndexer, buildSessionTexts } from "../library/SessionSearchIndexer.js";
import { insertActionItem, insertMeetingSummary, insertSegment, insertSession, insertSpeaker, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SessionSearchIndexer", () => {
  let db: DatabaseSync;
  const body = (id: string) => (db.prepare("SELECT body_text FROM session_search WHERE session_id = ?").get(id) as any)?.body_text as string | undefined;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    insertSession(db, { id: "s1", name: "Reunión Google Meet", source: "BOT", fileFormat: "bot", externalId: "x1", updatedAt: "2026-11-26T09:00:00.000Z" });
    insertSpeaker(db, { id: "sp1", sessionId: "s1", label: "Ana" });
    insertSpeaker(db, { id: "sp2", sessionId: "s1", label: "Hablante 2", customName: "Luis Pérez" });
    insertSegment(db, { id: "g1", sessionId: "s1", speakerId: "sp1", startMs: 0, endMs: 5000, content: "Vamos a migrar la base de datos." });
    insertMeetingSummary(db, {
      sessionId: "s1",
      executiveSummary: "Se acordó la migración.",
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar" }]
    });
    insertActionItem(db, { id: "ai1", sessionId: "s1", task: "Preparar el script", owner: "Luis" });
    insertSession(db, { id: "pendiente", status: "PENDING" });
  });
  afterEach(() => db.close());

  it("indexa solo sesiones COMPLETED con título, hablantes, transcripción, resumen y puntos de acción, normalizados", () => {
    const indexer = new SessionSearchIndexer(db, () => new Date("2026-11-26T10:00:00.000Z"));
    expect(indexer.ensureIndexed(LOCAL_USER_ID)).toBe(1);

    const text = body("s1")!;
    expect(text).toContain("ana");
    expect(text).toContain("luis perez"); // nombre personalizado, sin tilde
    expect(text).toContain("vamos a migrar la base de datos");
    expect(text).toContain("se acordo la migracion");
    expect(text).toContain("migrar el viernes");
    expect(text).toContain("preparar el script");
    expect(body("pendiente")).toBeUndefined();
    expect((db.prepare("SELECT title_text FROM session_search WHERE session_id = 's1'").get() as any).title_text).toBe("reunion google meet");
  });

  it("es idempotente: sin cambios no reindexa", () => {
    const indexer = new SessionSearchIndexer(db, () => new Date("2026-11-26T10:00:00.000Z"));
    indexer.ensureIndexed(LOCAL_USER_ID);
    expect(indexer.ensureIndexed(LOCAL_USER_ID)).toBe(0);
  });

  it("reindexa cuando el análisis cambió después de indexar", () => {
    new SessionSearchIndexer(db, () => new Date("2026-11-26T10:00:00.000Z")).ensureIndexed(LOCAL_USER_ID);

    db.prepare(
      `INSERT INTO meeting_analyses (id, session_id, summary, key_decisions, topics_discussed, issues, created_at, updated_at)
       VALUES ('a1', 's1', 'Análisis nuevo sobre facturación', '[]', '[]', '[]', '2026-11-26T11:00:00.000Z', '2026-11-26T11:00:00.000Z')`
    ).run();

    const later = new SessionSearchIndexer(db, () => new Date("2026-11-26T11:30:00.000Z"));
    expect(later.ensureIndexed(LOCAL_USER_ID)).toBe(1);
    expect(body("s1")).toContain("analisis nuevo sobre facturacion");
  });

  it("solo indexa sesiones del usuario indicado y buildSessionTexts devuelve null si no existe", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    const indexer = new SessionSearchIndexer(db);
    indexer.ensureIndexed(LOCAL_USER_ID);
    expect(body("ajena")).toBeUndefined();
    expect(buildSessionTexts(db, "no-existe")).toBeNull();
  });
});
