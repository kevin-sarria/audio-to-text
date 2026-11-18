import { Speaker } from "../entities/Speaker.js";

export interface ISpeakerRepository {
  findById(id: string): Promise<Speaker | null>;
  findBySessionId(sessionId: string): Promise<Speaker[]>;
  findBySessionAndLabel(sessionId: string, label: string): Promise<Speaker | null>;
  create(speaker: Speaker): Promise<Speaker>;
  createMany(speakers: Speaker[]): Promise<void>;
  update(speaker: Speaker): Promise<Speaker>;
}
