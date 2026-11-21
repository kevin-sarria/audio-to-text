import { SCAN_SECTIONS, DATA_SECTION_KEYS } from "./ContextScanSchema.js";
import { isConcrete, stripRenderNoise } from "./FactConcreteness.js";

/**
 * Métricas de calidad del contexto técnico renderizado.
 * Trabaja sobre el Markdown final (lo que de verdad recibe quien redacta issues),
 * no sobre el JSON intermedio del modelo.
 */

export interface ContextSection {
  key: string;
  title: string;
  /** Todas las líneas del cuerpo de la sección. */
  lines: string[];
  /** Líneas escritas por el modelo (sin el bloque «Del inventario»). */
  modelLines: string[];
}

export interface ContextMetrics {
  /** Viñetas escritas por el modelo en las secciones de datos. */
  dataLines: number;
  /** Viñetas sin ningún elemento concreto (nombran la pregunta sin responderla). */
  themeLines: number;
  themeRate: number;
  unconfirmedLines: number;
  unconfirmedRate: number;
  /** Ejemplos de líneas tema (máx. 10) para revisar a mano. */
  themeExamples: string[];
  contextChars: number;
}

export interface QuestionResult {
  id: string;
  pregunta: string;
  answered: boolean;
  /** Línea donde se encontró la respuesta, si se encontró. */
  evidence?: string;
}

const TITLE_TO_KEY = new Map<string, string>(
  SCAN_SECTIONS.map((s) => [normalizeForMatch(s.title), s.key])
);

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function slugify(title: string): string {
  return normalizeForMatch(title)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Parte el contexto por encabezados «## N. Título» o «## Título». */
export function parseContextSections(markdown: string): ContextSection[] {
  const sections: ContextSection[] = [];
  let current: ContextSection | null = null;
  let inInventoryBlock = false;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(?:\d+\.\s+)?(.+?)\s*$/);
    if (heading && heading[1]) {
      const title = heading[1];
      const key = TITLE_TO_KEY.get(normalizeForMatch(title)) ?? slugify(title);
      current = { key, title, lines: [], modelLines: [] };
      sections.push(current);
      inInventoryBlock = false;
      continue;
    }
    if (!current) continue;

    current.lines.push(line);
    if (line.trim().startsWith("**Del inventario")) {
      inInventoryBlock = true;
      continue;
    }
    if (inInventoryBlock) {
      if (line.trim() === "") inInventoryBlock = false;
      continue;
    }
    current.modelLines.push(line);
  }
  return sections;
}

function isTopLevelBullet(line: string): boolean {
  return /^[-*]\s+/.test(line) && !/^[-*]\s+…/.test(line);
}

/**
 * Nombres de repos y carpetas del propio proyecto, sacados de los bloques
 * «Del inventario» del contexto: el primer segmento de cada ruta entre backticks.
 * Sirven para que nombrar el repo no cuente como respuesta concreta.
 */
export function extractScopeNames(markdown: string): string[] {
  const names = new Set<string>();
  for (const sec of parseContextSections(markdown)) {
    const modelSet = new Set(sec.modelLines);
    for (const line of sec.lines) {
      if (modelSet.has(line)) continue;
      for (const m of line.matchAll(/`([^`]+)`/g)) {
        const raw = m[1]!.trim();
        // Rutas («campo-api/package.json») o nombres del bloque de repositorios.
        if (!/[\\/]/.test(raw) && sec.key !== "repositorios" && !/^\s*-\s*Carpeta\b/.test(line)) continue;
        const first = raw.split(/[\\/]/)[0]!;
        // Solo nombres de carpeta: nada con espacios, comandos ni el «.» de la raíz.
        if (first && first !== "." && /^[\w.@-]+$/.test(first) && !/\.\w{1,5}$/.test(first)) {
          names.add(first);
        }
      }
    }
  }
  return [...names];
}

export function computeContextMetrics(markdown: string, scopeNames?: string[]): ContextMetrics {
  const dataKeys = new Set<string>(DATA_SECTION_KEYS);
  const scope = scopeNames ?? extractScopeNames(markdown);
  let dataLines = 0;
  let themeLines = 0;
  let unconfirmedLines = 0;
  const themeExamples: string[] = [];

  for (const sec of parseContextSections(markdown)) {
    if (!dataKeys.has(sec.key)) continue;
    for (const line of sec.modelLines) {
      if (!isTopLevelBullet(line)) continue;
      dataLines++;
      if (/sin confirmar/i.test(line)) unconfirmedLines++;
      if (!isConcrete(line, { scopeNames: scope })) {
        themeLines++;
        if (themeExamples.length < 10) themeExamples.push(`[${sec.key}] ${stripRenderNoise(line)}`);
      }
    }
  }

  const rate = (n: number) => (dataLines === 0 ? 0 : Math.round((n / dataLines) * 1000) / 10);
  return {
    dataLines,
    themeLines,
    themeRate: rate(themeLines),
    unconfirmedLines,
    unconfirmedRate: rate(unconfirmedLines),
    themeExamples,
    contextChars: markdown.length
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compila un término de respuesta:
 * - «a|b» acepta cualquiera de las alternativas;
 * - «identic*» acepta cualquier palabra que empiece así (idéntico, idéntica…);
 * - sin «*», la alternativa tiene que aparecer como palabra o frase completa
 *   (así «PR» no coincide con «pruebas»).
 */
export function compileAnswerTerm(term: string): RegExp {
  const alternatives = term
    .split("|")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const prefix = a.endsWith("*");
      const body = escapeRegExp(normalizeForMatch(prefix ? a.slice(0, -1) : a));
      return prefix ? `${body}` : `${body}(?![a-z0-9])`;
    });
  return new RegExp(`(?<![a-z0-9])(?:${alternatives.join("|")})`);
}

/**
 * Una pregunta fija se da por respondida cuando, dentro de alguna de sus secciones,
 * una MISMA línea contiene todos los términos de la respuesta (sin importar
 * mayúsculas, tildes ni marcas de Markdown). Nombrar el tema no basta.
 */
export function answerQuestion(
  markdown: string,
  q: { id: string; pregunta: string; seccion: string | string[]; respuesta: string[] }
): QuestionResult {
  const keys = new Set(Array.isArray(q.seccion) ? q.seccion : [q.seccion]);
  const terms = q.respuesta.filter((t) => t.trim()).map(compileAnswerTerm);
  const base = { id: q.id, pregunta: q.pregunta };
  if (terms.length === 0) return { ...base, answered: false };

  for (const sec of parseContextSections(markdown)) {
    if (!keys.has(sec.key)) continue;
    // Las filas de tabla (glosario) cuentan como una línea.
    for (const line of sec.lines) {
      const norm = normalizeForMatch(line);
      if (terms.every((re) => re.test(norm))) {
        return { ...base, answered: true, evidence: line.trim().slice(0, 240) };
      }
    }
  }
  return { ...base, answered: false };
}
