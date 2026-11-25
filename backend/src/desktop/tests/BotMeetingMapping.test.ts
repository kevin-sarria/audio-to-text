import { describe, it, expect } from "vitest";
import { buildSegmentTimings, formatMeetingTitle, computeDurationSeconds } from "../library/botMeetingMapping.js";
import { makeDelivery } from "../../tests/helpers/botMeetingFixtures.js";

describe("botMeetingMapping", () => {
  it("cada segmento termina donde empieza el siguiente; el último se estima por palabras", () => {
    const t = buildSegmentTimings(makeDelivery().utterances);
    expect(t[0]).toEqual({ startMs: 0, endMs: 12000 });
    expect(t[1]).toEqual({ startMs: 12000, endMs: 30000 });
    // "Perfecto, ¿alguien sabe quién aprueba el presupuesto?" = 7 palabras → 2,8 s
    expect(t[2]).toEqual({ startMs: 30000, endMs: 32800 });
  });

  it("garantiza end > start con offsets iguales y un mínimo de 1000 ms", () => {
    const t = buildSegmentTimings([
      { speakerName: "A", text: "uno dos tres cuatro cinco", offsetSec: 5 },
      { speakerName: "B", text: "hola", offsetSec: 5 }
    ]);
    expect(t[0]).toEqual({ startMs: 5000, endMs: 7000 }); // 5 palabras / 2,5 = 2 s
    expect(t[1]).toEqual({ startMs: 5000, endMs: 6000 }); // 1 palabra → mínimo 1000 ms
    for (const seg of t) expect(seg.endMs).toBeGreaterThan(seg.startMs);
  });

  it("limita la estimación del último turno a 30 s", () => {
    const longText = Array.from({ length: 300 }, () => "palabra").join(" ");
    const t = buildSegmentTimings([{ speakerName: "A", text: longText, offsetSec: 0 }]);
    expect(t[0]).toEqual({ startMs: 0, endMs: 30000 });
  });

  it("el título lleva plataforma y fecha local; la duración usa inicio/fin o el último segmento", () => {
    const title = formatMeetingTitle("MICROSOFT_TEAMS", "2026-11-25T14:00:00.000Z");
    expect(title.startsWith("Reunión Microsoft Teams ")).toBe(true);
    expect(title).toMatch(/\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);

    expect(computeDurationSeconds(makeDelivery(), 32800)).toBe(1800);
    const invalid = makeDelivery({ endedAt: "2026-11-25T13:00:00.000Z" }); // termina antes de empezar
    expect(computeDurationSeconds(invalid, 32800)).toBe(33);
  });
});
