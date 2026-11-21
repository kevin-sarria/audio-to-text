/**
 * Búsqueda de citas literales en un archivo, tolerante a lo que cambia al copiar:
 * mayúsculas, tildes, espacios, saltos de línea, comillas y marcas de Markdown.
 * Devuelve la línea donde empieza la cita para completar `fuente: archivo:línea`.
 */

/** Forma comparable de un texto (sin saltos de línea). */
export function normalizeForCite(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [texto](url) → texto
    .replace(/[`*_~#>|«»“”"'‘’]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** Una cita puede venir recortada con «…» o «...»: cada fragmento debe aparecer en orden. */
function citeFragments(cita: string): string[] {
  return cita
    .split(/…|\.\.\.|\[\s*\.\.\.\s*\]/)
    .map(normalizeForCite)
    .filter((f) => f.length >= 6);
}

export interface CiteIndex {
  /** Número de línea (1-based) donde empieza la cita, o null si no está. */
  find(cita: string): number | null;
  /** ¿El texto aparece tal cual (normalizado) en algún lugar? */
  contains(text: string): boolean;
}

export function buildCiteIndex(content: string): CiteIndex {
  const lineStarts: number[] = [];
  const lineNumbers: number[] = [];
  let joined = "";
  content.split(/\r?\n/).forEach((line, i) => {
    const norm = normalizeForCite(line);
    if (!norm) return;
    if (joined) joined += " ";
    lineStarts.push(joined.length);
    lineNumbers.push(i + 1);
    joined += norm;
  });

  const lineAt = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lineNumbers[lo] ?? 1;
  };

  return {
    find(cita: string): number | null {
      const fragments = citeFragments(cita);
      if (fragments.length === 0) return null;
      let from = 0;
      let first = -1;
      for (const frag of fragments) {
        const idx = joined.indexOf(frag, from);
        if (idx === -1) return null;
        if (first === -1) first = idx;
        from = idx + frag.length;
      }
      return lineAt(first);
    },
    contains(text: string): boolean {
      const norm = normalizeForCite(text);
      return norm.length > 0 && joined.includes(norm);
    }
  };
}
