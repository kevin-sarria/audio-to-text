import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BOT_PLATFORMS, type MeetingBotStatusDto } from "@audio-to-text/shared";
import { BotSessionError, type BotSessionService } from "../../bot/BotSessionService.js";
import type { BotSettingsStore } from "../../bot/BotSettingsStore.js";
import type { BotLoginService } from "../../bot/BotLoginService.js";

const JoinSchema = z.object({ url: z.string().min(1).max(2000) });

const ConfigSchema = z.object({
  botDisplayName: z.string().min(1).max(100).optional(),
  botAvatarUrl: z.string().min(1).optional(),
  botPreferredBrowser: z.enum(["auto", "brave", "chrome", "msedge"]).optional(),
  botGoogleAccountEmail: z.string().optional(),
  botAutoRecord: z.boolean().optional(),
  botMuteOnJoin: z.boolean().optional(),
  botGenerateDocx: z.boolean().optional(),
  botGenerateExcel: z.boolean().optional(),
  botDefaultPlatform: z.enum(["AUTO", "GOOGLE_MEET", "MICROSOFT_TEAMS", "ZOOM"]).optional(),
  botLanguage: z.string().optional(),
  botOutputDir: z.string().max(500).optional(),
  botAllowedPlatforms: z.array(z.enum(BOT_PLATFORMS as unknown as [string, ...string[]])).optional(),
  botAllowedDomains: z.array(z.string().max(255)).max(50).optional()
});

export interface DesktopBotRoutesDeps {
  sessions: BotSessionService;
  settings: BotSettingsStore;
  login: BotLoginService;
}

export function createDesktopBotRoutes(deps: DesktopBotRoutesDeps): Router {
  const router = Router();
  const { sessions, settings, login } = deps;

  const fail = (res: Response, err: unknown, next: NextFunction) => {
    if (err instanceof BotSessionError) {
      const status = err.code === "URL_NOT_ALLOWED" ? 400 : 409;
      return res.status(status).json({ success: false, error: err.message, code: err.code });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.issues.map((i) => i.message).join("; ") });
    }
    return next(err);
  };

  const busy = (res: Response): boolean => {
    if (login.isVerifying()) {
      res.status(409).json({ success: false, error: "Se está verificando la sesión de Google. Espera a que termine.", code: "BUSY" });
      return true;
    }
    if (!sessions.isActive()) return false;
    res.status(409).json({ success: false, error: "El bot está en una reunión. Termínala antes de cambiar la sesión de Google.", code: "BUSY" });
    return true;
  };

  router.get("/session", (_req, res) => {
    res.json({ success: true, data: sessions.current() });
  });

  router.post("/join", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (login.isVerifying()) {
        return void res.status(409).json({ success: false, error: "Se está verificando la sesión de Google. Espera a que termine.", code: "BUSY" });
      }
      const { url } = JoinSchema.parse(req.body ?? {});
      res.json({ success: true, data: await sessions.join(url) });
    } catch (err) {
      fail(res, err, next);
    }
  });

  router.post("/leave", async (_req, res, next) => {
    try {
      res.json({ success: true, data: await sessions.leave() });
    } catch (err) {
      fail(res, err, next);
    }
  });

  router.get("/status", (_req, res) => {
    const config = settings.get();
    const browser = login.browserInfo();
    const check = login.lastCheck();
    const session = sessions.current();
    const data: MeetingBotStatusDto = {
      config,
      isGoogleAccountLinked: check?.linked ?? false,
      linkedGoogleEmail: check?.email ?? null,
      loginChecked: check !== null,
      detectedBrowserName: browser.name,
      detectedBrowserPath: browser.path,
      isMeetingActive: sessions.isActive(),
      activeSessionId: null,
      activeMeetingUrl: sessions.isActive() ? session.meetingUrl : null
    };
    res.json({ success: true, data });
  });

  router.get("/config", (_req, res) => {
    res.json({ success: true, data: settings.get() });
  });

  router.put("/config", (req, res, next) => {
    try {
      const parsed = ConfigSchema.parse(req.body ?? {});
      res.json({ success: true, data: settings.update(parsed as Parameters<BotSettingsStore["update"]>[0]) });
    } catch (err) {
      fail(res, err, next);
    }
  });

  router.post("/login", (_req, res) => {
    if (busy(res)) return;
    try {
      res.json({ success: true, message: login.openLoginBrowser().message });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/login/verify", async (_req, res, next) => {
    if (busy(res)) return;
    try {
      res.json({ success: true, data: await login.verify() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/unlink", (_req, res) => {
    if (busy(res)) return;
    const r = login.unlink();
    if (!r.success) return void res.status(409).json({ success: false, error: r.message, code: "UNLINK_INCOMPLETE" });
    res.json({ success: true, message: r.message });
  });

  return router;
}
