import { describe, it, expect, vi } from "vitest";
import { createPreprocessHandler } from "../../workers/handlers/preprocess.handler.js";
import { createTranscribeHandler } from "../../workers/handlers/transcribe.handler.js";
import { createPersistHandler } from "../../workers/handlers/persist.handler.js";
import { createRetentionHandler } from "../../workers/handlers/retention.handler.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";

describe("Handlers no-regression", () => {
  it("preprocess.handler convierte audio, actualiza sesión a PROCESSING y encola transcribe", async () => {
    const session = new TranscriptionSession({
      id: "sess-1",
      userId: "u1",
      originalFileName: "test.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 100n,
      storagePath: "raw/test.mp3",
      audioExpiresAt: new Date(),
      isAudioPurged: false,
      status: SessionStatus.PENDING,
      sourceLanguage: "es",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const mockRepo = {
      findById: vi.fn().mockResolvedValue(session),
      update: vi.fn().mockResolvedValue(session)
    } as any;

    const mockStorage = {
      getAbsolutePath: vi.fn().mockReturnValue("/abs/raw/test.mp3"),
      exists: vi.fn().mockResolvedValue(true)
    } as any;

    const mockAudio = {
      convertToWavMono16k: vi.fn().mockResolvedValue({
        wavPath: "/tmp/test.wav",
        durationSeconds: 12.5
      })
    } as any;

    const mockQueue = {
      enqueueTranscribe: vi.fn().mockResolvedValue(undefined)
    } as any;

    const handler = createPreprocessHandler({
      sessionRepository: mockRepo,
      storageService: mockStorage,
      audioProcessor: mockAudio,
      jobQueue: mockQueue
    });

    await handler({ sessionId: "sess-1" });

    expect(mockAudio.convertToWavMono16k).toHaveBeenCalled();
    expect(session.status).toBe(SessionStatus.PROCESSING);
    expect(session.durationSeconds).toBe(12.5);
    expect(mockRepo.update).toHaveBeenCalledWith(session);
    expect(mockQueue.enqueueTranscribe).toHaveBeenCalledWith({
      sessionId: "sess-1",
      wavPath: "/tmp/test.wav",
      metadata: { language: "es" }
    });
  });

  it("transcribe.handler emite eventos SSE de progreso y encola persist", async () => {
    const mockEngine = {
      transcribe: vi.fn().mockImplementation(async (_wavPath, opts) => {
        opts?.onProgress?.(50);
        return {
          language: "es",
          segments: [{ startMs: 0, endMs: 1000, text: "prueba" }]
        };
      })
    } as any;

    const mockQueue = {
      enqueuePersist: vi.fn().mockResolvedValue(undefined)
    } as any;

    const mockEvents = {
      publishSessionEvent: vi.fn().mockResolvedValue(undefined)
    } as any;

    const handler = createTranscribeHandler({
      transcriptionEngine: mockEngine,
      jobQueue: mockQueue,
      eventPublisher: mockEvents
    });

    await handler({ sessionId: "sess-1", wavPath: "/tmp/non-existent.wav" });

    expect(mockEvents.publishSessionEvent).toHaveBeenCalledWith({
      sessionId: "sess-1",
      type: "progress",
      data: { stage: "transcribing", percent: 50 }
    });

    expect(mockQueue.enqueuePersist).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "sess-1",
        metadata: expect.objectContaining({
          language: "es"
        })
      })
    );
  });

  it("persist.handler llama a completeSession.execute con los segmentos", async () => {
    const mockCompleteSession = {
      execute: vi.fn().mockResolvedValue(undefined)
    } as any;

    const handler = createPersistHandler({
      completeSession: mockCompleteSession
    });

    await handler({
      sessionId: "sess-1",
      metadata: {
        language: "es",
        segments: [{ startMs: 0, endMs: 500, text: "hola" }]
      }
    });

    expect(mockCompleteSession.execute).toHaveBeenCalledWith({
      sessionId: "sess-1",
      language: "es",
      segments: [{ startMs: 0, endMs: 500, text: "hola" }]
    });
  });

  it("retention.handler ejecuta purgeExpiredAudio", async () => {
    const mockPurge = {
      execute: vi.fn().mockResolvedValue({ purgedCount: 2, failedCount: 0 })
    } as any;

    const handler = createRetentionHandler({
      purgeExpiredAudio: mockPurge
    });

    const result = await handler("job-123");
    expect(mockPurge.execute).toHaveBeenCalled();
    expect(result.purgedCount).toBe(2);
  });
});
