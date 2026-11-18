import { EventEmitter } from "node:events";
import {
  IEventPublisher,
  SessionEventPayload
} from "../../../domain/services/IEventPublisher.js";

export class InProcessEventPublisher implements IEventPublisher {
  private emitter = new EventEmitter();

  constructor() {
    // Permitir suficientes oyentes concurrentes para las sesiones activas
    this.emitter.setMaxListeners(100);
  }

  public async publishSessionEvent(payload: SessionEventPayload): Promise<void> {
    this.emitter.emit(`session:${payload.sessionId}`, payload);
  }

  public async subscribeSessionEvents(
    sessionId: string,
    callback: (event: SessionEventPayload) => void
  ): Promise<() => void> {
    const eventName = `session:${sessionId}`;
    this.emitter.on(eventName, callback);

    return () => {
      this.emitter.off(eventName, callback);
    };
  }
}
