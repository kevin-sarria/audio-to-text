import { PrismaClient } from "@prisma/client";
import { ITranslationRepository } from "../../domain/repositories/ITranslationRepository.js";
import { Translation } from "../../domain/entities/Translation.js";

export class PrismaTranslationRepository implements ITranslationRepository {
  constructor(private prisma: PrismaClient) {}

  public async findBySessionAndLanguage(
    sessionId: string,
    targetLanguage: string
  ): Promise<Translation | null> {
    const raw = await this.prisma.translation.findUnique({
      where: {
        sessionId_targetLanguage: {
          sessionId,
          targetLanguage
        }
      }
    });
    return raw ? this.toDomain(raw) : null;
  }

  public async create(translation: Translation): Promise<Translation> {
    const raw = await this.prisma.translation.create({
      data: {
        id: translation.id,
        sessionId: translation.sessionId,
        targetLanguage: translation.targetLanguage,
        translatedText: translation.translatedText,
        createdAt: translation.createdAt
      }
    });
    return this.toDomain(raw);
  }

  private toDomain(raw: any): Translation {
    return new Translation({
      id: raw.id,
      sessionId: raw.sessionId,
      targetLanguage: raw.targetLanguage,
      translatedText: raw.translatedText,
      createdAt: raw.createdAt
    });
  }
}
