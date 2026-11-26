import { useCallback, useEffect, useRef, useState } from "react";
import type { BotSessionDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { isActiveState } from "./botSessionView.js";
import { botBase } from "./botApi.js";

const POLL_MS = 2000;

export function useBotSession() {
  const [session, setSession] = useState<BotSessionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);
  const lastState = useRef<string | null>(null);

  // Una sola vez por transición a ENDED se avisa a la biblioteca para que se actualice.
  const apply = useCallback((next: BotSessionDto) => {
    if (next.state === "ENDED" && lastState.current !== "ENDED" && typeof window !== "undefined") {
      window.dispatchEvent(new Event("library:changed"));
    }
    // Un estado nuevo hace obsoleto el error del intento anterior.
    if (lastState.current !== next.state) setError(null);
    lastState.current = next.state;
    setSession(next);
  }, []);

  const refresh = useCallback(async () => {
    const id = ++counter.current;
    try {
      const res = await api.get<{ success: boolean; data: BotSessionDto }>(`${botBase()}/session`);
      if (id === counter.current && res.success) apply(res.data);
    } catch {
      /* el siguiente ciclo lo reintenta */
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const join = useCallback(async (url: string) => {
    setError(null);
    ++counter.current;
    try {
      const res = await api.post<{ success: boolean; data: BotSessionDto }>(`${botBase()}/join`, { url });
      if (res.success) apply(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [apply]);

  const leave = useCallback(async () => {
    setError(null);
    ++counter.current;
    try {
      const res = await api.post<{ success: boolean; data: BotSessionDto }>(`${botBase()}/leave`);
      if (res.success) apply(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [apply]);

  return { session, error, join, leave, active: session ? isActiveState(session.state) : false };
}
