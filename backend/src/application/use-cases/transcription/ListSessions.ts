import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { TranscriptionSession } from "../../../domain/entities/TranscriptionSession.js";

export interface ListSessionsInput {
  userId: string;
  page?: number;
  limit?: number;
}

export interface ListSessionsOutput {
  sessions: TranscriptionSession[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ListSessions {
  constructor(private sessionRepository: ISessionRepository) {}

  public async execute(input: ListSessionsInput): Promise<ListSessionsOutput> {
    const page = Math.max(1, input.page || 1);
    const limit = Math.min(100, Math.max(1, input.limit || 20));
    const skip = (page - 1) * limit;

    const { sessions, total } = await this.sessionRepository.findByUserId(
      input.userId,
      skip,
      limit
    );

    return {
      sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}
