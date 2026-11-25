import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { GenerateMeetingAnalysis } from "../../../application/use-cases/meetingAnalysis/GenerateMeetingAnalysis.js";
import { GetMeetingAnalysis } from "../../../application/use-cases/meetingAnalysis/GetMeetingAnalysis.js";
import { UpdateMeetingAnalysisTitle } from "../../../application/use-cases/meetingAnalysis/UpdateMeetingAnalysisTitle.js";
import { MeetingAnalysisJobs } from "../../../application/services/MeetingAnalysisJobs.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import type { MeetingAnalysis } from "../../../domain/entities/MeetingAnalysis.js";
import type { MeetingAnalysisDto } from "@audio-to-text/shared";

function toAnalysisDto(result: MeetingAnalysis): MeetingAnalysisDto {
  return {
    id: result.id,
    sessionId: result.sessionId,
    title: result.title ?? undefined,
    projectContext: result.projectContext ?? undefined,
    summary: result.summary,
    alreadyResolved: result.alreadyResolved,
    inProgress: result.inProgress,
    keyDecisions: result.keyDecisions,
    topicsDiscussed: result.topicsDiscussed,
    globalOpenQuestions: result.globalOpenQuestions,
    issues: result.issues,
    backlog: result.backlog,
    repoHoursTotals: result.repoHoursTotals ?? undefined,
    generationMeta: result.generationMeta ?? null,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString()
  };
}

export class MeetingAnalysisController {
  constructor(
    private generateMeetingAnalysis: GenerateMeetingAnalysis,
    private getMeetingAnalysis: GetMeetingAnalysis,
    private updateMeetingAnalysisTitle?: UpdateMeetingAnalysisTitle,
    private analysisJobs: MeetingAnalysisJobs = new MeetingAnalysisJobs()
  ) {}

  /**
   * Valida al instante (404/403/400) y arranca el análisis en segundo plano: responde 202 con el jobId.
   * Una petición HTTP larga se corta a los 8 minutos y un análisis de una reunión extensa tarda más.
   */
  public generate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const { title, projectContext, provider, apiKey, model, baseUrl, profileId } = req.body || {};

      await this.generateMeetingAnalysis.assertCanGenerate({ sessionId, userId, guestTokenHash });

      const job = this.analysisJobs.start(sessionId, async (onProgress) => {
        const result = await this.generateMeetingAnalysis.execute({
          sessionId,
          userId,
          guestTokenHash,
          title,
          projectContext,
          provider,
          apiKey,
          model,
          baseUrl,
          profileId,
          onProgress
        });
        return toAnalysisDto(result);
      });

      res.status(202).json({ success: true, data: { jobId: job.jobId } });
    } catch (err) {
      next(err);
    }
  };

  /** Estado de un trabajo de análisis (solo quien tiene acceso a la sesión puede consultarlo). */
  public getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const jobId = req.params["jobId"]!;
      await this.generateMeetingAnalysis.assertCanAccess(this.accessInput(req, sessionId));

      const job = this.analysisJobs.get(jobId);
      if (!job || job.sessionId !== sessionId) {
        throw new NotFoundError("Trabajo de análisis", jobId);
      }

      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  };

  /** Trabajo de análisis en curso de la sesión, o null. Permite retomar el seguimiento tras recargar. */
  public getActiveJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      await this.generateMeetingAnalysis.assertCanAccess(this.accessInput(req, sessionId));

      res.json({ success: true, data: this.analysisJobs.getRunningForSession(sessionId) });
    } catch (err) {
      next(err);
    }
  };

  private accessInput(req: Request, sessionId: string) {
    const guestToken = req.guestToken;
    return {
      sessionId,
      userId: req.user?.userId || null,
      guestTokenHash: guestToken ? crypto.createHash("sha256").update(guestToken).digest("hex") : null
    };
  }

  public get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const result = await this.getMeetingAnalysis.execute({
        sessionId,
        userId,
        guestTokenHash
      });

      if (!result) {
        res.json({
          success: true,
          data: null
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: result.id,
          sessionId: result.sessionId,
          title: result.title,
          projectContext: result.projectContext,
          summary: result.summary,
          alreadyResolved: result.alreadyResolved,
          inProgress: result.inProgress,
          keyDecisions: result.keyDecisions,
          topicsDiscussed: result.topicsDiscussed,
          globalOpenQuestions: result.globalOpenQuestions,
          issues: result.issues,
          backlog: result.backlog,
          repoHoursTotals: result.repoHoursTotals,
          generationMeta: result.generationMeta ?? null,
          createdAt: result.createdAt.toISOString(),
          updatedAt: result.updatedAt.toISOString()
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public updateTitle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!this.updateMeetingAnalysisTitle) {
        throw new Error("Caso de uso de actualización de título no configurado.");
      }

      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const { title } = req.body;

      const result = await this.updateMeetingAnalysisTitle.execute({
        sessionId,
        userId,
        guestTokenHash,
        title
      });

      res.json({
        success: true,
        data: {
          id: result.id,
          sessionId: result.sessionId,
          title: result.title
        }
      });
    } catch (err) {
      next(err);
    }
  };
}
