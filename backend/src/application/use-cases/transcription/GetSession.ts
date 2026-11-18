import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { TranscriptionSession } from "../../../domain/entities/TranscriptionSession.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";

export interface GetSessionInput {
  sessionId: string;
  userId?: string | null;
  guestTokenHash?: string | null;
}

export class GetSession {
  constructor(private sessionRepository: ISessionRepository) {}

  public async execute(input: GetSessionInput): Promise<TranscriptionSession> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new ForbiddenError("No tiene permisos para acceder a esta sesión.");
    }

    return session;
  }
}
