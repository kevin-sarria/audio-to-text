import { describe, it, expect, vi, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { AnalysisGenerationMetaDto } from "@audio-to-text/shared";
import { openSqliteDatabase } from "../../desktop/infrastructure/sqlite/db.js";
import { runMigrations } from "../../desktop/infrastructure/sqlite/migrations.js";
import { SqliteMeetingAnalysisRepository } from "../../desktop/infrastructure/sqlite/SqliteMeetingAnalysisRepository.js";
import { SqliteSessionRepository } from "../../desktop/infrastructure/sqlite/SqliteSessionRepository.js";
import { SqliteProjectFolderRepository } from "../../desktop/infrastructure/sqlite/SqliteProjectFolderRepository.js";
import { MeetingAnalysis } from "../../domain/entities/MeetingAnalysis.js";
import { ProjectFolder } from "../../domain/entities/ProjectFolder.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import { GenerateMeetingAnalysis } from "../../application/use-cases/meetingAnalysis/GenerateMeetingAnalysis.js";
import { IMeetingAnalysisService } from "../../domain/services/IMeetingAnalysisService.js";
import { IProjectFolderRepository } from "../../domain/repositories/IProjectFolderRepository.js";

const meta: AnalysisGenerationMetaDto = {
  provider: "custom-deepseek-5876",
  providerLabel: "DeepSeek",
  model: "deepseek-chat",
  profileId: "diamante",
  profileName: "DIAMANTE (Limpieza Inteligente)",
  generatedAt: "2026-11-20T15:00:00.000Z",
  durationMs: 41000,
  attempts: 2,
  usedFallback: false,
  partialAnalysis: false,
  validationErrors: [],
  validationWarnings: ["La estimación del issue [PANEL-1] se desvía"]
};

function session(id: string, projectFolderId: string | null = null): TranscriptionSession {
  return new TranscriptionSession({
    id,
    userId: null,
    originalFileName: "reunion.mp3",
    fileFormat: "mp3",
    fileSizeBytes: 1024n,
    audioExpiresAt: new Date(Date.now() + 86400000),
    isAudioPurged: false,
    status: SessionStatus.COMPLETED,
    projectFolderId,
    createdAt: new Date(),
    updatedAt: new Date(),
    segments: [
      new TranscriptionSegment({ id: `${id}-seg`, sessionId: id, speakerId: "sp", startTimeMs: 0, endTimeMs: 1000, content: "Hola" })
    ]
  });
}

function folder(id: string, profileId: string | null): ProjectFolder {
  return new ProjectFolder({
    id,
    userId: null,
    name: "Proyecto",
    technicalContext: "Contexto",
    profileId,
    createdAt: new Date(),
    updatedAt: new Date()
  });
}

describe("Persistencia SQLite de generationMeta y profileId", () => {
  let db: DatabaseSync;
  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  it("guarda y recupera generationMeta del análisis (y null en análisis antiguos)", async () => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    new SqliteSessionRepository(db).create(session("s-1"));
    const repo = new SqliteMeetingAnalysisRepository(db);
    const base = {
      sessionId: "s-1",
      summary: "Resumen",
      keyDecisions: [],
      topicsDiscussed: [],
      issues: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const saved = await repo.save(new MeetingAnalysis({ id: "a-1", ...base, generationMeta: meta }));
    expect(saved.generationMeta).toEqual(meta);

    saved.update({ generationMeta: { ...meta, attempts: 1, validationWarnings: [] } });
    const updated = await repo.save(saved);
    expect(updated.generationMeta?.attempts).toBe(1);

    db.prepare("UPDATE meeting_analyses SET generation_meta = NULL WHERE session_id = 's-1'").run();
    const legacy = await repo.findBySessionId("s-1");
    expect(legacy?.generationMeta ?? null).toBeNull();
  });

  it("guarda y recupera profileId de la carpeta de proyecto", async () => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    const repo = new SqliteProjectFolderRepository(db);
    await repo.create(folder("f-1", "diamante"));
    expect((await repo.findById("f-1"))?.profileId).toBe("diamante");

    const f = (await repo.findById("f-1"))!;
    f.update({ profileId: "generic" });
    await repo.update(f);
    expect((await repo.findById("f-1"))?.profileId).toBe("generic");
  });

  it("la migración 5 marca como diamante solo las carpetas existentes de DIAMANTE", () => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    // Volver al estado de la versión 4 (sin las columnas nuevas) e insertar carpetas antiguas
    db.exec("ALTER TABLE meeting_analyses DROP COLUMN generation_meta");
    db.exec("ALTER TABLE project_folders DROP COLUMN profile_id");
    db.exec("PRAGMA user_version = 4");
    const insert = db.prepare(
      "INSERT INTO project_folders (id, name, technical_context, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    const now = new Date().toISOString();
    insert.run("f-dia", "Limpieza", "PROYECTO DIAMANTE: backend .NET", now, now);
    insert.run("f-name", "Diamante panel", "React", now, now);
    insert.run("f-otro", "Celestial", "Tienda de perfumes", now, now);

    runMigrations(db);

    const rows = db.prepare("SELECT id, profile_id FROM project_folders ORDER BY id").all() as Array<{ id: string; profile_id: string | null }>;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.profile_id]));
    expect(byId["f-dia"]).toBe("diamante");
    expect(byId["f-name"]).toBe("diamante");
    expect(byId["f-otro"]).toBeNull();
  });
});

describe("GenerateMeetingAnalysis: resolución del perfil y guardado de generationMeta", () => {
  function setup(folderProfile: string | null, sessionFolderId: string | null) {
    const sessionRepo = {
      findById: vi.fn().mockResolvedValue(session("s-1", sessionFolderId)),
      findByUserId: vi.fn(),
      findExpiredPendingPurge: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    };
    const analysisRepo = {
      findBySessionId: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockImplementation(async (a: MeetingAnalysis) => a),
      deleteBySessionId: vi.fn()
    };
    const service: IMeetingAnalysisService = {
      generateAnalysis: vi.fn().mockResolvedValue({
        summary: "Resumen",
        keyDecisions: [],
        topicsDiscussed: [],
        issues: [],
        generationMeta: meta
      })
    };
    const folderRepo: IProjectFolderRepository = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(folder("f-1", folderProfile)),
      findAll: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    };
    const useCase = new GenerateMeetingAnalysis(sessionRepo as any, analysisRepo as any, service, folderRepo);
    return { useCase, service, analysisRepo };
  }

  const profileSent = (service: IMeetingAnalysisService) =>
    (vi.mocked(service.generateAnalysis).mock.calls[0]?.[2] as any)?.profileId;

  it("el profileId del request tiene prioridad sobre el de la carpeta", async () => {
    const { useCase, service } = setup("diamante", "f-1");
    await useCase.execute({ sessionId: "s-1", profileId: "generic" });
    expect(profileSent(service)).toBe("generic");
  });

  it("sin profileId en el request usa el de la carpeta vinculada", async () => {
    const { useCase, service } = setup("diamante", "f-1");
    await useCase.execute({ sessionId: "s-1" });
    expect(profileSent(service)).toBe("diamante");
  });

  it("sin request ni carpeta usa el perfil genérico", async () => {
    const { useCase, service } = setup(null, null);
    await useCase.execute({ sessionId: "s-1" });
    expect(profileSent(service)).toBe("generic");
  });

  it("guarda el generationMeta devuelto por el servicio", async () => {
    const { useCase } = setup(null, null);
    const result = await useCase.execute({ sessionId: "s-1" });
    expect(result.generationMeta).toEqual(meta);
  });
});
