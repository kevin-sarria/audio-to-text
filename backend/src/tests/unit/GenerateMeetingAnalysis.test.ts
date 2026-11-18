import { describe, it, expect, vi, beforeEach } from "vitest";
import { GenerateMeetingAnalysis } from "../../application/use-cases/meetingAnalysis/GenerateMeetingAnalysis.js";
import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";
import { IMeetingAnalysisRepository } from "../../domain/repositories/IMeetingAnalysisRepository.js";
import { IMeetingAnalysisService, GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import { MeetingAnalysis } from "../../domain/entities/MeetingAnalysis.js";
import { NotFoundError } from "../../domain/errors/NotFoundError.js";
import { ValidationError } from "../../domain/errors/ValidationError.js";
import { ForbiddenError } from "../../domain/errors/ForbiddenError.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

describe("GenerateMeetingAnalysis UseCase", () => {
  let sessionRepo: ISessionRepository;
  let analysisRepo: IMeetingAnalysisRepository;
  let analysisService: IMeetingAnalysisService;
  let useCase: GenerateMeetingAnalysis;

  const mockGeneratedData: GeneratedMeetingData = {
    summary: "Se discutió la arquitectura del módulo de autenticación y webhooks.",
    keyDecisions: ["Usar JWT rotativos con refresh tokens", "Crear endpoint de webhooks con firma HMAC"],
    topicsDiscussed: ["Autenticación", "Seguridad de Webhooks", "Docker compose"],
    issues: [
      {
        id: "ISSUE-1",
        title: "[Backend] Implementar verificación HMAC en webhooks",
        type: "feature",
        priority: "high",
        component: "Backend / API",
        description: "Validar cabecera X-Hub-Signature-256 en endpoints de webhooks.",
        expectedFiles: ["backend/src/interfaces/http/middlewares/verifyHmac.ts"],
        acceptanceCriteria: [
          "Retorna 401 si falta la cabecera X-Hub-Signature-256",
          "Retorna 200 si la firma coincide con el secreto configurado"
        ],
        agentPrompt: "### Rol y Objetivo\nActúa como senior dev...\n### Criterios de Aceptación\n- [ ] ..."
      }
    ]
  };

  beforeEach(() => {
    sessionRepo = {
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findExpiredPendingPurge: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    };

    analysisRepo = {
      findBySessionId: vi.fn(),
      save: vi.fn().mockImplementation(async (a: MeetingAnalysis) => a),
      deleteBySessionId: vi.fn()
    };

    analysisService = {
      generateAnalysis: vi.fn().mockResolvedValue(mockGeneratedData)
    };

    useCase = new GenerateMeetingAnalysis(sessionRepo, analysisRepo, analysisService);
  });

  it("genera el resumen e issues optimizadas para agentes cuando la sesión está COMPLETED", async () => {
    const session = new TranscriptionSession({
      id: "sess-123",
      userId: "user-1",
      originalFileName: "reunion-sprint.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1024n,
      audioExpiresAt: new Date(Date.now() + 100000),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date(),
      speakers: [new Speaker({ id: "sp-1", sessionId: "sess-123", label: "Speaker 1", customName: "Alice" })],
      segments: [
        new TranscriptionSegment({
          id: "seg-1",
          sessionId: "sess-123",
          speakerId: "sp-1",
          startTimeMs: 1000,
          endTimeMs: 4000,
          content: "Hola Alice, revisemos los webhooks."
        })
      ]
    });

    vi.mocked(sessionRepo.findById).mockResolvedValue(session);
    vi.mocked(analysisRepo.findBySessionId).mockResolvedValue(null);

    const result = await useCase.execute({
      sessionId: "sess-123",
      userId: "user-1",
      projectContext: "Stack: Express + Prisma + Vite"
    });

    expect(result).toBeDefined();
    expect(result.summary).toContain("Se discutió la arquitectura");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.id).toBe("ISSUE-1");
    expect(result.issues[0]?.agentPrompt).toContain("Rol y Objetivo");
    expect(analysisService.generateAnalysis).toHaveBeenCalledWith(
      expect.stringContaining("[00:01] Alice: Hola Alice, revisemos los webhooks."),
      "Stack: Express + Prisma + Vite",
      expect.anything()
    );
    expect(analysisRepo.save).toHaveBeenCalled();
  });

  it("lanza NotFoundError si la sesión no existe", async () => {
    vi.mocked(sessionRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        sessionId: "sess-inexistente",
        userId: "user-1"
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("lanza ForbiddenError si el usuario no tiene permisos", async () => {
    const session = new TranscriptionSession({
      id: "sess-123",
      userId: "user-otro",
      originalFileName: "audio.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1024n,
      audioExpiresAt: new Date(Date.now() + 100000),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    vi.mocked(sessionRepo.findById).mockResolvedValue(session);

    await expect(
      useCase.execute({
        sessionId: "sess-123",
        userId: "user-1"
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("lanza ValidationError si la sesión aún está en PROCESSING", async () => {
    const session = new TranscriptionSession({
      id: "sess-123",
      userId: "user-1",
      originalFileName: "audio.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 1024n,
      audioExpiresAt: new Date(Date.now() + 100000),
      isAudioPurged: false,
      status: SessionStatus.PROCESSING,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    vi.mocked(sessionRepo.findById).mockResolvedValue(session);

    await expect(
      useCase.execute({
        sessionId: "sess-123",
        userId: "user-1"
      })
    ).rejects.toThrow(ValidationError);
  });
});
