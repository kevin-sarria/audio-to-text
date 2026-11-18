export interface SpeakerProps {
  id: string;
  sessionId: string;
  label: string;
  customName?: string | null;
}

export class Speaker {
  constructor(private props: SpeakerProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get sessionId(): string {
    return this.props.sessionId;
  }

  public get label(): string {
    return this.props.label;
  }

  public get customName(): string | null | undefined {
    return this.props.customName;
  }

  public get displayName(): string {
    return this.props.customName?.trim() || this.props.label;
  }

  public rename(customName: string): void {
    const trimmed = customName.trim();
    if (!trimmed) {
      throw new Error("El nombre personalizado no puede estar vacío");
    }
    this.props.customName = trimmed;
  }
}
