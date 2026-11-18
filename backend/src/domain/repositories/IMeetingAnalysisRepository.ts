import { MeetingAnalysis } from "../entities/MeetingAnalysis.js";

export interface IMeetingAnalysisRepository {
  findBySessionId(sessionId: string): Promise<MeetingAnalysis | null>;
  save(analysis: MeetingAnalysis): Promise<MeetingAnalysis>;
  deleteBySessionId(sessionId: string): Promise<void>;
}
