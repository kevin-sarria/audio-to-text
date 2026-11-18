import { Router } from "express";
import { EventsController } from "../controllers/EventsController.js";

export function createEventsRoutes(eventsController: EventsController): Router {
  const router = Router();

  router.get("/sessions/:id", eventsController.streamSessionEvents);

  return router;
}
