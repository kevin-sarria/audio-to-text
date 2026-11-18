import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";
import { TranscriptionSession } from "../../../domain/entities/TranscriptionSession.js";

export interface LinkSessionToProjectFolderInput {
  sessionId: string;
  projectFolderId: string | null;
  userId?: string | null;
  guestTokenHash?: string | null;
}

export class LinkSessionToProjectFolder {
  constructor(private sessionRepository: ISessionRepository) {}

  public async execute(input: LinkSessionToProjectFolderInput): Promise<TranscriptionSession> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new UnauthorizedError("No tienes permiso para modificar esta sesión.");
    }

    session.setProjectFolderId(input.projectFolderId);
    return await this.sessionRepository.update(session);
  }
}
