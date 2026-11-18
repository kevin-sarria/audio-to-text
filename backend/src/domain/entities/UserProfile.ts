export interface UserProfileProps {
  id: string;
  userId: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  preferences?: Record<string, unknown> | null;
}

export class UserProfile {
  constructor(private props: UserProfileProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get userId(): string {
    return this.props.userId;
  }

  public get fullName(): string | null | undefined {
    return this.props.fullName;
  }

  public get avatarUrl(): string | null | undefined {
    return this.props.avatarUrl;
  }

  public get preferences(): Record<string, unknown> | null | undefined {
    return this.props.preferences;
  }
}
