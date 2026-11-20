import crypto from "node:crypto";
import { SessionStatus } from "../../../domain/value-objects/SessionStatus.js";
import { TranscriptionSession } from "../../../domain/entities/TranscriptionSession.js";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IJobQueue } from "../../../domain/services/IJobQueue.js";
import { IStorageService } from "../../../domain/services/IStorageService.js";
import { safeAudioExtension } from "../../../domain/value-objects/AudioFormat.js";

export interface CreateTranscriptionSessionInput {
  userId?: string | null;
  projectFolderId?: string | null;
  file: {
    originalName: string;
    mimeType: string;
    size: number;
    buffer?: Buffer;
    tempPath?: string;
  };
  sourceLanguage?: string;
}

export interface CreateTranscriptionSessionOutput {
  session: TranscriptionSession;
  guestToken?: string;
}

export class CreateTranscriptionSession {
  constructor(
    private sessionRepository: ISessionRepository,
    private storageService: IStorageService,
    private jobQueue: IJobQueue,
    private retentionHours: number = 48
  ) {}

  public async execute(
    input: CreateTranscriptionSessionInput
  ): Promise<CreateTranscriptionSessionOutput> {
    const sessionId = crypto.randomUUID();
    // La extensión es el único dato del usuario en la clave: solo se aceptan las de la lista permitida
    const extension = safeAudioExtension(input.file.originalName);
    const storageKey = `raw/${sessionId}.${extension}`;

    // Almacenar el archivo de audio usando el servicio de almacenamiento
    let storagePath: string;
    if (input.file.buffer) {
      storagePath = await this.storageService.save(input.file.buffer, storageKey);
    } else if (input.file.tempPath) {
      storagePath = await this.storageService.save(input.file.tempPath, storageKey);
    } else {
      throw new Error("No se proporcionó archivo de audio válido.");
    }

    const now = new Date();
    const audioExpiresAt = new Date(now.getTime() + this.retentionHours * 60 * 60 * 1000);

    let guestToken: string | undefined;
    let guestTokenHash: string | undefined;

    if (!input.userId) {
      guestToken = crypto.randomBytes(32).toString("hex");
      guestTokenHash = crypto.createHash("sha256").update(guestToken).digest("hex");
    }

    const session = new TranscriptionSession({
      id: sessionId,
      userId: input.userId,
      guestTokenHash,
      projectFolderId: input.projectFolderId || null,
      originalFileName: input.file.originalName,
      fileFormat: extension,
      durationSeconds: null,
      fileSizeBytes: BigInt(input.file.size),
      storagePath,
      audioExpiresAt,
      isAudioPurged: false,
      status: SessionStatus.PENDING,
      sourceLanguage: input.sourceLanguage || null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now
    });

    const savedSession = await this.sessionRepository.create(session);

    // Encolar al preprocesador (W1)
    await this.jobQueue.enqueuePreprocess({
      sessionId: savedSession.id,
      inputPath: storagePath
    });

    return {
      session: savedSession,
      guestToken
    };
  }
}
