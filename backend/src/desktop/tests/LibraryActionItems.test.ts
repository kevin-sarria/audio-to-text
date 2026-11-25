import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { insertActionItem, insertSession, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository.listActionItems", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;
  const list = (extra: object = {}) =>
    repo.listActionItems({ userId: LOCAL_USER_ID, page: 1, limit: 50, status: "open", ...extra });

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    insertSession(db, { id: "viejo", name: "Reunión vieja", source: "BOT", fileFormat: "bot", externalId: "v", occurredAt: "2026-11-10T10:00:00.000Z" });
    insertSession(db, { id: "nuevo", name: "Reunión nueva", source: "BOT", fileFormat: "bot", externalId: "n", occurredAt: "2026-11-20T10:00:00.000Z" });
    insertActionItem(db, { id: "v0", sessionId: "viejo", position: 0, task: "Vieja 1", owner: "Luis" });
    insertActionItem(db, { id: "v1", sessionId: "viejo", position: 1, task: "Vieja 2 hecha", owner: "Ana García", done: true });
    insertActionItem(db, { id: "n0", sessionId: "nuevo", position: 0, task: "Nueva 1", owner: "Ana García" });
    insertActionItem(db, { id: "n1", sessionId: "nuevo", position: 1, task: "Nueva 2", owner: null });
  });
  afterEach(() => db.close());

  it("lista por defecto los pendientes, de la reunión más reciente a la más antigua y por posición", () => {
    const { items, total, openTotal } = list();
    expect(items.map((i) => i.id)).toEqual(["n0", "n1", "v0"]);
    expect(total).toBe(3);
    expect(openTotal).toBe(3);
    expect(items[0]).toMatchObject({ sessionId: "nuevo", sessionTitle: "Reunión nueva", occurredAt: "2026-11-20T10:00:00.000Z", done: false });
  });

  it("filtra por estado: done y all, con su total", () => {
    const done = list({ status: "done" });
    expect(done.items.map((i) => i.id)).toEqual(["v1"]);
    expect(done.total).toBe(1);
    expect(done.items[0]).toMatchObject({ sessionTitle: "Reunión vieja", occurredAt: "2026-11-10T10:00:00.000Z", done: true });
    const all = list({ status: "all" });
    // orden: reunión más reciente primero y, dentro de cada una, por posición
    expect(all.items.map((i) => i.id)).toEqual(["n0", "n1", "v0", "v1"]);
    expect(all.total).toBe(4);
  });

  it("openTotal cuenta los pendientes del usuario sin importar los filtros", () => {
    expect(list({ status: "done" }).openTotal).toBe(3);
    expect(list({ owner: "luis" }).openTotal).toBe(3);
    expect(list({ sessionId: "viejo" }).openTotal).toBe(3);
  });

  it("filtra por responsable (parte del nombre, sin tildes) y por sesión", () => {
    expect(list({ owner: "garcia" }).items.map((i) => i.id)).toEqual(["n0"]);
    expect(list({ owner: "GARCÍA", status: "all" }).items.map((i) => i.id)).toEqual(["n0", "v1"]);
    expect(list({ owner: "  luis  " }).items.map((i) => i.id)).toEqual(["v0"]);
    expect(list({ owner: "nadie" }).items).toEqual([]);
    expect(list({ owner: "nadie" }).total).toBe(0);
    expect(list({ sessionId: "viejo" }).items.map((i) => i.id)).toEqual(["v0"]);
    expect(list({ sessionId: "viejo", status: "all" }).items.map((i) => i.id)).toEqual(["v0", "v1"]);
    expect(list({ sessionId: "inexistente" }).items).toEqual([]);
  });

  it("pagina con el total sin paginar", () => {
    const p = list({ page: 2, limit: 2 });
    expect(p.items.map((i) => i.id)).toEqual(["v0"]);
    expect(p.total).toBe(3);
    expect(list({ page: 1, limit: 2 }).items.map((i) => i.id)).toEqual(["n0", "n1"]);
  });

  it("listOwners devuelve responsables distintos y ordenados", () => {
    expect(repo.listOwners(LOCAL_USER_ID)).toEqual(["Ana García", "Luis"]);
  });

  it("solo incluye puntos de acción de sesiones del usuario, con cualquier filtro", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    insertActionItem(db, { id: "x0", sessionId: "ajena", owner: "Zacarías" });
    insertActionItem(db, { id: "x1", sessionId: "ajena", position: 1, owner: "Zacarías", done: true });
    for (const extra of [{}, { status: "all" }, { status: "done" }, { owner: "zacarias" }, { owner: "zacarias", status: "all" }, { sessionId: "ajena", status: "all" }]) {
      const r = list(extra);
      expect(r.items.map((i) => i.id)).not.toContain("x0");
      expect(r.items.map((i) => i.id)).not.toContain("x1");
    }
    expect(list({ status: "all" }).total).toBe(4);
    expect(list({ owner: "zacarias", status: "all" }).total).toBe(0);
    expect(repo.listOwners(LOCAL_USER_ID)).not.toContain("Zacarías");
    expect(list().openTotal).toBe(3);
  });
});
