export interface SessionEventPayload {
  sessionId: string;
  type: "status" | "progress" | "completed" | "failed";
  data: Record<string, unknown>;
}

export interface IEventPublisher {
  publishSessionEvent(payload: SessionEventPayload): Promise<void>;
  subscribeSessionEvents(
    sessionId: string,
    callback: (event: SessionEventPayload) => void
  ): Promise<() => void>;
}
