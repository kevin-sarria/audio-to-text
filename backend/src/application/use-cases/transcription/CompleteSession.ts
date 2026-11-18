import crypto from "node:crypto";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { ISpeakerRepository } from "../../../domain/repositories/ISpeakerRepository.js";
import { ISegmentRepository } from "../../../domain/repositories/ISegmentRepository.js";
import { IEventPublisher } from "../../../domain/services/IEventPublisher.js";
import { Speaker } from "../../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../../domain/entities/TranscriptionSegment.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { RawTranscriptionSegment } from "../../../domain/services/ITranscriptionEngine.js";

export interface CompleteSessionInput {
  sessionId: string;
  language?: string;
  segments: RawTranscriptionSegment[];
}

export class CompleteSession {
  constructor(
    private sessionRepository: ISessionRepository,
    private speakerRepository: ISpeakerRepository,
    private segmentRepository: ISegmentRepository,
    private eventPublisher: IEventPublisher
  ) {}

  public async execute(input: CompleteSessionInput): Promise<void> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    // Identificar hablantes únicos de los segmentos
    const speakerLabels = new Set<string>();
    input.segments.forEach((s) => {
      speakerLabels.add(s.speakerLabel || "Hablante 1");
    });

    // Crear entidades Speaker
    const speakerMap = new Map<string, Speaker>();
    const speakerEntities: Speaker[] = [];
    for (const label of speakerLabels) {
      const speaker = new Speaker({
        id: crypto.randomUUID(),
        sessionId: session.id,
        label,
        customName: null
      });
      speakerMap.set(label, speaker);
      speakerEntities.push(speaker);
    }

    await this.speakerRepository.createMany(speakerEntities);

    // Crear entidades Segment
    const segmentEntities: TranscriptionSegment[] = input.segments.map((s) => {
      const speaker = speakerMap.get(s.speakerLabel || "Hablante 1") || speakerEntities[0]!;
      return new TranscriptionSegment({
        id: crypto.randomUUID(),
        sessionId: session.id,
        speakerId: speaker.id,
        startTimeMs: s.startMs,
        endTimeMs: s.endMs,
        content: s.text,
        confidenceScore: s.confidence ?? null
      });
    });

    await this.segmentRepository.createMany(segmentEntities);

    // Marcar sesión como completada
    session.markCompleted();
    await this.sessionRepository.update(session);

    // Publicar evento SSE
    await this.eventPublisher.publishSessionEvent({
      sessionId: session.id,
      type: "completed",
      data: {
        sessionId: session.id,
        segmentsCount: segmentEntities.length,
        speakersCount: speakerEntities.length
      }
    });
  }
}
