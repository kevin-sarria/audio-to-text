export const MIN_SEARCH_LENGTH = 2;

/** Texto a enviar como `q`, o undefined si es demasiado corto para buscar. */
export function normalizeQueryInput(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : undefined;
}

export interface HighlightPart {
  text: string;
  highlight: boolean;
}

/** Parte un fragmento en trozos normales y resaltados a partir de sus rangos [inicio, fin). Sin HTML. */
export function splitHighlight(snippet: { text: string; ranges: [number, number][] }): HighlightPart[] {
  const { text } = snippet;
  const ranges = snippet.ranges
    .map(([a, b]): [number, number] => [Math.max(0, Math.min(a, text.length)), Math.max(0, Math.min(b, text.length))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const [a, b] of ranges) {
    if (a < cursor) continue;
    if (a > cursor) parts.push({ text: text.slice(cursor, a), highlight: false });
    parts.push({ text: text.slice(a, b), highlight: true });
    cursor = b;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlight: false });
  return parts.length > 0 ? parts : [{ text, highlight: false }];
}
