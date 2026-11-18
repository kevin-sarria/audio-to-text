import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStartupRecovery } from "../pipeline.js";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteSessionRepository } from "../infrastructure/sqlite/SqliteSessionRepository.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import { LOCAL_USER_ID } from "../infrastructure/sqlite/migrations.js";
import type { DatabaseSync } from "node:sqlite";

describe("Pipeline Startup Recovery", () => {
  let db: DatabaseSync;
  let sessionRepo: SqliteSessionRepository;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    sessionRepo = new SqliteSessionRepository(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  it("sesión PROCESSING pasa a PENDING y se re-encola si el archivo existe", async () => {
    const sessionId = "session-proc-ok";
    const now = new Date();

    await sessionRepo.create(
      new TranscriptionSession({
        id: sessionId,
        userId: LOCAL_USER_ID,
        originalFileName: "audio.mp3",
        fileFormat: "mp3",
        fileSizeBytes: 1000n,
        storagePath: "raw/audio.mp3",
        audioExpiresAt: new Date(now.getTime() + 100000),
        isAudioPurged: false,
        status: SessionStatus.PROCESSING,
        createdAt: now,
        updatedAt: now
      })
    );

    const mockStorage = {
      exists: vi.fn().mockResolvedValue(true),
      getAbsolutePath: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      readStream: vi.fn()
    } as any;

    const mockQueue = {
      enqueuePreprocess: vi.fn().mockResolvedValue(undefined)
    } as any;

    const mockFailSession = {
      execute: vi.fn()
    } as any;

    await runStartupRecovery({
      sessionRepository: sessionRepo,
      storageService: mockStorage,
      jobQueue: mockQueue,
      failSession: mockFailSession
    });

    expect(mockQueue.enqueuePreprocess).toHaveBeenCalledWith({
      sessionId,
      inputPath: "raw/audio.mp3"
    });
    expect(mockFailSession.execute).not.toHaveBeenCalled();
  });

  it("sesión PENDING sin archivo en storage se marca como FAILED", async () => {
    const sessionId = "session-no-file";
    const now = new Date();

    await sessionRepo.create(
      new TranscriptionSession({
        id: sessionId,
        userId: LOCAL_USER_ID,
        originalFileName: "lost.mp3",
        fileFormat: "mp3",
        fileSizeBytes: 1000n,
        storagePath: "raw/lost.mp3",
        audioExpiresAt: new Date(now.getTime() + 100000),
        isAudioPurged: false,
        status: SessionStatus.PENDING,
        createdAt: now,
        updatedAt: now
      })
    );

    const mockStorage = {
      exists: vi.fn().mockResolvedValue(false)
    } as any;

    const mockQueue = {
      enqueuePreprocess: vi.fn()
    } as any;

    const mockFailSession = {
      execute: vi.fn().mockResolvedValue(undefined)
    } as any;

    await runStartupRecovery({
      sessionRepository: sessionRepo,
      storageService: mockStorage,
      jobQueue: mockQueue,
      failSession: mockFailSession
    });

    expect(mockQueue.enqueuePreprocess).not.toHaveBeenCalled();
    expect(mockFailSession.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        errorMessage: expect.stringContaining("ausente")
      })
    );
  });
});
