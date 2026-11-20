import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { CreateTranscriptionSession } from "../../../application/use-cases/transcription/CreateTranscriptionSession.js";
import { GetSession } from "../../../application/use-cases/transcription/GetSession.js";
import { ListSessions } from "../../../application/use-cases/transcription/ListSessions.js";
import { RenameSpeaker } from "../../../application/use-cases/transcription/RenameSpeaker.js";
import { DeleteSession } from "../../../application/use-cases/transcription/DeleteSession.js";
import { LinkSessionToProjectFolder } from "../../../application/use-cases/transcription/LinkSessionToProjectFolder.js";
import { UnauthorizedError } from "../../../domain/errors/UnauthorizedError.js";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IStorageService } from "../../../domain/services/IStorageService.js";
import { IJobQueue } from "../../../domain/services/IJobQueue.js";
import { SessionStatus } from "../../../domain/value-objects/SessionStatus.js";

export class SessionController {
  constructor(
    private createTranscriptionSession: CreateTranscriptionSession,
    private getSession: GetSession,
    private listSessions: ListSessions,
    private renameSpeakerUseCase: RenameSpeaker,
    private deleteSession: DeleteSession,
    private linkSessionToProjectFolder?: LinkSessionToProjectFolder,
    private sessionRepository?: ISessionRepository,
    private storageService?: IStorageService,
    private jobQueue?: IJobQueue
  ) {}

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        throw new Error("No se ha proporcionado archivo.");
      }

      const userId = req.user?.userId || null;
      const { sourceLanguage, projectFolderId } = req.body;

      const result = await this.createTranscriptionSession.execute({
        userId,
        projectFolderId: projectFolderId || null,
        file: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          buffer: file.buffer
        },
        sourceLanguage
      });

      res.status(202).json({
        success: true,
        data: {
          id: result.session.id,
          originalFileName: result.session.originalFileName,
          projectFolderId: result.session.projectFolderId,
          status: result.session.status,
          audioExpiresAt: result.session.audioExpiresAt.toISOString(),
          fileSizeBytes: result.session.fileSizeBytes.toString(),
          guestToken: result.guestToken
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError("Debe iniciar sesión para consultar el historial.");
      }

      const page = req.query["page"] ? Number(req.query["page"]) : 1;
      const limit = req.query["limit"] ? Number(req.query["limit"]) : 20;

      const result = await this.listSessions.execute({
        userId: req.user.userId,
        page,
        limit
      });

      res.json({
        success: true,
        data: result.sessions.map((s) => ({
          id: s.id,
          originalFileName: s.originalFileName,
          projectFolderId: s.projectFolderId,
          status: s.status,
          durationSeconds: s.durationSeconds,
          fileSizeBytes: s.fileSizeBytes.toString(),
          audioExpiresAt: s.audioExpiresAt.toISOString(),
          isAudioPurged: s.isAudioPurged,
          createdAt: s.createdAt.toISOString()
        })),
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const session = await this.getSession.execute({
        sessionId,
        userId,
        guestTokenHash
      });

      res.json({
        success: true,
        data: {
          id: session.id,
          originalFileName: session.originalFileName,
          projectFolderId: session.projectFolderId,
          fileFormat: session.fileFormat,
          durationSeconds: session.durationSeconds,
          fileSizeBytes: session.fileSizeBytes.toString(),
          audioExpiresAt: session.audioExpiresAt.toISOString(),
          isAudioPurged: session.isAudioPurged,
          status: session.status,
          sourceLanguage: session.sourceLanguage,
          errorMessage: session.errorMessage,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
          speakers: session.speakers.map((sp) => ({
            id: sp.id,
            sessionId: sp.sessionId,
            label: sp.label,
            customName: sp.customName
          })),
          segments: session.segments.map((seg) => ({
            id: seg.id,
            sessionId: seg.sessionId,
            speakerId: seg.speakerId,
            startTimeMs: seg.startTimeMs,
            endTimeMs: seg.endTimeMs,
            content: seg.content,
            confidenceScore: seg.confidenceScore
          }))
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public renameSpeaker = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const speakerId = req.params["speakerId"]!;
      const { customName } = req.body;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const updatedSpeaker = await this.renameSpeakerUseCase.execute({
        sessionId,
        speakerId,
        customName,
        userId,
        guestTokenHash
      });

      res.json({
        success: true,
        data: {
          id: updatedSpeaker.id,
          label: updatedSpeaker.label,
          customName: updatedSpeaker.customName,
          displayName: updatedSpeaker.displayName
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      await this.deleteSession.execute({
        sessionId,
        userId,
        guestTokenHash
      });

      res.json({
        success: true,
        message: "Sesión eliminada correctamente."
      });
    } catch (err) {
      next(err);
    }
  };

  public updateProjectFolder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!this.linkSessionToProjectFolder) {
        throw new Error("Caso de uso de enlace a proyecto no disponible.");
      }

      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const { projectFolderId } = req.body;

      const updated = await this.linkSessionToProjectFolder.execute({
        sessionId,
        projectFolderId: projectFolderId || null,
        userId,
        guestTokenHash
      });

      res.json({
        success: true,
        data: {
          id: updated.id,
          projectFolderId: updated.projectFolderId
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public retry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!this.sessionRepository || !this.storageService || !this.jobQueue) {
        throw new Error("Servicios de reintento no configurados en este entorno.");
      }

      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const session = await this.sessionRepository.findById(sessionId);
      if (!session) {
        res.status(404).json({ success: false, message: "Sesión no encontrada." });
        return;
      }

      if (!session.canAccess(userId, guestTokenHash)) {
        throw new UnauthorizedError("No tienes permisos para reintentar esta sesión.");
      }

      if (session.status !== SessionStatus.FAILED) {
        res.status(400).json({
          success: false,
          message: "Solo se pueden reintentar sesiones en estado fallido (FAILED)."
        });
        return;
      }

      if (!session.storagePath || !(await this.storageService.exists(session.storagePath))) {
        res.status(400).json({
          success: false,
          message: "El archivo de audio original ya no se encuentra en el almacenamiento para ser reprocesado."
        });
        return;
      }

      session.resetToPending();
      await this.sessionRepository.update(session);

      await this.jobQueue.enqueuePreprocess({
        sessionId: session.id,
        inputPath: session.storagePath
      });

      res.json({
        success: true,
        message: "Sesión reenviada a procesamiento.",
        data: {
          id: session.id,
          status: session.status
        }
      });
    } catch (err) {
      next(err);
    }
  };
}
