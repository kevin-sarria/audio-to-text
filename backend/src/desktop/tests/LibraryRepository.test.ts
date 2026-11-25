import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { insertSession, insertMeetingSummary, insertActionItem, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository.listSessions", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    insertSession(db, { id: "audio-viejo", createdAt: "2026-11-01T10:00:00.000Z" });
    insertSession(db, { id: "audio-nuevo", createdAt: "2026-11-20T10:00:00.000Z" });
    // reunión de bot creada (importada) tarde pero ocurrida antes que audio-nuevo
    insertSession(db, { id: "bot-1", source: "BOT", fileFormat: "bot", externalId: "b1", createdAt: "2026-11-26T09:00:00.000Z", occurredAt: "2026-11-10T15:00:00.000Z" });
  });
  afterEach(() => db.close());

  it("ordena por la fecha real de la reunión (occurred_at, o created_at en audios)", () => {
    const { items, total } = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20 });
    expect(total).toBe(3);
    expect(items.map((i) => i.id)).toEqual(["audio-nuevo", "bot-1", "audio-viejo"]);
  });

  it("cada ítem trae origen, fecha de la reunión y formato", () => {
    const { items } = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20 });
    const bot = items.find((i) => i.id === "bot-1")!;
    expect(bot).toMatchObject({
      source: "BOT",
      fileFormat: "bot",
      occurredAt: "2026-11-10T15:00:00.000Z",
      createdAt: "2026-11-26T09:00:00.000Z",
      isAudioPurged: true,
      status: "COMPLETED",
      fileSizeBytes: "0"
    });
    const audio = items.find((i) => i.id === "audio-nuevo")!;
    expect(audio).toMatchObject({ source: "AUDIO", occurredAt: "2026-11-20T10:00:00.000Z" });
  });

  it("filtra por origen", () => {
    expect(repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, source: "BOT" }).items.map((i) => i.id)).toEqual(["bot-1"]);
    expect(repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, source: "AUDIO" }).total).toBe(2);
  });

  it("pagina y devuelve el total sin paginar", () => {
    const p1 = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 2 });
    const p2 = repo.listSessions({ userId: LOCAL_USER_ID, page: 2, limit: 2 });
    expect(p1.items.map((i) => i.id)).toEqual(["audio-nuevo", "bot-1"]);
    expect(p2.items.map((i) => i.id)).toEqual(["audio-viejo"]);
    expect(p1.total).toBe(3);
    expect(p2.total).toBe(3);
  });

  it("solo devuelve sesiones del usuario consultado", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'otro@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    expect(repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20 }).items.map((i) => i.id)).not.toContain("ajena");
    expect(repo.listSessions({ userId: "otro", page: 1, limit: 20 }).items.map((i) => i.id)).toEqual(["ajena"]);
  });
});

describe("SqliteLibraryRepository: resumen y puntos de acción", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    insertSession(db, { id: "s1", source: "BOT", fileFormat: "bot", externalId: "x1" });
    insertSession(db, { id: "sin-resumen" });
    insertMeetingSummary(db, {
      sessionId: "s1",
      executiveSummary: "Se acordó migrar.",
      note: null,
      topics: [{ title: "Migración", summary: "Plan." }],
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar" }],
      openQuestions: [{ text: "¿Quién aprueba?", askedBy: "Ana" }, { text: "¿Cuándo?" }],
      participants: [{ name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 }],
      chapters: [{ title: "Migración", startSec: 0, endSec: 30 }]
    });
    insertActionItem(db, { id: "ai-b", sessionId: "s1", position: 1, task: "Segunda", owner: "Luis", dueDate: "jueves" });
    insertActionItem(db, { id: "ai-a", sessionId: "s1", position: 0, task: "Primera" });
  });
  afterEach(() => db.close());

  it("sessionExistsForUser distingue sesiones propias, ajenas e inexistentes", () => {
    expect(repo.sessionExistsForUser(LOCAL_USER_ID, "s1")).toBe(true);
    expect(repo.sessionExistsForUser(LOCAL_USER_ID, "no-existe")).toBe(false);
    expect(repo.sessionExistsForUser("otro-usuario", "s1")).toBe(false);
  });

  it("getMeetingSummary devuelve el resumen con los puntos de acción ordenados por posición", () => {
    const s = repo.getMeetingSummary("s1")!;
    expect(s).toMatchObject({
      sessionId: "s1",
      language: "es",
      executiveSummary: "Se acordó migrar.",
      note: null,
      topics: [{ title: "Migración", summary: "Plan." }],
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar" }],
      participants: [{ name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 }],
      chapters: [{ title: "Migración", startSec: 0, endSec: 30 }]
    });
    expect(s.openQuestions).toEqual([{ text: "¿Quién aprueba?", askedBy: "Ana" }, { text: "¿Cuándo?", askedBy: null }]);
    expect(s.actionItems.map((a) => a.task)).toEqual(["Primera", "Segunda"]);
    expect(s.actionItems[1]).toEqual({
      id: "ai-b", sessionId: "s1", task: "Segunda", owner: "Luis", dueDate: "jueves", evidence: "cita", done: false, doneAt: null
    });
  });

  it("devuelve null si la sesión no tiene resumen", () => {
    expect(repo.getMeetingSummary("sin-resumen")).toBeNull();
  });

  it("setActionItemDone marca y desmarca fijando o limpiando done_at", () => {
    const now = new Date("2026-11-27T12:00:00.000Z");
    const done = repo.setActionItemDone(LOCAL_USER_ID, "ai-a", true, now)!;
    expect(done).toMatchObject({ id: "ai-a", done: true, doneAt: now.toISOString() });

    const undone = repo.setActionItemDone(LOCAL_USER_ID, "ai-a", false)!;
    expect(undone).toMatchObject({ done: false, doneAt: null });
  });

  it("setActionItemDone devuelve null si el punto no existe o pertenece a otro usuario", () => {
    expect(repo.setActionItemDone(LOCAL_USER_ID, "no-existe", true)).toBeNull();
    expect(repo.setActionItemDone("otro-usuario", "ai-a", true)).toBeNull();
    expect((db.prepare("SELECT done FROM action_items WHERE id = 'ai-a'").get() as any).done).toBe(0);
  });
});
