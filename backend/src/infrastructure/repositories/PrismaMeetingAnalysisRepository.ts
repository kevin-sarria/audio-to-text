import { PrismaClient } from "@prisma/client";
import { IMeetingAnalysisRepository } from "../../domain/repositories/IMeetingAnalysisRepository.js";
import { MeetingAnalysis } from "../../domain/entities/MeetingAnalysis.js";

export class PrismaMeetingAnalysisRepository implements IMeetingAnalysisRepository {
  constructor(private prisma: PrismaClient) {}

  public async findBySessionId(sessionId: string): Promise<MeetingAnalysis | null> {
    const raw = await this.prisma.meetingAnalysis.findUnique({
      where: { sessionId }
    });

    if (!raw) return null;
    return this.toDomain(raw);
  }

  public async save(analysis: MeetingAnalysis): Promise<MeetingAnalysis> {
    const raw = await this.prisma.meetingAnalysis.upsert({
      where: { sessionId: analysis.sessionId },
      update: {
        title: analysis.title || null,
        projectContext: analysis.projectContext || null,
        summary: analysis.summary,
        keyDecisions: analysis.keyDecisions,
        topicsDiscussed: analysis.topicsDiscussed,
        issues: analysis.issues as any,
        updatedAt: analysis.updatedAt
      },
      create: {
        id: analysis.id,
        sessionId: analysis.sessionId,
        title: analysis.title || null,
        projectContext: analysis.projectContext || null,
        summary: analysis.summary,
        keyDecisions: analysis.keyDecisions,
        topicsDiscussed: analysis.topicsDiscussed,
        issues: analysis.issues as any,
        createdAt: analysis.createdAt,
        updatedAt: analysis.updatedAt
      }
    });

    return this.toDomain(raw);
  }

  public async deleteBySessionId(sessionId: string): Promise<void> {
    await this.prisma.meetingAnalysis.deleteMany({
      where: { sessionId }
    });
  }

  private toDomain(raw: any): MeetingAnalysis {
    return new MeetingAnalysis({
      id: raw.id,
      sessionId: raw.sessionId,
      title: raw.title ?? null,
      projectContext: raw.projectContext ?? null,
      summary: raw.summary,
      keyDecisions: Array.isArray(raw.keyDecisions) ? raw.keyDecisions : [],
      topicsDiscussed: Array.isArray(raw.topicsDiscussed) ? raw.topicsDiscussed : [],
      issues: Array.isArray(raw.issues) ? raw.issues : [],
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    });
  }
}
