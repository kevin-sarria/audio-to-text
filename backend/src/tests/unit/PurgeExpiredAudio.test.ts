import { describe, it, expect, vi } from "vitest";
import { PurgeExpiredAudio } from "../../application/use-cases/retention/PurgeExpiredAudio.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";
import { IStorageService } from "../../domain/services/IStorageService.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

class InMemorySessionRepository implements ISessionRepository {
  public sessions: Map<string, TranscriptionSession> = new Map();

  async findById(id: string): Promise<TranscriptionSession | null> {
    return this.sessions.get(id) || null;
  }

  async findByUserId(): Promise<{ sessions: TranscriptionSession[]; total: number }> {
    return { sessions: [], total: 0 };
  }

  async findExpiredPendingPurge(_take: number, now: Date): Promise<TranscriptionSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.audioExpiresAt.getTime() <= now.getTime() && !s.isAudioPurged
    );
  }

  async create(session: TranscriptionSession): Promise<TranscriptionSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async update(session: TranscriptionSession): Promise<TranscriptionSession> {
    this.sessions.set(session.id, session);
    return session;
  }

  async delete(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}

class InMemoryStorageService implements IStorageService {
  public files: Map<string, Buffer> = new Map();

  async save(_source: string | Buffer, key: string): Promise<string> {
    this.files.set(key, Buffer.from("dummy"));
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return this.files.get(key) || Buffer.from("");
  }

  async delete(key: string): Promise<void> {
    // Idempotente: si no existe, no falla
    this.files.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }

  getAbsolutePath(key: string): string {
    return `/storage/${key}`;
  }
}

describe("PurgeExpiredAudio Use Case", () => {
  it("debe purgar únicamente sesiones cuyo audioExpiresAt <= now y no estén previamente purgadas", async () => {
    const sessionRepo = new InMemorySessionRepository();
    const storageService = new InMemoryStorageService();
    const useCase = new PurgeExpiredAudio(sessionRepo, storageService);

    const now = new Date("2026-10-31T12:00:00Z");

    // Sesión 1: Expirada
    const expiredSession = new TranscriptionSession({
      id: "sess-1",
      originalFileName: "meeting.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1000n,
      storagePath: "raw/sess-1.mp3",
      audioExpiresAt: new Date("2026-10-30T10:00:00Z"),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date("2026-10-28T10:00:00Z"),
      updatedAt: new Date("2026-10-28T10:00:00Z")
    });

    // Sesión 2: No expirada
    const activeSession = new TranscriptionSession({
      id: "sess-2",
      originalFileName: "interview.wav",
      fileFormat: "wav",
      fileSizeBytes: 2000n,
      storagePath: "raw/sess-2.wav",
      audioExpiresAt: new Date("2026-11-01T10:00:00Z"),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date("2026-10-30T10:00:00Z"),
      updatedAt: new Date("2026-10-30T10:00:00Z")
    });

    // Sesión 3: Expirada pero ya purgada previamente
    const alreadyPurgedSession = new TranscriptionSession({
      id: "sess-3",
      originalFileName: "old.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 500n,
      storagePath: null,
      audioExpiresAt: new Date("2026-10-25T10:00:00Z"),
      isAudioPurged: true,
      status: SessionStatus.COMPLETED,
      createdAt: new Date("2026-10-23T10:00:00Z"),
      updatedAt: new Date("2026-10-25T10:00:00Z")
    });

    await sessionRepo.create(expiredSession);
    await sessionRepo.create(activeSession);
    await sessionRepo.create(alreadyPurgedSession);

    storageService.files.set("raw/sess-1.mp3", Buffer.from("audio1"));
    storageService.files.set("raw/sess-2.wav", Buffer.from("audio2"));

    const result = await useCase.execute(now);

    expect(result.purgedCount).toBe(1);
    expect(result.failedCount).toBe(0);

    const updatedSess1 = await sessionRepo.findById("sess-1");
    expect(updatedSess1?.isAudioPurged).toBe(true);
    expect(updatedSess1?.storagePath).toBeNull();
    expect(storageService.files.has("raw/sess-1.mp3")).toBe(false);

    const updatedSess2 = await sessionRepo.findById("sess-2");
    expect(updatedSess2?.isAudioPurged).toBe(false);
    expect(updatedSess2?.storagePath).toBe("raw/sess-2.wav");
    expect(storageService.files.has("raw/sess-2.wav")).toBe(true);
  });

  it("debe ser idempotente si el archivo en storage ya no existía en disco", async () => {
    const sessionRepo = new InMemorySessionRepository();
    const storageService = new InMemoryStorageService();
    const useCase = new PurgeExpiredAudio(sessionRepo, storageService);

    const now = new Date("2026-10-31T12:00:00Z");

    const session = new TranscriptionSession({
      id: "sess-missing-file",
      originalFileName: "missing.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1000n,
      storagePath: "raw/does-not-exist.mp3",
      audioExpiresAt: new Date("2026-10-30T10:00:00Z"),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date("2026-10-28T10:00:00Z"),
      updatedAt: new Date("2026-10-28T10:00:00Z")
    });

    await sessionRepo.create(session);

    // Ejecución no debe arrojar error aunque el archivo no exista
    const result = await useCase.execute(now);
    expect(result.purgedCount).toBe(1);

    const updated = await sessionRepo.findById("sess-missing-file");
    expect(updated?.isAudioPurged).toBe(true);
    expect(updated?.storagePath).toBeNull();
  });

  it("conserva intactos los hablantes y segmentos al purgar el audio físico", async () => {
    const sessionRepo = new InMemorySessionRepository();
    const storageService = new InMemoryStorageService();
    const useCase = new PurgeExpiredAudio(sessionRepo, storageService);

    const now = new Date("2026-10-31T12:00:00Z");

    const speaker = new Speaker({
      id: "sp-1",
      sessionId: "sess-with-data",
      label: "Hablante 1",
      customName: "Dra. García"
    });

    const segment = new TranscriptionSegment({
      id: "seg-1",
      sessionId: "sess-with-data",
      speakerId: "sp-1",
      startTimeMs: 0,
      endTimeMs: 3500,
      content: "Este texto debe permanecer guardado.",
      confidenceScore: 0.98
    });

    const session = new TranscriptionSession({
      id: "sess-with-data",
      originalFileName: "data.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1000n,
      storagePath: "raw/data.mp3",
      audioExpiresAt: new Date("2026-10-30T10:00:00Z"),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date("2026-10-28T10:00:00Z"),
      updatedAt: new Date("2026-10-28T10:00:00Z"),
      speakers: [speaker],
      segments: [segment]
    });

    await sessionRepo.create(session);
    await useCase.execute(now);

    const updated = await sessionRepo.findById("sess-with-data");
    expect(updated?.isAudioPurged).toBe(true);
    expect(updated?.speakers.length).toBe(1);
    expect(updated?.speakers[0]?.displayName).toBe("Dra. García");
    expect(updated?.segments.length).toBe(1);
    expect(updated?.segments[0]?.content).toBe("Este texto debe permanecer guardado.");
  });
});
