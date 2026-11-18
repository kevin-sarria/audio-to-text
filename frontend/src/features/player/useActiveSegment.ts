import { useMemo } from "react";
import { SegmentState } from "../../store/transcriberSlice.js";

/**
 * Realiza una búsqueda binaria para encontrar el segmento activo según el tiempo actual en milisegundos.
 * Los segmentos deben estar ordenados ascendentemente por startTimeMs.
 */
export function findActiveSegmentBinarySearch(
  segments: SegmentState[],
  currentTimeMs: number
): SegmentState | null {
  if (!segments || segments.length === 0) return null;

  let left = 0;
  let right = segments.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const seg = segments[mid]!;

    if (currentTimeMs >= seg.startTimeMs && currentTimeMs < seg.endTimeMs) {
      return seg;
    }

    if (currentTimeMs < seg.startTimeMs) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return null;
}

export function useActiveSegment(
  segments: SegmentState[] = [],
  currentTimeMs: number
): SegmentState | null {
  return useMemo(() => {
    return findActiveSegmentBinarySearch(segments, currentTimeMs);
  }, [segments, currentTimeMs]);
}
