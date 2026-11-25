import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { MeetingBotConfigManager } from "../../../infrastructure/bot/MeetingBotConfigManager.js";

const UpdateBotConfigSchema = z.object({
  botDisplayName: z.string().min(1).max(100).optional(),
  botAvatarUrl: z.string().url().or(z.string().min(1)).optional(),
  botPreferredBrowser: z.enum(["auto", "brave", "chrome", "msedge"]).optional(),
  botGoogleAccountEmail: z.string().optional(),
  botAutoRecord: z.boolean().optional(),
  botMuteOnJoin: z.boolean().optional(),
  botGenerateDocx: z.boolean().optional(),
  botGenerateExcel: z.boolean().optional(),
  botDefaultPlatform: z.enum(["AUTO", "GOOGLE_MEET", "MICROSOFT_TEAMS", "ZOOM"]).optional(),
  botLanguage: z.string().optional(),
  botOutputDir: z.string().max(500).optional()
});

export function createBotRoutes(): Router {
  const router = Router();
  const manager = MeetingBotConfigManager.getInstance();

  router.get("/status", (_req: Request, res: Response) => {
    const status = manager.getStatus();
    res.json({ success: true, data: status });
  });

  router.get("/config", (_req: Request, res: Response) => {
    const config = manager.getConfig();
    res.json({ success: true, data: config });
  });

  router.put("/config", (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateBotConfigSchema.parse(req.body);
      const updated = manager.updateConfig(parsed);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = manager.launchLoginBrowser();
      res.json({ success: true, message: result.message });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/unlink", (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = manager.unlinkGoogleAccount();
      res.json({ success: true, message: result.message });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
