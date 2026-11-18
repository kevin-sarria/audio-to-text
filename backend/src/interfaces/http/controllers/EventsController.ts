import { Request, Response } from "express";
import { IEventPublisher } from "../../../domain/services/IEventPublisher.js";

export class EventsController {
  constructor(private eventPublisher: IEventPublisher) {}

  public streamSessionEvents = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.params["id"]!;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    res.write(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);

    // Mantener la conexión activa con heartbeats
    const heartbeatTimer = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 25000);

    const unsubscribe = await this.eventPublisher.subscribeSessionEvents(sessionId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", async () => {
      clearInterval(heartbeatTimer);
      await unsubscribe();
      res.end();
    });
  };
}
