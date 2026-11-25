import { Router, Request, Response, NextFunction } from "express";
import { ActionItemsQuerySchema, LibrarySessionsQuerySchema, UpdateActionItemSchema, type ActionItemsQuery, type LibrarySessionsQuery } from "@audio-to-text/shared";
import { validateBody, validateQuery } from "../../../interfaces/http/middlewares/validate.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import type { ImportBotMeetings } from "../../library/ImportBotMeetings.js";
import type { SqliteLibraryRepository } from "../../infrastructure/sqlite/SqliteLibraryRepository.js";

export interface LibraryRoutesDeps {
  importBotMeetings: Pick<ImportBotMeetings, "execute">;
  libraryRepository: SqliteLibraryRepository;
}

export function createLibraryRoutes(deps: LibraryRoutesDeps): Router {
  const router = Router();

  router.post("/library/import", (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = deps.importBotMeetings.execute(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/library/sessions",
    validateQuery(LibrarySessionsQuerySchema),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = req.query as unknown as LibrarySessionsQuery;
        const { items, total } = deps.libraryRepository.listSessions({ userId: req.user!.userId, ...query });
        res.json({
          success: true,
          data: items,
          meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/library/sessions/:id/meeting-summary", (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params["id"]!;
      if (!deps.libraryRepository.sessionExistsForUser(req.user!.userId, sessionId)) {
        throw new NotFoundError("Sesión de transcripción", sessionId);
      }
      res.json({ success: true, data: deps.libraryRepository.getMeetingSummary(sessionId) });
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/library/action-items/:id",
    validateBody(UpdateActionItemSchema),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const itemId = req.params["id"]!;
        const item = deps.libraryRepository.setActionItemDone(req.user!.userId, itemId, req.body.done);
        if (!item) throw new NotFoundError("Punto de acción", itemId);
        res.json({ success: true, data: item });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/library/participants", (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: deps.libraryRepository.listParticipants(req.user!.userId) });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/library/action-items",
    validateQuery(ActionItemsQuerySchema),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = req.query as unknown as ActionItemsQuery;
        const { items, total, openTotal } = deps.libraryRepository.listActionItems({ userId: req.user!.userId, ...query });
        res.json({
          success: true,
          data: items,
          meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit), openTotal }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/library/action-items/owners", (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: deps.libraryRepository.listOwners(req.user!.userId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
