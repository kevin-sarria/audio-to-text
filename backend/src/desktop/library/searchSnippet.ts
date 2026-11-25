import { normalizeSearchText } from "./searchText.js";

export interface SnippetResult {
  text: string;
  ranges: [number, number][];
}

const CONTEXT = 60;

/** Fragmento alrededor de la primera coincidencia, tomado del texto original, con los rangos a resaltar. */
export function buildSnippet(original: string, terms: string[]): SnippetResult | null {
  const normalized = normalizeSearchText(original);

  let first = -1;
  let firstLen = 0;
  for (const term of terms) {
    const i = normalized.indexOf(term);
    if (i !== -1 && (first === -1 || i < first)) {
      first = i;
      firstLen = term.length;
    }
  }
  if (first === -1) return null;

  let start = Math.max(0, first - CONTEXT);
  let end = Math.min(original.length, first + firstLen + CONTEXT);
  // no cortar un par sustituto (emoji) por la mitad
  if (start > 0 && original.charCodeAt(start) >= 0xdc00 && original.charCodeAt(start) <= 0xdfff) start++;
  if (end < original.length && original.charCodeAt(end - 1) >= 0xd800 && original.charCodeAt(end - 1) <= 0xdbff) end--;

  const prefix = start > 0 ? "…" : "";
  const suffix = end < original.length ? "…" : "";
  // los saltos de línea pasan a espacios 1 a 1 para no mover las posiciones
  const slice = original.slice(start, end).replace(/[\r\n\t]/g, " ");
  const windowNormalized = normalized.slice(start, end);

  const raw: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const i = windowNormalized.indexOf(term, from);
      if (i === -1) break;
      raw.push([i + prefix.length, i + term.length + prefix.length]);
      from = i + term.length;
    }
  }

  raw.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const ranges: [number, number][] = [];
  for (const r of raw) {
    const last = ranges[ranges.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else ranges.push([r[0], r[1]]);
  }

  return { text: `${prefix}${slice}${suffix}`, ranges };
}
