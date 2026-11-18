export interface SseSessionEvent {
  sessionId: string;
  type: "status" | "progress" | "completed" | "failed";
  data: Record<string, unknown>;
}

export function connectSessionSse(
  sessionId: string,
  onEvent: (event: SseSessionEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const url = `/api/events/sessions/${sessionId}`;
  const eventSource = new EventSource(url, { withCredentials: true });

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type !== "connected") {
        onEvent(data);
      }
    } catch (e) {
      console.error("Error al procesar mensaje SSE:", e);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) {
      onError(err);
    }
  };

  return () => {
    eventSource.close();
  };
}
