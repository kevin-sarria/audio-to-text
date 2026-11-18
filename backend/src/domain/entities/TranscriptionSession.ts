import { SessionStatus } from "../value-objects/SessionStatus.js";
import { Speaker } from "./Speaker.js";
import { TranscriptionSegment } from "./TranscriptionSegment.js";
import { Translation } from "./Translation.js";

export interface TranscriptionSessionProps {
  id: string;
  userId?: string | null;
  guestTokenHash?: string | null;
  projectFolderId?: string | null;
  originalFileName: string;
  fileFormat: string;
  durationSeconds?: number | null;
  fileSizeBytes: bigint;
  storagePath?: string | null;
  audioExpiresAt: Date;
  isAudioPurged: boolean;
  status: SessionStatus;
  sourceLanguage?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
  speakers?: Speaker[];
  segments?: TranscriptionSegment[];
  translations?: Translation[];
}

export class TranscriptionSession {
  constructor(private props: TranscriptionSessionProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get userId(): string | null | undefined {
    return this.props.userId;
  }

  public get guestTokenHash(): string | null | undefined {
    return this.props.guestTokenHash;
  }

  public get projectFolderId(): string | null | undefined {
    return this.props.projectFolderId;
  }

  public setProjectFolderId(folderId: string | null): void {
    this.props.projectFolderId = folderId;
    this.props.updatedAt = new Date();
  }

  public get originalFileName(): string {
    return this.props.originalFileName;
  }

  public get fileFormat(): string {
    return this.props.fileFormat;
  }

  public get durationSeconds(): number | null | undefined {
    return this.props.durationSeconds;
  }

  public get fileSizeBytes(): bigint {
    return this.props.fileSizeBytes;
  }

  public get storagePath(): string | null | undefined {
    return this.props.storagePath;
  }

  public get audioExpiresAt(): Date {
    return this.props.audioExpiresAt;
  }

  public get isAudioPurged(): boolean {
    return this.props.isAudioPurged;
  }

  public get status(): SessionStatus {
    return this.props.status;
  }

  public get sourceLanguage(): string | null | undefined {
    return this.props.sourceLanguage;
  }

  public get errorMessage(): string | null | undefined {
    return this.props.errorMessage;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public get speakers(): Speaker[] {
    return this.props.speakers ?? [];
  }

  public get segments(): TranscriptionSegment[] {
    return this.props.segments ?? [];
  }

  public get translations(): Translation[] {
    return this.props.translations ?? [];
  }

  public markProcessing(durationSeconds?: number): void {
    this.props.status = SessionStatus.PROCESSING;
    if (durationSeconds !== undefined) {
      this.props.durationSeconds = durationSeconds;
    }
  }

  public markCompleted(): void {
    this.props.status = SessionStatus.COMPLETED;
    this.props.errorMessage = null;
  }

  public markFailed(errorMessage: string): void {
    this.props.status = SessionStatus.FAILED;
    this.props.errorMessage = errorMessage.substring(0, 500);
  }

  public purgeAudio(): void {
    this.props.storagePath = null;
    this.props.isAudioPurged = true;
  }

  public isExpired(now: Date = new Date()): boolean {
    return this.props.audioExpiresAt.getTime() <= now.getTime();
  }

  public canAccess(userId?: string | null, guestTokenHash?: string | null): boolean {
    if (this.props.userId && userId && this.props.userId === userId) {
      return true;
    }
    if (this.props.guestTokenHash && guestTokenHash && this.props.guestTokenHash === guestTokenHash) {
      return true;
    }
    return !this.props.userId && !this.props.guestTokenHash;
  }
}
