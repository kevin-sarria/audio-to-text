import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { insertSession, insertSpeaker, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository: filtros", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;
  const ids = (extra: object) => repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, ...extra }).items.map((i) => i.id);

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    db.prepare(
      "INSERT INTO project_folders (id, user_id, name, technical_context, created_at, updated_at) VALUES ('f1', ?, 'Proyecto uno', 'ctx', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')"
    ).run(LOCAL_USER_ID);

    insertSession(db, { id: "a", occurredAt: "2026-11-10T12:00:00.000Z", projectFolderId: "f1" });
    insertSpeaker(db, { id: "spa", sessionId: "a", label: "Hablante 1", customName: "Ana García" });
    insertSession(db, { id: "b", source: "BOT", fileFormat: "bot", externalId: "x", occurredAt: "2026-11-15T12:00:00.000Z" });
    insertSpeaker(db, { id: "spb", sessionId: "b", label: "Luis" });
    insertSession(db, { id: "c", createdAt: "2026-11-20T09:00:00.000Z" }); // sin occurred_at: usa created_at
    insertSpeaker(db, { id: "spc", sessionId: "c", label: "Hablante 1" });
  });
  afterEach(() => db.close());

  it("from y to filtran por la fecha de la reunión, con límites inclusivos y created_at como respaldo", () => {
    expect(ids({ from: "2026-11-12T00:00:00.000Z" })).toEqual(["c", "b"]);
    expect(ids({ to: "2026-11-12T23:59:59.999Z" })).toEqual(["a"]);
    expect(ids({ from: "2026-11-10T12:00:00.000Z", to: "2026-11-10T12:00:00.000Z" })).toEqual(["a"]);
    expect(ids({ from: "2026-11-11T00:00:00.000Z", to: "2026-11-16T00:00:00.000Z" })).toEqual(["b"]);
  });

  it("participant coincide por parte del nombre, sin tildes ni mayúsculas, y usa el nombre personalizado", () => {
    expect(ids({ participant: "garcia" })).toEqual(["a"]);
    expect(ids({ participant: "ANA" })).toEqual(["a"]);
    expect(ids({ participant: "lu" })).toEqual(["b"]);
    expect(ids({ participant: "nadie" })).toEqual([]);
  });

  it("folderId filtra por carpeta de proyecto", () => {
    expect(ids({ folderId: "f1" })).toEqual(["a"]);
    expect(ids({ folderId: "otra" })).toEqual([]);
  });

  it("los filtros se combinan entre sí y con source", () => {
    expect(ids({ source: "BOT", participant: "luis" })).toEqual(["b"]);
    expect(ids({ source: "AUDIO", participant: "luis" })).toEqual([]);
    expect(ids({ from: "2026-11-01T00:00:00.000Z", participant: "ana", folderId: "f1" })).toEqual(["a"]);
  });

  it("listParticipants devuelve nombres distintos y ordenados, sin etiquetas genéricas de diarización", () => {
    insertSession(db, { id: "d" });
    insertSpeaker(db, { id: "spd1", sessionId: "d", label: "SPEAKER_00" });
    insertSpeaker(db, { id: "spd2", sessionId: "d", label: "Luis" }); // repetido en otra sesión
    expect(repo.listParticipants(LOCAL_USER_ID)).toEqual(["Ana García", "Luis"]);
  });

  it("listParticipants solo incluye hablantes de sesiones del usuario", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    insertSpeaker(db, { id: "spx", sessionId: "ajena", label: "Zacarías" });
    expect(repo.listParticipants(LOCAL_USER_ID)).not.toContain("Zacarías");
  });

  it("total y paginación respetan los filtros", () => {
    const q = (extra: object) => repo.listSessions({ userId: LOCAL_USER_ID, ...extra } as any);
    expect(q({ page: 1, limit: 1, from: "2026-11-01T00:00:00.000Z" }).total).toBe(3);
    const p1 = q({ page: 1, limit: 1, from: "2026-11-01T00:00:00.000Z" });
    const p2 = q({ page: 2, limit: 1, from: "2026-11-01T00:00:00.000Z" });
    expect(p1.items.map((i) => i.id)).toEqual(["c"]);
    expect(p2.items.map((i) => i.id)).toEqual(["b"]);
    expect(p2.total).toBe(3);
    const pp = q({ page: 2, limit: 1, participant: "a" }); // Ana García, Hablante 1 no; Luis no -> "a" coincide con Ana y Hablante
    expect(pp.total).toBe(2);
    expect(pp.items).toHaveLength(1);
  });

  it("los filtros no devuelven sesiones de otro usuario", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    db.prepare(
      "INSERT INTO project_folders (id, user_id, name, technical_context, created_at, updated_at) VALUES ('f2', 'otro', 'Ajena', 'ctx', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')"
    ).run();
    insertSession(db, { id: "ajena", userId: "otro", occurredAt: "2026-11-10T12:00:00.000Z", projectFolderId: "f2" });
    insertSpeaker(db, { id: "spx", sessionId: "ajena", label: "Ana García" });
    expect(ids({ participant: "garcia" })).toEqual(["a"]);
    expect(ids({ from: "2026-11-10T00:00:00.000Z", to: "2026-11-10T23:59:59.999Z" })).toEqual(["a"]);
    expect(ids({ folderId: "f2" })).toEqual([]);
  });

  it("participant normaliza en ambos sentidos: consulta con tilde contra nombre sin tilde y mayúsculas", () => {
    insertSession(db, { id: "e", occurredAt: "2026-11-05T12:00:00.000Z" });
    insertSpeaker(db, { id: "spe", sessionId: "e", label: "Maria Lopez" });
    expect(ids({ participant: "María" })).toEqual(["e"]);
    expect(ids({ participant: "LÓPEZ" })).toEqual(["e"]);
  });

  it("to usa created_at como respaldo cuando no hay occurred_at", () => {
    expect(ids({ to: "2026-11-20T09:00:00.000Z" })).toEqual(["c", "b", "a"]);
    expect(ids({ to: "2026-11-20T08:59:59.999Z" })).toEqual(["b", "a"]);
  });
});
