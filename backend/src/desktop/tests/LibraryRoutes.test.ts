import http from "node:http";
import express from "express";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { createLibraryRoutes } from "../http/routes/library.routes.js";
import { errorHandler } from "../../interfaces/http/middlewares/errorHandler.js";
import { insertSession, insertMeetingSummary, insertActionItem, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("library.routes", () => {
  let db: DatabaseSync;
  let server: http.Server;
  let base: string;
  let importCalls: string[];

  beforeEach(async () => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    importCalls = [];
    const importBotMeetings = {
      execute: (userId: string) => {
        importCalls.push(userId);
        return { imported: 2, alreadyImported: 1, failed: [], folderMissing: false, folder: "C:/salida" };
      }
    } as any;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { userId: LOCAL_USER_ID, email: "local@test" };
      next();
    });
    app.use(createLibraryRoutes({ importBotMeetings, libraryRepository: new SqliteLibraryRepository(db) }));
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });

  it("POST /library/import ejecuta el importador para el usuario autenticado", async () => {
    const res = await fetch(`${base}/library/import`, { method: "POST" });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { imported: 2, alreadyImported: 1, failed: [], folderMissing: false, folder: "C:/salida" } });
    expect(importCalls).toEqual([LOCAL_USER_ID]);
  });

  it("GET /library/sessions devuelve ítems y meta, aplica el filtro source y valida la consulta", async () => {
    insertSession(db, { id: "a1", createdAt: "2026-11-20T10:00:00.000Z" });
    insertSession(db, { id: "b1", source: "BOT", fileFormat: "bot", externalId: "x", occurredAt: "2026-11-21T10:00:00.000Z" });

    const all = (await (await fetch(`${base}/library/sessions`)).json()) as any;
    expect(all.success).toBe(true);
    expect(all.data.map((i: any) => i.id)).toEqual(["b1", "a1"]);
    expect(all.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });

    const bots = (await (await fetch(`${base}/library/sessions?source=BOT`)).json()) as any;
    expect(bots.data.map((i: any) => i.id)).toEqual(["b1"]);

    const bad = await fetch(`${base}/library/sessions?limit=0`);
    expect(bad.status).toBe(400);
    const bad2 = await fetch(`${base}/library/sessions?source=OTRO`);
    expect(bad2.status).toBe(400);
  });

  it("GET /library/sessions/:id/meeting-summary: resumen, null sin resumen y 404 si no existe", async () => {
    insertSession(db, { id: "s1", source: "BOT", fileFormat: "bot", externalId: "x1" });
    insertSession(db, { id: "s2" });
    insertMeetingSummary(db, { sessionId: "s1", executiveSummary: "Hola." });
    insertActionItem(db, { id: "ai1", sessionId: "s1", task: "Hacer algo" });

    const ok = (await (await fetch(`${base}/library/sessions/s1/meeting-summary`)).json()) as any;
    expect(ok.success).toBe(true);
    expect(ok.data.executiveSummary).toBe("Hola.");
    expect(ok.data.actionItems[0]).toMatchObject({ id: "ai1", task: "Hacer algo", done: false });

    const none = (await (await fetch(`${base}/library/sessions/s2/meeting-summary`)).json()) as any;
    expect(none).toEqual({ success: true, data: null });

    expect((await fetch(`${base}/library/sessions/no-existe/meeting-summary`)).status).toBe(404);
  });

  it("PATCH /library/action-items/:id marca como hecho, valida el cuerpo y responde 404 si no existe", async () => {
    insertSession(db, { id: "s1", source: "BOT", fileFormat: "bot", externalId: "x1" });
    insertActionItem(db, { id: "ai1", sessionId: "s1" });
    const patch = (id: string, body: unknown) =>
      fetch(`${base}/library/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

    const ok = await patch("ai1", { done: true });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).data).toMatchObject({ id: "ai1", done: true });

    expect((await patch("ai1", { done: "si" })).status).toBe(400);
    expect((await patch("no-existe", { done: true })).status).toBe(404);
  });

  it("GET /library/sessions?q= busca con fragmento y valida la longitud máxima", async () => {
    insertSession(db, { id: "s1", name: "Sesión s1" });
    const { insertSpeaker, insertSegment } = await import("./libraryTestUtils.js");
    insertSpeaker(db, { id: "sp1", sessionId: "s1", label: "Ana" });
    insertSegment(db, { id: "g1", sessionId: "s1", speakerId: "sp1", startMs: 0, endMs: 1000, content: "Hablamos de la migración" });

    const res = (await (await fetch(`${base}/library/sessions?q=migracion`)).json()) as any;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].snippet.text).toContain("migración");
    expect(res.data[0].matchCount).toBe(1);

    expect((await fetch(`${base}/library/sessions?q=${"x".repeat(201)}`)).status).toBe(400);
  });

  it("valida from/to como fechas ISO y expone GET /library/participants", async () => {
    expect((await fetch(`${base}/library/sessions?from=ayer`)).status).toBe(400);
    expect((await fetch(`${base}/library/sessions?to=no-es-fecha`)).status).toBe(400);

    insertSession(db, { id: "s1" });
    const { insertSpeaker } = await import("./libraryTestUtils.js");
    insertSpeaker(db, { id: "sp1", sessionId: "s1", label: "Ana" });
    const res = (await (await fetch(`${base}/library/participants`)).json()) as any;
    expect(res).toEqual({ success: true, data: ["Ana"] });
  });

  it("from/to/participant/folderId de la query string llegan al repositorio y filtran", async () => {
    db.prepare(
      "INSERT INTO project_folders (id, user_id, name, technical_context, created_at, updated_at) VALUES ('f1', ?, 'P', 'ctx', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')"
    ).run(LOCAL_USER_ID);
    const { insertSpeaker } = await import("./libraryTestUtils.js");
    insertSession(db, { id: "s1", occurredAt: "2026-11-10T12:00:00.000Z", projectFolderId: "f1" });
    insertSpeaker(db, { id: "sp1", sessionId: "s1", label: "Ana" });
    insertSession(db, { id: "s2", occurredAt: "2026-11-15T12:00:00.000Z" });
    insertSpeaker(db, { id: "sp2", sessionId: "s2", label: "Luis" });
    const get = async (qs: string) => ((await (await fetch(`${base}/library/sessions?${qs}`)).json()) as any);

    expect((await get("participant=luis")).data.map((i: any) => i.id)).toEqual(["s2"]);
    expect((await get("folderId=f1")).data.map((i: any) => i.id)).toEqual(["s1"]);
    expect((await get("from=2026-11-12T00:00:00.000Z")).data.map((i: any) => i.id)).toEqual(["s2"]);
    expect((await get("to=2026-11-12T00:00:00.000Z")).data.map((i: any) => i.id)).toEqual(["s1"]);
    expect((await get("participant=luis")).meta.total).toBe(1);
  });

  it("GET /library/action-items lista pendientes con meta.openTotal y valida la consulta; /owners lista responsables", async () => {
    insertSession(db, { id: "s1", name: "Reunión uno", source: "BOT", fileFormat: "bot", externalId: "x" });
    insertActionItem(db, { id: "ai1", sessionId: "s1", owner: "Luis" });
    insertActionItem(db, { id: "ai2", sessionId: "s1", position: 1, owner: "Ana", done: true });

    const open = (await (await fetch(`${base}/library/action-items`)).json()) as any;
    expect(open.data.map((i: any) => i.id)).toEqual(["ai1"]);
    expect(open.meta).toMatchObject({ total: 1, page: 1, limit: 20, openTotal: 1 });

    const all = (await (await fetch(`${base}/library/action-items?status=all&owner=ana`)).json()) as any;
    expect(all.data.map((i: any) => i.id)).toEqual(["ai2"]);

    const done = (await (await fetch(`${base}/library/action-items?status=done`)).json()) as any;
    expect(done.data.map((i: any) => i.id)).toEqual(["ai2"]);
    expect(done.meta.openTotal).toBe(1);

    const bySession = (await (await fetch(`${base}/library/action-items?status=all&sessionId=s1&limit=1&page=2`)).json()) as any;
    expect(bySession.data.map((i: any) => i.id)).toEqual(["ai2"]);
    expect(bySession.meta).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });

    expect((await fetch(`${base}/library/action-items?status=otro`)).status).toBe(400);

    const owners = (await (await fetch(`${base}/library/action-items/owners`)).json()) as any;
    expect(owners).toEqual({ success: true, data: ["Ana", "Luis"] });
  });
});
