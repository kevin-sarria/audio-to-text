import { IMeetingAnalysisRepository } from "../../../domain/repositories/IMeetingAnalysisRepository.js";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";
import { MeetingAnalysis } from "../../../domain/entities/MeetingAnalysis.js";

export interface UpdateMeetingAnalysisTitleInput {
  sessionId: string;
  userId?: string | null;
  guestTokenHash?: string | null;
  title: string;
}

export class UpdateMeetingAnalysisTitle {
  constructor(
    private sessionRepository: ISessionRepository,
    private meetingAnalysisRepository: IMeetingAnalysisRepository
  ) {}

  public async execute(input: UpdateMeetingAnalysisTitleInput): Promise<MeetingAnalysis> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new UnauthorizedError("No tienes permiso para modificar esta sesión.");
    }

    const analysis = await this.meetingAnalysisRepository.findBySessionId(input.sessionId);
    if (!analysis) {
      throw new NotFoundError("Análisis de reunión", input.sessionId);
    }

    analysis.update({ title: input.title.trim() });
    return await this.meetingAnalysisRepository.save(analysis);
  }
}
