import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteSessionRepository } from "../infrastructure/sqlite/SqliteSessionRepository.js";
import { ImportBotMeetings } from "../library/ImportBotMeetings.js";
import { makeDelivery } from "../../tests/helpers/botMeetingFixtures.js";

describe("ImportBotMeetings", () => {
  let db: DatabaseSync;
  let dir: string;
  const NOW = new Date("2026-11-26T09:00:00.000Z");
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  const importer = () => new ImportBotMeetings(db, () => dir, () => NOW);
  const write = (name: string, content: unknown) =>
    fs.writeFileSync(path.join(dir, name), typeof content === "string" ? content : JSON.stringify(content), "utf-8");

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-bot-"));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("importa una reunión con todas las columnas obligatorias de una sesión sin audio", () => {
    write("reunion_bot-session-1001.json", makeDelivery());

    const result = importer().execute();

    expect(result).toMatchObject({ imported: 1, alreadyImported: 0, failed: [], folderMissing: false });
    const s = db.prepare("SELECT * FROM transcription_sessions WHERE source = 'BOT'").get() as any;
    expect(s).toMatchObject({
      external_id: "bot-session-1001",
      file_format: "bot",
      file_size_bytes: 0,
      storage_path: null,
      is_audio_purged: 1,
      status: "COMPLETED",
      source_language: "es",
      duration_seconds: 1800,
      occurred_at: "2026-11-25T14:00:00.000Z",
      created_at: NOW.toISOString(),
      audio_expires_at: NOW.toISOString()
    });
    expect(s.original_file_name.startsWith("Reunión Google Meet ")).toBe(true);
    expect(JSON.parse(s.source_meta)).toMatchObject({ platform: "GOOGLE_MEET", meetingType: "INTERNAL" });

    const speakers = db.prepare("SELECT label FROM speakers WHERE session_id = ? ORDER BY label").all(s.id) as any[];
    expect(speakers.map((x) => x.label)).toEqual(["Ana", "Luis"]);

    const segs = db.prepare("SELECT start_time_ms, end_time_ms, content FROM transcription_segments WHERE session_id = ? ORDER BY start_time_ms").all(s.id) as any[];
    expect(segs.map((x) => [x.start_time_ms, x.end_time_ms])).toEqual([[0, 12000], [12000, 30000], [30000, 32800]]);
    expect(segs[0].content).toContain("migrar la base de datos");

    const summary = db.prepare("SELECT * FROM meeting_summaries WHERE session_id = ?").get(s.id) as any;
    expect(summary.executive_summary).toContain("migrar");
    expect(JSON.parse(summary.chapters)).toEqual([{ title: "Migración", startSec: 0, endSec: 30 }]);

    const items = db.prepare("SELECT position, task, owner, due_date, done FROM action_items WHERE session_id = ? ORDER BY position").all(s.id) as any[];
    expect(items).toEqual([
      { position: 0, task: "Preparar el script de migración", owner: "Luis", due_date: "jueves", done: 0 },
      { position: 1, task: "Definir quién aprueba el presupuesto", owner: null, due_date: null, done: 0 }
    ]);
  });

  it("no duplica al reimportar y no pisa el estado done de los puntos de acción", () => {
    write("reunion_bot-session-1001.json", makeDelivery());
    importer().execute();
    db.prepare("UPDATE action_items SET done = 1, done_at = '2026-11-26T10:00:00.000Z' WHERE position = 0").run();

    const second = importer().execute();

    expect(second).toMatchObject({ imported: 0, alreadyImported: 1, failed: [] });
    expect(count("SELECT COUNT(*) AS c FROM transcription_sessions WHERE source = 'BOT'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM action_items WHERE done = 1")).toBe(1);
  });

  it("una reunión borrada no se reimporta, y otra no borrada sigue importándose", async () => {
    write("reunion_a.json", makeDelivery({ sessionId: "bot-a" }));
    write("reunion_b.json", makeDelivery({ sessionId: "bot-b" }));
    expect(importer().execute().imported).toBe(2);

    const idA = (db.prepare("SELECT id FROM transcription_sessions WHERE external_id = 'bot-a'").get() as { id: string }).id;
    await new SqliteSessionRepository(db).delete(idA);
    expect(count("SELECT COUNT(*) AS c FROM transcription_sessions WHERE source = 'BOT'")).toBe(1);

    const again = importer().execute();
    expect(again.imported).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM transcription_sessions WHERE external_id = 'bot-a'")).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM transcription_sessions WHERE external_id = 'bot-b'")).toBe(1);

    // una reunión nueva posterior sí se importa
    write("reunion_c.json", makeDelivery({ sessionId: "bot-c" }));
    expect(importer().execute().imported).toBe(1);
  });

  it("normaliza occurred_at a ISO UTC con milisegundos", () => {
    write("reunion_tz.json", makeDelivery({ sessionId: "bot-tz", startedAt: "2026-11-25T09:00:00-05:00" }));
    importer().execute();
    const row = db.prepare("SELECT occurred_at FROM transcription_sessions WHERE external_id = 'bot-tz'").get() as any;
    expect(row.occurred_at).toBe("2026-11-25T14:00:00.000Z");
  });

  it("ignora los .tmp y los archivos que no son reunion_*.json", () => {
    write("reunion_a.json.tmp", makeDelivery());
    write("notas.json", makeDelivery());
    write("Transcripcion_x.docx", "binario");

    const result = importer().execute();

    expect(result).toMatchObject({ imported: 0, alreadyImported: 0, failed: [] });
  });

  it("un archivo malo no frena a los demás y se informa su motivo", () => {
    write("reunion_ok.json", makeDelivery({ sessionId: "ok-1" }));
    write("reunion_roto.json", "{ esto no es json");
    write("reunion_v2.json", { ...makeDelivery({ sessionId: "v2" }), schemaVersion: 2 });
    const { summary: _s, ...sinResumen } = makeDelivery({ sessionId: "sin-resumen" });
    write("reunion_sinresumen.json", sinResumen);

    const result = importer().execute();

    expect(result.imported).toBe(1);
    const byFile = Object.fromEntries(result.failed.map((f) => [f.file, f.reason]));
    expect(byFile["reunion_roto.json"]).toContain("JSON inválido");
    expect(byFile["reunion_v2.json"]).toContain("schemaVersion 2");
    expect(byFile["reunion_sinresumen.json"]).toContain("Archivo no válido");
    expect(count("SELECT COUNT(*) AS c FROM transcription_sessions WHERE source = 'BOT'")).toBe(1);
  });

  it("si falla al guardar, revierte todo: no queda nada a medias y se puede reintentar", () => {
    write("reunion_x.json", makeDelivery());
    db.exec("CREATE TRIGGER fail_summary BEFORE INSERT ON meeting_summaries BEGIN SELECT RAISE(ABORT, 'boom'); END");

    const result = importer().execute();

    expect(result.imported).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toContain("boom");
    for (const table of ["transcription_sessions", "speakers", "transcription_segments", "action_items"]) {
      expect(count(`SELECT COUNT(*) AS c FROM ${table}`)).toBe(0);
    }

    db.exec("DROP TRIGGER fail_summary");
    expect(importer().execute().imported).toBe(1);
  });

  it("nunca modifica ni borra los archivos de origen", () => {
    write("reunion_x.json", makeDelivery());
    const file = path.join(dir, "reunion_x.json");
    const before = fs.readFileSync(file, "utf-8");
    const mtime = fs.statSync(file).mtimeMs;

    importer().execute();

    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
  });

  it("si la carpeta no existe devuelve folderMissing sin lanzar error", () => {
    const missing = path.join(dir, "no-existe");
    const result = new ImportBotMeetings(db, () => missing, () => NOW).execute();
    expect(result).toEqual({ imported: 0, alreadyImported: 0, failed: [], folderMissing: true, folder: missing });
  });
});
