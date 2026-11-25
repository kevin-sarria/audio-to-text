import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionItemDto, MeetingSummaryDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { applyActionItemDone, restoreActionItem } from "./summaryHelpers.js";

export function useMeetingSummary(sessionId: string, enabled: boolean) {
  const [summary, setSummary] = useState<MeetingSummaryDto | null>(null);
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(new Set());
  const [toggleError, setToggleError] = useState<string | null>(null);
  const summaryRef = useRef<MeetingSummaryDto | null>(null);
  summaryRef.current = summary;
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Al cambiar de sesión (o desactivarse) no debe quedar el resumen de la anterior
    setSummary(null);
    summaryRef.current = null;
    pendingRef.current = new Set();
    setPendingItemIds(new Set());
    setToggleError(null);
    if (!enabled) return;
    let active = true;
    api
      .get<{ success: boolean; data: MeetingSummaryDto | null }>(`/desktop/library/sessions/${sessionId}/meeting-summary`)
      .then((res) => {
        if (active && res.success) setSummary(res.data);
      })
      .catch(() => {
        // Sin resumen o sin conexión: la pestaña simplemente no aparece
      });
    return () => {
      active = false;
    };
  }, [sessionId, enabled]);

  const setPending = (itemId: string, on: boolean) => {
    const next = new Set(pendingRef.current);
    if (on) next.add(itemId);
    else next.delete(itemId);
    pendingRef.current = next;
    setPendingItemIds(next);
  };

  const toggleActionItem = useCallback(async (itemId: string, done: boolean) => {
    if (pendingRef.current.has(itemId)) return;
    const previous = summaryRef.current?.actionItems.find((i) => i.id === itemId);
    if (!previous) return;
    const snapshot: ActionItemDto = { ...previous };
    setPending(itemId, true);
    setToggleError(null);
    // Optimista: se marca al instante y se revierte al estado exacto previo si el servidor falla
    setSummary((prev) => (prev ? applyActionItemDone(prev, itemId, done, done ? new Date().toISOString() : null) : prev));
    try {
      const res = await api.patch<{ success: boolean; data?: ActionItemDto }>(`/desktop/library/action-items/${itemId}`, { done });
      if (!res.success || !res.data) throw new Error("No se pudo actualizar");
      const saved = res.data;
      setSummary((prev) => (prev ? applyActionItemDone(prev, itemId, saved.done, saved.doneAt) : prev));
    } catch {
      setSummary((prev) => (prev ? restoreActionItem(prev, snapshot) : prev));
      setToggleError("No se pudo actualizar la tarea. Inténtalo de nuevo.");
    } finally {
      setPending(itemId, false);
    }
  }, []);

  const clearToggleError = useCallback(() => setToggleError(null), []);

  return { summary, toggleActionItem, pendingItemIds, toggleError, clearToggleError };
}
