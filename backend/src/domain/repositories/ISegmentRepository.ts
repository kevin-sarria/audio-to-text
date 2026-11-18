import { TranscriptionSegment } from "../entities/TranscriptionSegment.js";

export interface ISegmentRepository {
  findBySessionId(sessionId: string): Promise<TranscriptionSegment[]>;
  create(segment: TranscriptionSegment): Promise<TranscriptionSegment>;
  createMany(segments: TranscriptionSegment[]): Promise<void>;
  deleteBySessionId(sessionId: string): Promise<void>;
}
