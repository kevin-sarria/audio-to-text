import { PrismaClient, SessionStatus as PrismaSessionStatus } from "@prisma/client";
import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";
import { Translation } from "../../domain/entities/Translation.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";

export class PrismaSessionRepository implements ISessionRepository {
  constructor(private prisma: PrismaClient) {}

  public async findById(id: string): Promise<TranscriptionSession | null> {
    const raw = await this.prisma.transcriptionSession.findUnique({
      where: { id },
      include: {
        speakers: true,
        segments: {
          orderBy: { startTimeMs: "asc" }
        },
        translations: true
      }
    });

    return raw ? this.toDomain(raw) : null;
  }

  public async findByUserId(
    userId: string,
    skip: number,
    take: number
  ): Promise<{ sessions: TranscriptionSession[]; total: number }> {
    const [rawSessions, total] = await Promise.all([
      this.prisma.transcriptionSession.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          speakers: true
        }
      }),
      this.prisma.transcriptionSession.count({
        where: { userId }
      })
    ]);

    return {
      sessions: rawSessions.map((r) => this.toDomain(r)),
      total
    };
  }

  public async findExpiredPendingPurge(take: number, now: Date): Promise<TranscriptionSession[]> {
    const rawSessions = await this.prisma.transcriptionSession.findMany({
      where: {
        audioExpiresAt: { lte: now },
        isAudioPurged: false
      },
      take,
      orderBy: { audioExpiresAt: "asc" }
    });

    return rawSessions.map((r) => this.toDomain(r));
  }

  public async create(session: TranscriptionSession): Promise<TranscriptionSession> {
    const raw = await this.prisma.transcriptionSession.create({
      data: {
        id: session.id,
        userId: session.userId ?? null,
        guestTokenHash: session.guestTokenHash ?? null,
        projectFolderId: session.projectFolderId ?? null,
        originalFileName: session.originalFileName,
        fileFormat: session.fileFormat,
        durationSeconds: session.durationSeconds ?? null,
        fileSizeBytes: session.fileSizeBytes,
        storagePath: session.storagePath ?? null,
        audioExpiresAt: session.audioExpiresAt,
        isAudioPurged: session.isAudioPurged,
        status: session.status as PrismaSessionStatus,
        sourceLanguage: session.sourceLanguage ?? null,
        errorMessage: session.errorMessage ?? null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });

    return this.toDomain(raw);
  }

  public async update(session: TranscriptionSession): Promise<TranscriptionSession> {
    const raw = await this.prisma.transcriptionSession.update({
      where: { id: session.id },
      data: {
        projectFolderId: session.projectFolderId ?? null,
        durationSeconds: session.durationSeconds ?? null,
        storagePath: session.storagePath ?? null,
        isAudioPurged: session.isAudioPurged,
        status: session.status as PrismaSessionStatus,
        sourceLanguage: session.sourceLanguage ?? null,
        errorMessage: session.errorMessage ?? null,
        updatedAt: session.updatedAt
      },
      include: {
        speakers: true,
        segments: {
          orderBy: { startTimeMs: "asc" }
        },
        translations: true
      }
    });

    return this.toDomain(raw);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.transcriptionSession.delete({
      where: { id }
    });
  }

  private toDomain(raw: any): TranscriptionSession {
    const speakers = (raw.speakers || []).map(
      (s: any) =>
        new Speaker({
          id: s.id,
          sessionId: s.sessionId,
          label: s.label,
          customName: s.customName
        })
    );

    const segments = (raw.segments || []).map(
      (seg: any) =>
        new TranscriptionSegment({
          id: seg.id,
          sessionId: seg.sessionId,
          speakerId: seg.speakerId,
          startTimeMs: seg.startTimeMs,
          endTimeMs: seg.endTimeMs,
          content: seg.content,
          confidenceScore: seg.confidenceScore !== null && seg.confidenceScore !== undefined ? Number(seg.confidenceScore) : null
        })
    );

    const translations = (raw.translations || []).map(
      (t: any) =>
        new Translation({
          id: t.id,
          sessionId: t.sessionId,
          targetLanguage: t.targetLanguage,
          translatedText: t.translatedText,
          createdAt: t.createdAt
        })
    );

    return new TranscriptionSession({
      id: raw.id,
      userId: raw.userId,
      guestTokenHash: raw.guestTokenHash,
      projectFolderId: raw.projectFolderId ?? null,
      originalFileName: raw.originalFileName,
      fileFormat: raw.fileFormat,
      durationSeconds: raw.durationSeconds !== null && raw.durationSeconds !== undefined ? Number(raw.durationSeconds) : null,
      fileSizeBytes: BigInt(raw.fileSizeBytes),
      storagePath: raw.storagePath,
      audioExpiresAt: raw.audioExpiresAt,
      isAudioPurged: raw.isAudioPurged,
      status: raw.status as SessionStatus,
      sourceLanguage: raw.sourceLanguage,
      errorMessage: raw.errorMessage,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      speakers,
      segments,
      translations
    });
  }
}
