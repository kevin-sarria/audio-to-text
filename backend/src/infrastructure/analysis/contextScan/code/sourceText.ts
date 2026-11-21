/** Utilidades de texto comunes a los extractores (C#, TS/JS, Prisma). */

export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function isCommentLine(line: string): boolean {
  return /^\s*(?:\/\/|\/\*|\*(?!\/)|\*\/|#(?![a-z]*\s*(?:region|endregion|if|endif|pragma)))/i.test(line);
}

export function commentText(line: string): string {
  return line
    .replace(/^\s*(?:\/\/\/?|\/\*+|\*\/|\*|#)\s?/, "")
    .replace(/\*\/\s*$/, "")
    .replace(/<\/?(?:summary|remarks|para)>/gi, "")
    .trim();
}

/** El comentario inmediatamente encima de la línea `idx` (0-based), en una sola frase. */
export function commentAbove(lines: string[], idx: number, maxLines = 4): string {
  const parts: string[] = [];
  for (let i = idx - 1; i >= 0 && parts.length < maxLines; i--) {
    const l = lines[i] ?? "";
    if (!l.trim()) break;
    if (!isCommentLine(l)) {
      // Atributos y decoradores entre el comentario y la línea no lo separan.
      if (/^\s*(?:\[[A-Z]\w*|@\w+)/.test(l)) continue;
      break;
    }
    const t = commentText(l);
    if (t) parts.unshift(t);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Comentario al final de la misma línea (`x = 5; // explicación`). */
export function trailingComment(line: string): string {
  const m = line.match(/[;,)}\]]\s*\/\/\s*(.+)$/);
  return m ? m[1]!.trim() : "";
}

/** Literales de cadena de una expresión: `"A,B"`, `'a'`, `` `b` `` → [A, B, a, b]. */
export function stringLiterals(expr: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`([^`$]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** Roles de una lista: literales separados por coma y miembros de enum (`Role.Admin` → Admin). */
export function roleNames(expr: string): string[] {
  const names = new Set<string>();
  for (const lit of stringLiterals(expr)) {
    for (const part of lit.split(/\s*,\s*/)) if (/^[\w.-]{2,40}$/.test(part)) names.add(part);
  }
  const enumRe = /\b(?:Roles?|Rol(?:es)?|UserRoles?|Perfil(?:es)?)\.(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = enumRe.exec(expr)) !== null) names.add(m[1]!);
  return [...names];
}

/** Recorta una línea de código para mostrarla (sin valores largos). */
export function codeSnippet(line: string, max = 140): string {
  const t = line.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function joinRoute(base: string, sub: string): string {
  if (!sub) return base || "/";
  if (sub.startsWith("~/")) return sub.slice(1);
  if (sub.startsWith("/") && !base) return sub;
  const b = base.replace(/\/+$/, "");
  const s = sub.replace(/^\/+/, "");
  return b ? `${b}/${s}` : s;
}
