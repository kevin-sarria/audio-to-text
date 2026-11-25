import type { ActionItemWithMeetingDto } from "@audio-to-text/shared";

export interface PendingGroup {
  sessionId: string;
  sessionTitle: string;
  occurredAt: string;
  items: ActionItemWithMeetingDto[];
}

/** Agrupa los puntos de acción por reunión conservando el orden de aparición. */
export function groupBySession(items: ActionItemWithMeetingDto[]): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const item of items) {
    let group = groups.get(item.sessionId);
    if (!group) {
      group = { sessionId: item.sessionId, sessionTitle: item.sessionTitle, occurredAt: item.occurredAt, items: [] };
      groups.set(item.sessionId, group);
    }
    group.items.push(item);
  }
  return Array.from(groups.values());
}
