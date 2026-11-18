import { TimeRange } from "../value-objects/TimeRange.js";

export interface TranscriptionSegmentProps {
  id: string;
  sessionId: string;
  speakerId: string;
  startTimeMs: number;
  endTimeMs: number;
  content: string;
  confidenceScore?: number | null;
}

export class TranscriptionSegment {
  private timeRange: TimeRange;

  constructor(private props: TranscriptionSegmentProps) {
    this.timeRange = new TimeRange(props.startTimeMs, props.endTimeMs);
  }

  public get id(): string {
    return this.props.id;
  }

  public get sessionId(): string {
    return this.props.sessionId;
  }

  public get speakerId(): string {
    return this.props.speakerId;
  }

  public get startTimeMs(): number {
    return this.timeRange.startMs;
  }

  public get endTimeMs(): number {
    return this.timeRange.endMs;
  }

  public get content(): string {
    return this.props.content;
  }

  public get confidenceScore(): number | null | undefined {
    return this.props.confidenceScore;
  }
}
