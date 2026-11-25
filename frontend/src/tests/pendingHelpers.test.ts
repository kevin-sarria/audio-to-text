import { describe, it, expect } from "vitest";
import { groupBySession } from "../features/library/pendingHelpers.js";
import type { ActionItemWithMeetingDto } from "@audio-to-text/shared";

const item = (id: string, sessionId: string, title: string, occurredAt: string): ActionItemWithMeetingDto => ({
  id, sessionId, task: `Tarea ${id}`, owner: null, dueDate: null, evidence: "cita", done: false, doneAt: null,
  sessionTitle: title, occurredAt
});

describe("groupBySession", () => {
  it("agrupa por reunión conservando el orden de aparición", () => {
    const groups = groupBySession([
      item("a", "s2", "Reunión nueva", "2026-11-20T10:00:00.000Z"),
      item("b", "s2", "Reunión nueva", "2026-11-20T10:00:00.000Z"),
      item("c", "s1", "Reunión vieja", "2026-11-10T10:00:00.000Z")
    ]);
    expect(groups.map((g) => [g.sessionId, g.sessionTitle, g.items.map((i) => i.id)])).toEqual([
      ["s2", "Reunión nueva", ["a", "b"]],
      ["s1", "Reunión vieja", ["c"]]
    ]);
    expect(groups[0]!.occurredAt).toBe("2026-11-20T10:00:00.000Z");
  });

  it("sin elementos devuelve una lista vacía", () => {
    expect(groupBySession([])).toEqual([]);
  });

  it("elementos intercalados de la misma reunión terminan en un solo grupo", () => {
    const groups = groupBySession([
      item("a", "s1", "R1", "2026-11-10T10:00:00.000Z"),
      item("b", "s2", "R2", "2026-11-11T10:00:00.000Z"),
      item("c", "s1", "R1", "2026-11-10T10:00:00.000Z")
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["a", "c"]);
  });
});
