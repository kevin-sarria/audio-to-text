import { Redis } from "ioredis";
import {
  IEventPublisher,
  SessionEventPayload
} from "../../domain/services/IEventPublisher.js";
import { env } from "../config/env.js";

export class SseEventPublisher implements IEventPublisher {
  private publisher: Redis;
  private subscriber: Redis;

  constructor() {
    this.publisher = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      lazyConnect: true
    });

    this.subscriber = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      lazyConnect: true
    });
  }

  public async publishSessionEvent(payload: SessionEventPayload): Promise<void> {
    const channel = `session:${payload.sessionId}`;
    const message = JSON.stringify(payload);
    await this.publisher.publish(channel, message);
  }

  public async subscribeSessionEvents(
    sessionId: string,
    callback: (event: SessionEventPayload) => void
  ): Promise<() => void> {
    const channel = `session:${sessionId}`;

    const handler = (ch: string, message: string) => {
      if (ch === channel) {
        try {
          const parsed = JSON.parse(message) as SessionEventPayload;
          callback(parsed);
        } catch (e) {
          console.error("Error al deserializar evento SSE:", e);
        }
      }
    };

    this.subscriber.on("message", handler);
    await this.subscriber.subscribe(channel);

    return async () => {
      this.subscriber.off("message", handler);
      await this.subscriber.unsubscribe(channel).catch(() => {});
    };
  }
}
