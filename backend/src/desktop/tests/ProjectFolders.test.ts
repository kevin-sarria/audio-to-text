import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { LOCAL_USER_ID } from "../infrastructure/sqlite/migrations.js";
import { SqliteProjectFolderRepository } from "../infrastructure/sqlite/SqliteProjectFolderRepository.js";
import { SqliteSessionRepository } from "../infrastructure/sqlite/SqliteSessionRepository.js";
import { SqliteMeetingAnalysisRepository } from "../infrastructure/sqlite/SqliteMeetingAnalysisRepository.js";
import { ProjectFolder } from "../../domain/entities/ProjectFolder.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import { MeetingAnalysis } from "../../domain/entities/MeetingAnalysis.js";
import { UpdateMeetingAnalysisTitle } from "../../application/use-cases/meetingAnalysis/UpdateMeetingAnalysisTitle.js";
import { LinkSessionToProjectFolder } from "../../application/use-cases/transcription/LinkSessionToProjectFolder.js";

describe("ProjectFolders & Issues History Renaming", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: any;
  let folderRepo: SqliteProjectFolderRepository;
  let sessionRepo: SqliteSessionRepository;
  let analysisRepo: SqliteMeetingAnalysisRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio2text-folder-test-"));
    dbPath = path.join(tmpDir, "test.db");
    db = openSqliteDatabase({ dbPath });
    folderRepo = new SqliteProjectFolderRepository(db);
    sessionRepo = new SqliteSessionRepository(db);
    analysisRepo = new SqliteMeetingAnalysisRepository(db);
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("crea, lista, actualiza y elimina una carpeta de proyecto", async () => {
    const folder = new ProjectFolder({
      id: "folder-1",
      userId: LOCAL_USER_ID,
      name: "Proyecto Diamante",
      description: "Servicios de limpieza",
      technicalContext: "Stack .NET 8 y React 18",
      defaultProvider: "google-account",
      defaultModel: "gemini-2.5-pro",
      customApiKey: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const created = await folderRepo.create(folder);
    expect(created.id).toBe("folder-1");
    expect(created.name).toBe("Proyecto Diamante");

    const all = await folderRepo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.technicalContext).toBe("Stack .NET 8 y React 18");

    created.update({ name: "Proyecto Diamante V2" });
    const updated = await folderRepo.update(created);
    expect(updated.name).toBe("Proyecto Diamante V2");

    await folderRepo.delete("folder-1");
    const afterDelete = await folderRepo.findAll();
    expect(afterDelete).toHaveLength(0);
  });

  it("permite vincular y desvincular una sesión a una carpeta de proyecto", async () => {
    const folder = new ProjectFolder({
      id: "folder-abc",
      userId: LOCAL_USER_ID,
      name: "Carpeta Test",
      technicalContext: "Contexto",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await folderRepo.create(folder);

    const session = new TranscriptionSession({
      id: "sess-link-1",
      userId: LOCAL_USER_ID,
      originalFileName: "reunion.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1024n,
      audioExpiresAt: new Date(Date.now() + 10000),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await sessionRepo.create(session);

    const linkUseCase = new LinkSessionToProjectFolder(sessionRepo);
    const linked = await linkUseCase.execute({
      sessionId: "sess-link-1",
      userId: LOCAL_USER_ID,
      projectFolderId: "folder-abc"
    });

    expect(linked.projectFolderId).toBe("folder-abc");

    const fetched = await sessionRepo.findById("sess-link-1");
    expect(fetched?.projectFolderId).toBe("folder-abc");

    // Desvincular
    const unlinked = await linkUseCase.execute({
      sessionId: "sess-link-1",
      userId: LOCAL_USER_ID,
      projectFolderId: null
    });
    expect(unlinked.projectFolderId).toBeNull();
  });

  it("permite guardar y renombrar el título de un análisis de reunión", async () => {
    const session = new TranscriptionSession({
      id: "sess-title-1",
      userId: LOCAL_USER_ID,
      originalFileName: "daily.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1024n,
      audioExpiresAt: new Date(Date.now() + 10000),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await sessionRepo.create(session);

    const analysis = new MeetingAnalysis({
      id: "analysis-1",
      sessionId: "sess-title-1",
      title: "Título Inicial",
      summary: "Resumen inicial",
      keyDecisions: [],
      topicsDiscussed: [],
      issues: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await analysisRepo.save(analysis);

    const updateTitleUseCase = new UpdateMeetingAnalysisTitle(sessionRepo, analysisRepo);
    const updated = await updateTitleUseCase.execute({
      sessionId: "sess-title-1",
      userId: LOCAL_USER_ID,
      title: "Sprint 14 - API Diamante Refactor"
    });

    expect(updated.title).toBe("Sprint 14 - API Diamante Refactor");

    const saved = await analysisRepo.findBySessionId("sess-title-1");
    expect(saved?.title).toBe("Sprint 14 - API Diamante Refactor");
  });
});
