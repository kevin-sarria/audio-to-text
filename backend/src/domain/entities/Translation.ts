export interface TranslationProps {
  id: string;
  sessionId: string;
  targetLanguage: string;
  translatedText: string;
  createdAt: Date;
}

export class Translation {
  constructor(private props: TranslationProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get sessionId(): string {
    return this.props.sessionId;
  }

  public get targetLanguage(): string {
    return this.props.targetLanguage;
  }

  public get translatedText(): string {
    return this.props.translatedText;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }
}
