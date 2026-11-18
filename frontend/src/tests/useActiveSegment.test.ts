import { describe, it, expect } from "vitest";
import { findActiveSegmentBinarySearch } from "../features/player/useActiveSegment.js";
import { SegmentState } from "../store/transcriberSlice.js";

describe("useActiveSegment / findActiveSegmentBinarySearch Unit Tests", () => {
  const sampleSegments: SegmentState[] = [
    {
      id: "seg-1",
      sessionId: "s1",
      speakerId: "sp1",
      startTimeMs: 1000,
      endTimeMs: 4000,
      content: "Primer segmento de prueba"
    },
    {
      id: "seg-2",
      sessionId: "s1",
      speakerId: "sp2",
      startTimeMs: 5000,
      endTimeMs: 9000,
      content: "Segundo segmento tras una pausa de 1 segundo"
    },
    {
      id: "seg-3",
      sessionId: "s1",
      speakerId: "sp1",
      startTimeMs: 10000,
      endTimeMs: 15000,
      content: "Tercer segmento final"
    }
  ];

  it("encuentra el segmento cuando el tiempo actual se encuentra dentro del intervalo [start, end)", () => {
    // Exactamente en el inicio de seg-1
    expect(findActiveSegmentBinarySearch(sampleSegments, 1000)?.id).toBe("seg-1");

    // En medio de seg-1
    expect(findActiveSegmentBinarySearch(sampleSegments, 2500)?.id).toBe("seg-1");

    // En medio de seg-2
    expect(findActiveSegmentBinarySearch(sampleSegments, 7200)?.id).toBe("seg-2");

    // En medio de seg-3
    expect(findActiveSegmentBinarySearch(sampleSegments, 14999)?.id).toBe("seg-3");
  });

  it("retorna null si el tiempo coincide con el endTimeMs exacto o cae en un silencio entre segmentos", () => {
    // Justo en el límite final de seg-1
    expect(findActiveSegmentBinarySearch(sampleSegments, 4000)).toBeNull();

    // En la pausa entre 4000 y 5000
    expect(findActiveSegmentBinarySearch(sampleSegments, 4500)).toBeNull();

    // En la pausa entre 9000 y 10000
    expect(findActiveSegmentBinarySearch(sampleSegments, 9500)).toBeNull();
  });

  it("retorna null si el tiempo es previo al primer segmento o posterior al último", () => {
    // Antes del primer segmento
    expect(findActiveSegmentBinarySearch(sampleSegments, 500)).toBeNull();

    // Después del último segmento
    expect(findActiveSegmentBinarySearch(sampleSegments, 20000)).toBeNull();
  });

  it("maneja listas vacías de forma segura", () => {
    expect(findActiveSegmentBinarySearch([], 2000)).toBeNull();
  });
});
