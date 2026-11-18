import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IEventPublisher } from "../../../domain/services/IEventPublisher.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

export interface FailSessionInput {
  sessionId: string;
  errorMessage: string;
}

export class FailSession {
  constructor(
    private sessionRepository: ISessionRepository,
    private eventPublisher: IEventPublisher
  ) {}

  public async execute(input: FailSessionInput): Promise<void> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    session.markFailed(input.errorMessage);
    await this.sessionRepository.update(session);

    await this.eventPublisher.publishSessionEvent({
      sessionId: session.id,
      type: "failed",
      data: {
        sessionId: session.id,
        error: session.errorMessage
      }
    });
  }
}
