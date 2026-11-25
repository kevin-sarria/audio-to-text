import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  BOT_MEETING_SCHEMA_VERSION,
  BotMeetingDeliverySchema,
  type BotMeetingDelivery,
  type ImportBotMeetingsResultDto
} from "@audio-to-text/shared";
import { LOCAL_USER_ID } from "../infrastructure/sqlite/migrations.js";
import { buildSegmentTimings, computeDurationSeconds, formatMeetingTitle } from "./botMeetingMapping.js";

const FILE_PATTERN = /^reunion_.+\.json$/;

export class ImportBotMeetings {
  constructor(
    private db: DatabaseSync,
    private resolveFolder: () => string,
    private now: () => Date = () => new Date(),
    private newId: () => string = () => crypto.randomUUID()
  ) {}

  public execute(userId: string = LOCAL_USER_ID): ImportBotMeetingsResultDto {
    const folder = this.resolveFolder();
    const result: ImportBotMeetingsResultDto = { imported: 0, alreadyImported: 0, failed: [], folderMissing: false, folder };

    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      result.folderMissing = true;
      return result;
    }

    const files = fs.readdirSync(folder).filter((f) => FILE_PATTERN.test(f)).sort();
    for (const file of files) {
      try {
        const outcome = this.importFile(path.join(folder, file), userId);
        if (outcome === "imported") result.imported++;
        else result.alreadyImported++;
      } catch (err) {
        result.failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }

  private importFile(filePath: string, userId: string): "imported" | "exists" {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      throw new Error("JSON inválido o archivo ilegible");
    }

    const version = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (version !== BOT_MEETING_SCHEMA_VERSION) {
      throw new Error(`Versión de esquema no soportada (schemaVersion ${String(version)})`);
    }

    const check = BotMeetingDeliverySchema.safeParse(parsed);
    if (!check.success) {
      const detail = check.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`)
        .join("; ");
      throw new Error(`Archivo no válido: ${detail}`);
    }

    const delivery = check.data;
    const exists = this.db
      .prepare("SELECT 1 AS x FROM transcription_sessions WHERE source = 'BOT' AND external_id = ?")
      .get(delivery.sessionId);
    if (exists) return "exists";
    const excluded = this.db
      .prepare("SELECT 1 AS x FROM bot_import_exclusions WHERE external_id = ?")
      .get(delivery.sessionId);
    if (excluded) return "exists";

    this.insert(delivery, userId);
    return "imported";
  }

  /** Crea sesión, hablantes, segmentos, resumen y puntos de acción en una sola transacción. */
  private insert(d: BotMeetingDelivery, userId: string): void {
    const nowIso = this.now().toISOString();
    const sessionId = this.newId();
    const timings = buildSegmentTimings(d.utterances);
    const lastEndMs = timings[timings.length - 1]!.endMs;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO transcription_sessions (
            id, user_id, guest_token_hash, project_folder_id, original_file_name, file_format,
            duration_seconds, file_size_bytes, storage_path, audio_expires_at, is_audio_purged,
            status, source_language, error_message, created_at, updated_at,
            source, external_id, occurred_at, source_meta
          ) VALUES (?, ?, NULL, NULL, ?, 'bot', ?, 0, NULL, ?, 1, 'COMPLETED', ?, NULL, ?, ?, 'BOT', ?, ?, ?)`
        )
        .run(
          sessionId,
          userId,
          formatMeetingTitle(d.platform, d.startedAt),
          computeDurationSeconds(d, lastEndMs),
          nowIso,
          d.summary.language,
          nowIso,
          nowIso,
          d.sessionId,
          new Date(d.startedAt).toISOString(),
          JSON.stringify({
            platform: d.platform,
            meetingUrl: d.meetingUrl,
            meetingType: d.meetingType,
            classificationReason: d.classificationReason
          })
        );

      const speakerIds = new Map<string, string>();
      for (const u of d.utterances) {
        if (speakerIds.has(u.speakerName)) continue;
        const id = this.newId();
        speakerIds.set(u.speakerName, id);
        this.db
          .prepare("INSERT INTO speakers (id, session_id, label, custom_name) VALUES (?, ?, ?, NULL)")
          .run(id, sessionId, u.speakerName);
      }

      const insertSegment = this.db.prepare(
        `INSERT INTO transcription_segments (id, session_id, speaker_id, start_time_ms, end_time_ms, content, confidence_score)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      );
      d.utterances.forEach((u, i) => {
        const t = timings[i]!;
        insertSegment.run(this.newId(), sessionId, speakerIds.get(u.speakerName)!, t.startMs, t.endMs, u.text);
      });

      const s = d.summary;
      this.db
        .prepare(
          `INSERT INTO meeting_summaries (id, session_id, language, executive_summary, note, generated_at, topics, decisions, open_questions, participants, chapters)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          this.newId(),
          sessionId,
          s.language,
          s.executiveSummary,
          s.note ?? null,
          s.generatedAt,
          JSON.stringify(s.topics),
          JSON.stringify(s.decisions),
          JSON.stringify(s.openQuestions),
          JSON.stringify(s.participants),
          JSON.stringify(s.chapters)
        );

      const insertItem = this.db.prepare(
        `INSERT INTO action_items (id, session_id, position, task, owner, due_date, evidence, done, done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`
      );
      s.actionItems.forEach((item, position) => {
        insertItem.run(this.newId(), sessionId, position, item.task, item.owner ?? null, item.dueDate ?? null, item.evidence);
      });

      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw new Error(`Error al guardar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
