/**
 * Recorte por importancia: si el contexto pasa el tope, se quitan primero los detalles
 * de las secciones menos importantes, desde el final de cada una, dejando al menos una
 * línea por sección mientras se pueda. Nunca se recortan las trampas, las reglas que
 * no se pueden romper ni las ramas y PR.
 */

export interface RenderedSection {
  key: string;
  lines: string[];
}

export const NEVER_TRIM = new Set(["trampas", "reglas_inquebrantables", "ramas_pr"]);

/** Primero se recorta lo de arriba de esta lista. */
export const TRIM_ORDER = [
  "preguntas_abiertas",
  "tecnologias",
  "capas_estructura",
  "flujos",
  "proposito",
  "glosario",
  "repositorios",
  "despliegue",
  "verificacion",
  "contradicciones",
  "cambios_base_datos",
  "como_escribir_issues",
  "roles_permisos",
  "reglas_negocio_ubicacion"
];

function isRemovable(line: string): boolean {
  if (/^\|\s*-{3}/.test(line) || /^\|\s*Cómo se dice/.test(line)) return false; // cabecera de tabla
  return /^(?:[-*]\s|\|)/.test(line) && !/^-\s*(?:Indicar qué|Citar las|Avisar cuando|Incluir las tareas|Separar lo decidido)/.test(line);
}

export function trimByImportance(
  header: string[],
  sections: RenderedSection[],
  maxChars: number
): { text: string; omitted: number } {
  const join = () => [...header, ...sections.flatMap((s) => s.lines)].join("\n");
  let total = join().length;
  let omitted = 0;
  if (total <= maxChars) return { text: join(), omitted };

  const byKey = new Map(sections.map((s) => [s.key, s]));
  const removableIndexes = (s: RenderedSection) =>
    s.lines.map((l, i) => (isRemovable(l) ? i : -1)).filter((i) => i >= 0);

  for (const minKeep of [1, 0]) {
    for (const key of TRIM_ORDER) {
      if (NEVER_TRIM.has(key)) continue;
      const sec = byKey.get(key);
      if (!sec) continue;
      let idx = removableIndexes(sec);
      while (total > maxChars && idx.length > minKeep) {
        const last = idx[idx.length - 1]!;
        // Quitar también las sub-viñetas que cuelgan de esa línea.
        let end = last + 1;
        while (end < sec.lines.length && /^\s{2,}[-*]\s/.test(sec.lines[end]!)) end++;
        const removed = sec.lines.splice(last, end - last);
        total -= removed.reduce((acc, l) => acc + l.length + 1, 0);
        omitted++;
        idx = removableIndexes(sec);
      }
      if (total <= maxChars) break;
    }
    if (total <= maxChars) break;
  }

  const text = join();
  return { text: omitted ? `${text}\n- … (${omitted} elementos omitidos por tamaño; los de menor importancia primero)` : text, omitted };
}
