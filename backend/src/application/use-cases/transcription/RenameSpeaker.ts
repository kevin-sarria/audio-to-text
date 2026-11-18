import { ISpeakerRepository } from "../../../domain/repositories/ISpeakerRepository.js";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { Speaker } from "../../../domain/entities/Speaker.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";

export interface RenameSpeakerInput {
  sessionId: string;
  speakerId: string;
  customName: string;
  userId?: string | null;
  guestTokenHash?: string | null;
}

export class RenameSpeaker {
  constructor(
    private sessionRepository: ISessionRepository,
    private speakerRepository: ISpeakerRepository
  ) {}

  public async execute(input: RenameSpeakerInput): Promise<Speaker> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new ForbiddenError("No tiene permisos para modificar hablantes de esta sesión.");
    }

    const speaker = await this.speakerRepository.findById(input.speakerId);
    if (!speaker || speaker.sessionId !== input.sessionId) {
      throw new NotFoundError("Hablante", input.speakerId);
    }

    speaker.rename(input.customName);
    return await this.speakerRepository.update(speaker);
  }
}
