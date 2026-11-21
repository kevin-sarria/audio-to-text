import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { GenerateMeetingAnalysis } from "../../../application/use-cases/meetingAnalysis/GenerateMeetingAnalysis.js";
import { GetMeetingAnalysis } from "../../../application/use-cases/meetingAnalysis/GetMeetingAnalysis.js";
import { UpdateMeetingAnalysisTitle } from "../../../application/use-cases/meetingAnalysis/UpdateMeetingAnalysisTitle.js";

export class MeetingAnalysisController {
  constructor(
    private generateMeetingAnalysis: GenerateMeetingAnalysis,
    private getMeetingAnalysis: GetMeetingAnalysis,
    private updateMeetingAnalysisTitle?: UpdateMeetingAnalysisTitle
  ) {}

  public generate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const { title, projectContext, provider, apiKey, model, baseUrl, profileId } = req.body || {};

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
        profileId
      });

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
