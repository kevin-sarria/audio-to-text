export const MIN_TERM_LENGTH = 2;
export const MAX_TERMS = 5;

/** Quita tildes y pasa a minúsculas un carácter; si el resultado cambia de longitud conserva el original. */
function foldCodePoint(cp: string): string {
  const folded = cp.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return folded.length === cp.length ? folded : cp;
}

/** Normaliza para buscar. Conserva la longitud UTF-16: una posición del texto normalizado vale para el original. */
export function normalizeSearchText(text: string): string {
  let out = "";
  for (const cp of text) out += foldCodePoint(cp);
  return out;
}

/** Términos de búsqueda: normalizados, de al menos 2 letras, sin repetir y como máximo 5. */
export function parseSearchQuery(q: string | undefined): string[] {
  if (!q) return [];
  const terms: string[] = [];
  for (const raw of normalizeSearchText(q).split(/\s+/)) {
    if (raw.length < MIN_TERM_LENGTH || terms.includes(raw)) continue;
    terms.push(raw);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/** Escapa los comodines de LIKE (usar con `ESCAPE '\'`). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Junta todos los valores de texto de un JSON (no las claves). Devuelve "" si no es JSON válido. */
export function flattenJsonText(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "";
  }
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(parsed);
  return parts.join(" ");
}
