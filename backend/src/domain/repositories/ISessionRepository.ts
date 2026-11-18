import { TranscriptionSession } from "../entities/TranscriptionSession.js";

export interface ISessionRepository {
  findById(id: string): Promise<TranscriptionSession | null>;
  findByUserId(
    userId: string,
    skip: number,
    take: number
  ): Promise<{ sessions: TranscriptionSession[]; total: number }>;
  findExpiredPendingPurge(take: number, now: Date): Promise<TranscriptionSession[]>;
  create(session: TranscriptionSession): Promise<TranscriptionSession>;
  update(session: TranscriptionSession): Promise<TranscriptionSession>;
  delete(id: string): Promise<void>;
}
