import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IStorageService } from "../../../domain/services/IStorageService.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";

export interface DeleteSessionInput {
  sessionId: string;
  userId?: string | null;
  guestTokenHash?: string | null;
}

export class DeleteSession {
  constructor(
    private sessionRepository: ISessionRepository,
    private storageService: IStorageService
  ) {}

  public async execute(input: DeleteSessionInput): Promise<void> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new ForbiddenError("No tiene permisos para eliminar esta sesión.");
    }

    if (session.storagePath) {
      try {
        await this.storageService.delete(session.storagePath);
      } catch (err) {
        console.warn(`Error eliminando archivo físico de sesión ${session.id}:`, err);
      }
    }

    await this.sessionRepository.delete(session.id);
  }
}
