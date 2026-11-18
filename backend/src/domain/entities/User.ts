import { AuthProvider, UserStatus } from "../value-objects/AuthProvider.js";
import { UserProfile } from "./UserProfile.js";

export interface UserProps {
  id: string;
  email: string;
  passwordHash?: string | null;
  authProvider: AuthProvider;
  googleSub?: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  profile?: UserProfile | null;
}

export class User {
  constructor(private props: UserProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get email(): string {
    return this.props.email;
  }

  public get passwordHash(): string | null | undefined {
    return this.props.passwordHash;
  }

  public get authProvider(): AuthProvider {
    return this.props.authProvider;
  }

  public get googleSub(): string | null | undefined {
    return this.props.googleSub;
  }

  public get status(): UserStatus {
    return this.props.status;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public get profile(): UserProfile | null | undefined {
    return this.props.profile;
  }

  public isActive(): boolean {
    return this.props.status === UserStatus.ACTIVE;
  }
}
