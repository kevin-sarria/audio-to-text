import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IStorageService } from "../../../domain/services/IStorageService.js";

export interface PurgeExpiredAudioResult {
  purgedCount: number;
  failedCount: number;
}

export class PurgeExpiredAudio {
  constructor(
    private sessionRepository: ISessionRepository,
    private storageService: IStorageService
  ) {}

  public async execute(now: Date = new Date(), batchSize: number = 100): Promise<PurgeExpiredAudioResult> {
    const expiredSessions = await this.sessionRepository.findExpiredPendingPurge(batchSize, now);

    let purgedCount = 0;
    let failedCount = 0;

    for (const session of expiredSessions) {
      try {
        if (session.storagePath) {
          // Idempotente: si el archivo ya no existe, el storage service no arroja error
          await this.storageService.delete(session.storagePath);
        }

        session.purgeAudio();
        await this.sessionRepository.update(session);
        purgedCount++;
      } catch (error) {
        // Errores por ítem no abortan el lote
        console.error(`Error purgando audio de la sesión ${session.id}:`, error);
        failedCount++;
      }
    }

    return { purgedCount, failedCount };
  }
}
