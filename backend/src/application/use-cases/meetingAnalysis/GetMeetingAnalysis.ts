import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IMeetingAnalysisRepository } from "../../../domain/repositories/IMeetingAnalysisRepository.js";
import { MeetingAnalysis } from "../../../domain/entities/MeetingAnalysis.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";

export interface GetMeetingAnalysisInput {
  sessionId: string;
  userId?: string | null;
  guestTokenHash?: string | null;
}

export class GetMeetingAnalysis {
  constructor(
    private sessionRepository: ISessionRepository,
    private analysisRepository: IMeetingAnalysisRepository
  ) {}

  public async execute(input: GetMeetingAnalysisInput): Promise<MeetingAnalysis | null> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new ForbiddenError("No tiene permisos para acceder a esta sesión.");
    }

    return await this.analysisRepository.findBySessionId(input.sessionId);
  }
}
