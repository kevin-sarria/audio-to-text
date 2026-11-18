import { PrismaClient } from "@prisma/client";
import { ISegmentRepository } from "../../domain/repositories/ISegmentRepository.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

export class PrismaSegmentRepository implements ISegmentRepository {
  constructor(private prisma: PrismaClient) {}

  public async findBySessionId(sessionId: string): Promise<TranscriptionSegment[]> {
    const rawList = await this.prisma.transcriptionSegment.findMany({
      where: { sessionId },
      orderBy: { startTimeMs: "asc" }
    });
    return rawList.map((r) => this.toDomain(r));
  }

  public async create(segment: TranscriptionSegment): Promise<TranscriptionSegment> {
    const raw = await this.prisma.transcriptionSegment.create({
      data: {
        id: segment.id,
        sessionId: segment.sessionId,
        speakerId: segment.speakerId,
        startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs,
        content: segment.content,
        confidenceScore: segment.confidenceScore ?? null
      }
    });
    return this.toDomain(raw);
  }

  public async createMany(segments: TranscriptionSegment[]): Promise<void> {
    if (segments.length === 0) return;
    await this.prisma.transcriptionSegment.createMany({
      data: segments.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        speakerId: s.speakerId,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs,
        content: s.content,
        confidenceScore: s.confidenceScore ?? null
      }))
    });
  }

  public async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.transcriptionSegment.deleteMany({
      where: { sessionId }
    });
  }

  private toDomain(raw: any): TranscriptionSegment {
    return new TranscriptionSegment({
      id: raw.id,
      sessionId: raw.sessionId,
      speakerId: raw.speakerId,
      startTimeMs: raw.startTimeMs,
      endTimeMs: raw.endTimeMs,
      content: raw.content,
      confidenceScore: raw.confidenceScore !== null && raw.confidenceScore !== undefined ? Number(raw.confidenceScore) : null
    });
  }
}
