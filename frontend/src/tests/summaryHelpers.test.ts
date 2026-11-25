import { describe, it, expect } from "vitest";
import {
  applyActionItemDone,
  effectiveTab,
  restoreActionItem,
  findSegmentIdAtSeconds,
  findSegmentIdByQuote,
  formatSeconds,
  normalizeForMatch
} from "../features/library/summaryHelpers.js";
import type { MeetingSummaryDto } from "@audio-to-text/shared";

const segments = [
  { id: "s1", startTimeMs: 0, content: "Vamos a migrar la base de datos el viernes." },
  { id: "s2", startTimeMs: 12000, content: "Yo me encargo de preparar el script de migración." },
  { id: "s3", startTimeMs: 30000, content: "Perfecto, ¿alguien sabe quién aprueba el presupuesto?" }
];

describe("summaryHelpers", () => {
  it("formatSeconds da mm:ss y h:mm:ss", () => {
    expect(formatSeconds(0)).toBe("00:00");
    expect(formatSeconds(75)).toBe("01:15");
    expect(formatSeconds(3725)).toBe("1:02:05");
    expect(formatSeconds(-3)).toBe("00:00");
  });

  it("normalizeForMatch ignora mayúsculas, tildes y espacios repetidos", () => {
    expect(normalizeForMatch("  Migración   DE  Datos ")).toBe("migracion de datos");
  });

  it("findSegmentIdByQuote encuentra el segmento que contiene la cita, sin importar tildes ni mayúsculas", () => {
    expect(findSegmentIdByQuote(segments, "yo me encargo de preparar el script de MIGRACION")).toBe("s2");
    expect(findSegmentIdByQuote(segments, "alguien sabe quién aprueba")).toBe("s3");
    expect(findSegmentIdByQuote(segments, "frase que nadie dijo")).toBeNull();
    expect(findSegmentIdByQuote(segments, "   ")).toBeNull();
  });

  it("findSegmentIdAtSeconds devuelve el segmento en curso (el último que empezó) o el primero", () => {
    expect(findSegmentIdAtSeconds(segments, 0)).toBe("s1");
    expect(findSegmentIdAtSeconds(segments, 11)).toBe("s1");
    expect(findSegmentIdAtSeconds(segments, 12)).toBe("s2");
    expect(findSegmentIdAtSeconds(segments, 500)).toBe("s3");
    expect(findSegmentIdAtSeconds([], 5)).toBeNull();
  });

  it("applyActionItemDone actualiza solo el punto indicado sin mutar el original", () => {
    const summary = {
      sessionId: "x",
      actionItems: [
        { id: "a", done: false, doneAt: null },
        { id: "b", done: false, doneAt: null }
      ]
    } as unknown as MeetingSummaryDto;

    const next = applyActionItemDone(summary, "b", true, "2026-11-26T10:00:00.000Z");

    expect(next.actionItems.map((i) => [i.id, i.done, i.doneAt])).toEqual([
      ["a", false, null],
      ["b", true, "2026-11-26T10:00:00.000Z"]
    ]);
    expect(summary.actionItems[1]!.done).toBe(false);
  });
});

describe("tab y rollback", () => {
  it("effectiveTab cae a transcript si no hay resumen", () => {
    expect(effectiveTab("summary", false)).toBe("transcript");
    expect(effectiveTab("summary", true)).toBe("summary");
    expect(effectiveTab("analysis", false)).toBe("analysis");
  });

  it("restoreActionItem devuelve done y doneAt exactos del snapshot sin mutar", () => {
    const summary = {
      actionItems: [
        { id: "a", done: false, doneAt: null },
        { id: "b", done: false, doneAt: null }
      ]
    } as unknown as MeetingSummaryDto;
    const snap = { id: "b", done: true, doneAt: "2026-01-01T00:00:00.000Z" } as never;
    const next = restoreActionItem(summary, snap);
    expect(next.actionItems[1]).toMatchObject({ id: "b", done: true, doneAt: "2026-01-01T00:00:00.000Z" });
    expect(summary.actionItems[1]!.done).toBe(false);
  });
});
