import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { SqliteSpeakerRepository } from "../infrastructure/sqlite/SqliteSpeakerRepository.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { insertActionItem, insertMeetingSummary, insertSegment, insertSession, insertSpeaker, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository: búsqueda de texto", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;
  const ids = (q: string, extra: object = {}) =>
    repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, q, ...extra }).items.map((i) => i.id);

  function seed(id: string, content: string, opts: { speaker?: string; occurredAt?: string } = {}) {
    insertSession(db, { id, name: `Sesión ${id}`, occurredAt: opts.occurredAt ?? "2026-11-20T10:00:00.000Z", updatedAt: "2026-11-20T10:00:00.000Z" });
    insertSpeaker(db, { id: `sp-${id}`, sessionId: id, label: opts.speaker ?? "Hablante 1" });
    insertSegment(db, { id: `seg-${id}`, sessionId: id, speakerId: `sp-${id}`, startMs: 0, endMs: 5000, content });
  }

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    seed("a", "Hoy hablamos de la migración de la base de datos", { speaker: "Ana" });
    seed("b", "El presupuesto del trimestre sigue pendiente", { speaker: "Luis", occurredAt: "2026-11-21T10:00:00.000Z" });
    seed("c", "Migración y presupuesto: ambos temas, migración primero", { occurredAt: "2026-11-22T10:00:00.000Z" });
  });
  afterEach(() => db.close());

  it("encuentra sin importar tildes ni mayúsculas y devuelve fragmento con rangos sobre el texto original", () => {
    const { items } = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, q: "MIGRACION" });
    expect(items.map((i) => i.id).sort()).toEqual(["a", "c"]);
    const a = items.find((i) => i.id === "a")!;
    expect(a.snippet).not.toBeNull();
    const [from, to] = a.snippet!.ranges[0]!;
    expect(a.snippet!.text.slice(from, to)).toBe("migración");
  });

  it("renombrar un hablante reindexa la sesión: la búsqueda refleja el nuevo nombre", async () => {
    expect(ids("Ana")).toEqual(["a"]);
    await new SqliteSpeakerRepository(db).update(new Speaker({ id: "sp-a", sessionId: "a", label: "Ana", customName: "Zulema" }));
    expect(ids("Zulema")).toEqual(["a"]);
    expect(ids("Ana")).toEqual([]);
  });

  it("exige que aparezcan TODOS los términos (AND)", () => {
    expect(ids("migracion presupuesto")).toEqual(["c"]);
  });

  it("busca también en nombres de hablantes, resúmenes y puntos de acción", () => {
    insertMeetingSummary(db, { sessionId: "b", executiveSummary: "Se discutió la facturación electrónica." });
    insertActionItem(db, { id: "ai1", sessionId: "a", task: "Enviar la propuesta al cliente" });
    expect(ids("luis")).toEqual(["b"]);
    expect(ids("facturacion")).toEqual(["b"]);
    expect(ids("propuesta cliente")).toEqual(["a"]);
  });

  it("ordena por número de coincidencias y luego por fecha", () => {
    // "c" repite "migración" 2 veces; "a" una
    expect(ids("migracion")).toEqual(["c", "a"]);
    const items = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, q: "migracion" }).items;
    expect(items[0]!.matchCount).toBeGreaterThan(items[1]!.matchCount!);
  });

  it("ignora términos de menos de 2 letras (equivale a no buscar) y respeta la paginación y el total", () => {
    expect(ids("a")).toHaveLength(3);
    const page = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 1, q: "migracion" });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it("los comodines de LIKE se tratan como texto literal", () => {
    seed("d", "Subió un 100% el costo", { occurredAt: "2026-11-23T10:00:00.000Z" });
    seed("e", "Eran 100 pesos", { occurredAt: "2026-11-24T10:00:00.000Z" });
    expect(ids("100%")).toEqual(["d"]);
    expect(ids("100_")).toEqual([]);
  });

  it("reindexa de forma perezosa cuando el contenido cambia", () => {
    expect(ids("renegociacion")).toEqual([]);
    db.prepare("UPDATE transcription_segments SET content = 'Hubo una renegociación del contrato' WHERE id = 'seg-b'").run();
    db.prepare("UPDATE transcription_sessions SET updated_at = '2999-01-01T00:00:00.000Z' WHERE id = 'b'").run();
    expect(ids("renegociacion")).toEqual(["b"]);
  });

  it("solo busca en las sesiones del usuario", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    insertSpeaker(db, { id: "sp-ajena", sessionId: "ajena", label: "X" });
    insertSegment(db, { id: "seg-ajena", sessionId: "ajena", speakerId: "sp-ajena", startMs: 0, endMs: 1000, content: "migración secreta" });
    expect(ids("secreta")).toEqual([]);
  });
});
