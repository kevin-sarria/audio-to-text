import { execFileSync } from "node:child_process";

/**
 * Vigencia por SECCIÓN, no por archivo: un mismo documento puede tener una sección
 * nueva y obligatoria arriba de una vieja que la contradice. La fecha de cada
 * sección es la más reciente entre sus líneas según `git blame`; además se detectan
 * marcas explícitas («obligatorio», «aprobado el…», «obsoleto», «ya no»…).
 */

export interface SectionInfo {
  title: string;
  /** Línea del encabezado (1-based); 0 para el texto antes del primer encabezado. */
  startLine: number;
  endLine: number;
  /** Fecha ISO (AAAA-MM-DD) de la línea más reciente de la sección, o null. */
  date: string | null;
  marks: string[];
  obsolete: boolean;
}

/** Fecha (epoch en segundos) de cada línea según `git blame --line-porcelain`. */
export function blameLineTimes(repoDir: string, fileRelToRepo: string): Map<number, number> | null {
  let out: string;
  try {
    out = execFileSync("git", ["-C", repoDir, "blame", "--line-porcelain", "--", fileRelToRepo], {
      encoding: "utf-8",
      timeout: 10000,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return null;
  }
  const times = new Map<number, number>();
  let currentLine = 0;
  let currentTime = 0;
  for (const line of out.split("\n")) {
    const head = line.match(/^[0-9a-f]{40} \d+ (\d+)/);
    if (head) {
      currentLine = Number(head[1]);
      currentTime = 0;
      continue;
    }
    const t = line.match(/^author-time (\d+)/);
    if (t) currentTime = Number(t[1]);
    else if (line.startsWith("\t") && currentLine) times.set(currentLine, currentTime);
  }
  return times;
}

const MARK_PATTERNS: Array<{ re: RegExp; label: (m: RegExpMatchArray) => string; obsolete?: boolean }> = [
  { re: /\bobligatori[oa]s?\b|\bmandatory\b|\brequired\b/i, label: () => "obligatorio" },
  {
    re: /\baprobad[oa]s? (?:el|por|en)\s+([^\n).;,]{2,40})/i,
    label: (m) => `aprobado ${m[0].toLowerCase().includes(" por ") ? "por" : "el"} ${m[1]!.trim()}`
  },
  { re: /\b(?:desde|a partir de)(?: el)?\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i, label: (m) => `desde ${m[1]}` },
  { re: /\bvigente\b|\ben vigor\b/i, label: () => "vigente" },
  { re: /\breemplaza(?:\s+a)?\b|\bsustituye(?:\s+a)?\b|\bsupersedes\b/i, label: () => "reemplaza a otra" },
  { re: /\bobsolet[oa]s?\b|\bdeprecad[oa]s?\b|\bdeprecated\b/i, label: () => "obsoleto", obsolete: true },
  { re: /\bya no (?:se )?(?:usa|aplica|es válid|está vigente|se hace)/i, label: () => "ya no aplica", obsolete: true },
  { re: /\breemplazad[oa]s? por\b|\bsuperseded by\b/i, label: () => "reemplazado", obsolete: true }
];

export function detectMarks(text: string): { marks: string[]; obsolete: boolean } {
  const marks: string[] = [];
  let obsolete = false;
  for (const p of MARK_PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    const label = p.label(m);
    if (!marks.includes(label)) marks.push(label);
    if (p.obsolete) obsolete = true;
  }
  return { marks, obsolete };
}

const toDate = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);

/** Parte un documento Markdown por encabezados (fuera de bloques de código) y fecha cada sección. */
export function sectionsWithDates(content: string, lineTimes: Map<number, number> | null): SectionInfo[] {
  const lines = content.split(/\r?\n/);
  const sections: SectionInfo[] = [];
  let inCode = false;
  let current: SectionInfo = { title: "(inicio)", startLine: 0, endLine: 0, date: null, marks: [], obsolete: false };

  const close = (endLine: number) => {
    current.endLine = endLine;
    const from = Math.max(1, current.startLine);
    let latest = 0;
    const body: string[] = [];
    for (let n = from; n <= endLine; n++) {
      latest = Math.max(latest, lineTimes?.get(n) ?? 0);
      body.push(lines[n - 1] ?? "");
    }
    current.date = latest > 0 ? toDate(latest) : null;
    // Una sección se marca a sí misma en su encabezado o en sus primeras líneas; más abajo,
    // «obsoleto» suele hablar de otra cosa («el prototipo quedó obsoleto»).
    const head = [current.startLine > 0 ? current.title : "", ...body.slice(current.startLine > 0 ? 1 : 0).filter((l) => l.trim()).slice(0, 2)];
    const { marks, obsolete } = detectMarks(head.join("\n"));
    current.marks = marks;
    current.obsolete = obsolete;
    if (current.startLine > 0 || body.some((l) => l.trim())) sections.push(current);
  };

  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    const heading = !inCode && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading && heading[2]) {
      close(i);
      current = { title: heading[2], startLine: i + 1, endLine: 0, date: null, marks: [], obsolete: false };
    }
  });
  close(lines.length);
  return sections;
}

/** Anota cada encabezado con su fecha y marcas, para que el modelo compare por sección. */
export function annotateHeadings(text: string, sections: SectionInfo[]): string {
  const byTitle = new Map(sections.filter((s) => s.startLine > 0).map((s) => [s.title, s]));
  let inCode = false;
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
      const heading = !inCode && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      const info = heading && heading[2] ? byTitle.get(heading[2]) : undefined;
      if (!info) return line;
      const parts = [
        info.date ? `fecha de esta sección: ${info.date}` : null,
        info.marks.length ? `marcas: ${info.marks.join(", ")}` : null,
        info.obsolete ? "OBSOLETA: nunca gana" : null
      ].filter(Boolean);
      return parts.length ? `${line}  [${parts.join(" · ")}]` : line;
    })
    .join("\n");
}

/** Lista compacta de secciones con fecha y marcas (para documentos leídos por resumen). */
export function sectionDatesLine(sections: SectionInfo[]): string {
  return sections
    .filter((s) => s.startLine > 0 && (s.date || s.marks.length))
    .slice(0, 25)
    .map((s) => `"${s.title}": ${[s.date, ...s.marks, s.obsolete ? "OBSOLETA" : null].filter(Boolean).join(", ")}`)
    .join("; ");
}
