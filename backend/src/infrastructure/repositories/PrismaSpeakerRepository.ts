import { PrismaClient } from "@prisma/client";
import { ISpeakerRepository } from "../../domain/repositories/ISpeakerRepository.js";
import { Speaker } from "../../domain/entities/Speaker.js";

export class PrismaSpeakerRepository implements ISpeakerRepository {
  constructor(private prisma: PrismaClient) {}

  public async findById(id: string): Promise<Speaker | null> {
    const raw = await this.prisma.speaker.findUnique({
      where: { id }
    });
    return raw ? this.toDomain(raw) : null;
  }

  public async findBySessionId(sessionId: string): Promise<Speaker[]> {
    const rawList = await this.prisma.speaker.findMany({
      where: { sessionId },
      orderBy: { label: "asc" }
    });
    return rawList.map((r) => this.toDomain(r));
  }

  public async findBySessionAndLabel(sessionId: string, label: string): Promise<Speaker | null> {
    const raw = await this.prisma.speaker.findUnique({
      where: {
        sessionId_label: {
          sessionId,
          label
        }
      }
    });
    return raw ? this.toDomain(raw) : null;
  }

  public async create(speaker: Speaker): Promise<Speaker> {
    const raw = await this.prisma.speaker.create({
      data: {
        id: speaker.id,
        sessionId: speaker.sessionId,
        label: speaker.label,
        customName: speaker.customName ?? null
      }
    });
    return this.toDomain(raw);
  }

  public async createMany(speakers: Speaker[]): Promise<void> {
    if (speakers.length === 0) return;
    await this.prisma.speaker.createMany({
      data: speakers.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        label: s.label,
        customName: s.customName ?? null
      })),
      skipDuplicates: true
    });
  }

  public async update(speaker: Speaker): Promise<Speaker> {
    const raw = await this.prisma.speaker.update({
      where: { id: speaker.id },
      data: {
        customName: speaker.customName ?? null
      }
    });
    return this.toDomain(raw);
  }

  private toDomain(raw: any): Speaker {
    return new Speaker({
      id: raw.id,
      sessionId: raw.sessionId,
      label: raw.label,
      customName: raw.customName
    });
  }
}
