import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteSessionRepository } from "../infrastructure/sqlite/SqliteSessionRepository.js";
import { SqliteSpeakerRepository } from "../infrastructure/sqlite/SqliteSpeakerRepository.js";
import { SqliteSegmentRepository } from "../infrastructure/sqlite/SqliteSegmentRepository.js";
import { SqliteTranslationRepository } from "../infrastructure/sqlite/SqliteTranslationRepository.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";
import { Translation } from "../../domain/entities/Translation.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import { LOCAL_USER_ID } from "../infrastructure/sqlite/migrations.js";
import type { DatabaseSync } from "node:sqlite";

describe("SqliteRepositories", () => {
  let db: DatabaseSync;
  let sessionRepo: SqliteSessionRepository;
  let speakerRepo: SqliteSpeakerRepository;
  let segmentRepo: SqliteSegmentRepository;
  let translationRepo: SqliteTranslationRepository;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    sessionRepo = new SqliteSessionRepository(db);
    speakerRepo = new SqliteSpeakerRepository(db);
    segmentRepo = new SqliteSegmentRepository(db);
    translationRepo = new SqliteTranslationRepository(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  it("CRUD de sesión, speakers, segmentos y traducciones", async () => {
    const sessionId = "session-1";
    const now = new Date();

    const session = new TranscriptionSession({
      id: sessionId,
      userId: LOCAL_USER_ID,
      originalFileName: "test.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1024n,
      audioExpiresAt: new Date(now.getTime() + 100000),
      isAudioPurged: false,
      status: SessionStatus.PENDING,
      createdAt: now,
      updatedAt: now
    });

    await sessionRepo.create(session);

    const speaker = new Speaker({
      id: "spk-1",
      sessionId,
      label: "Hablante 1",
      customName: "Carlos"
    });
    await speakerRepo.create(speaker);

    const segment = new TranscriptionSegment({
      id: "seg-1",
      sessionId,
      speakerId: "spk-1",
      startTimeMs: 100,
      endTimeMs: 500,
      content: "Hola mundo"
    });
    await segmentRepo.create(segment);

    const translation = new Translation({
      id: "trans-1",
      sessionId,
      targetLanguage: "en",
      translatedText: "Hello world",
      createdAt: now
    });
    await translationRepo.create(translation);

    const loaded = await sessionRepo.findById(sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(sessionId);
    expect(loaded!.speakers.length).toBe(1);
    expect(loaded!.speakers[0]!.customName).toBe("Carlos");
    expect(loaded!.segments.length).toBe(1);
    expect(loaded!.segments[0]!.content).toBe("Hola mundo");
    expect(loaded!.translations.length).toBe(1);
    expect(loaded!.translations[0]!.translatedText).toBe("Hello world");
  });

  it("paginación en findByUserId", async () => {
    const now = new Date();
    for (let i = 1; i <= 5; i++) {
      await sessionRepo.create(
        new TranscriptionSession({
          id: `session-page-${i}`,
          userId: LOCAL_USER_ID,
          originalFileName: `file-${i}.mp3`,
          fileFormat: "mp3",
          fileSizeBytes: 100n,
          audioExpiresAt: new Date(now.getTime() + 100000),
          isAudioPurged: false,
          status: SessionStatus.COMPLETED,
          createdAt: new Date(now.getTime() + i * 1000),
          updatedAt: new Date(now.getTime() + i * 1000)
        })
      );
    }

    const page1 = await sessionRepo.findByUserId(LOCAL_USER_ID, 0, 2);
    expect(page1.total).toBe(5);
    expect(page1.sessions.length).toBe(2);
    expect(page1.sessions[0]!.id).toBe("session-page-5"); // desc

    const page2 = await sessionRepo.findByUserId(LOCAL_USER_ID, 2, 2);
    expect(page2.sessions.length).toBe(2);
    expect(page2.sessions[0]!.id).toBe("session-page-3");
  });

  it("findExpiredPendingPurge solo devuelve expirados y no purgados", async () => {
    const past = new Date(Date.now() - 50000);
    const future = new Date(Date.now() + 50000);

    // 1. Expirada y no purgada
    await sessionRepo.create(
      new TranscriptionSession({
        id: "exp-1",
        userId: LOCAL_USER_ID,
        originalFileName: "exp.mp3",
        fileFormat: "mp3",
        fileSizeBytes: 100n,
        audioExpiresAt: past,
        isAudioPurged: false,
        status: SessionStatus.COMPLETED,
        createdAt: past,
        updatedAt: past
      })
    );

    // 2. Expirada pero ya purgada
    await sessionRepo.create(
      new TranscriptionSession({
        id: "exp-2",
        userId: LOCAL_USER_ID,
        originalFileName: "exp2.mp3",
        fileFormat: "mp3",
        fileSizeBytes: 100n,
        audioExpiresAt: past,
        isAudioPurged: true,
        status: SessionStatus.COMPLETED,
        createdAt: past,
        updatedAt: past
      })
    );

    // 3. No expirada
    await sessionRepo.create(
      new TranscriptionSession({
        id: "not-exp",
        userId: LOCAL_USER_ID,
        originalFileName: "not-exp.mp3",
        fileFormat: "mp3",
        fileSizeBytes: 100n,
        audioExpiresAt: future,
        isAudioPurged: false,
        status: SessionStatus.COMPLETED,
        createdAt: past,
        updatedAt: past
      })
    );

    const expired = await sessionRepo.findExpiredPendingPurge(10, new Date());
    expect(expired.length).toBe(1);
    expect(expired[0]!.id).toBe("exp-1");
  });

  it("cascada al borrar sesión", async () => {
    const sessionId = "session-cascade";
    const now = new Date();

    await sessionRepo.create(
      new TranscriptionSession({
        id: sessionId,
        userId: LOCAL_USER_ID,
        originalFileName: "cascade.mp3",
        fileFormat: "mp3",
        fileSizeBytes: 100n,
        audioExpiresAt: now,
        isAudioPurged: false,
        status: SessionStatus.COMPLETED,
        createdAt: now,
        updatedAt: now
      })
    );

    await speakerRepo.create(
      new Speaker({ id: "spk-casc", sessionId, label: "H1" })
    );

    await segmentRepo.create(
      new TranscriptionSegment({
        id: "seg-casc",
        sessionId,
        speakerId: "spk-casc",
        startTimeMs: 0,
        endTimeMs: 100,
        content: "test"
      })
    );

    await sessionRepo.delete(sessionId);

    const speakers = await speakerRepo.findBySessionId(sessionId);
    const segments = await segmentRepo.findBySessionId(sessionId);
    expect(speakers.length).toBe(0);
    expect(segments.length).toBe(0);
  });

  it("CHECK de tiempos rechaza end_time_ms <= start_time_ms", () => {
    expect(() => {
      new TranscriptionSegment({
        id: "seg-err",
        sessionId: "session-1",
        speakerId: "spk-1",
        startTimeMs: 500,
        endTimeMs: 200,
        content: "error"
      });
    }).toThrow();
  });

  it("FK rechaza insertar un speaker para una sesión inexistente", async () => {
    const invalidSpeaker = new Speaker({
      id: "spk-invalid",
      sessionId: "no-existe",
      label: "H1"
    });

    await expect(speakerRepo.create(invalidSpeaker)).rejects.toThrow();
  });
});
