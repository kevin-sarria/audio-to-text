import { Translation } from "../entities/Translation.js";

export interface ITranslationRepository {
  findBySessionAndLanguage(
    sessionId: string,
    targetLanguage: string
  ): Promise<Translation | null>;
  create(translation: Translation): Promise<Translation>;
}
