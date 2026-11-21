import path from "node:path";
import { CodeFacts, SourceFile } from "./types.js";
import { lineAt } from "./sourceText.js";

/**
 * Textos de pantalla (i18n): JSON de traducciones (planos o anidados) y .resx. Dicen
 * cómo llama la interfaz —y por lo tanto las personas— a cada cosa del código.
 */

const MAX_ENTRIES_PER_FILE = 80;

/** «es.json», «es-CO.json», «locales/es/translation.json», «Strings.es.resx» → es / es-CO. */
export function localeOf(relPath: string): string {
  const norm = relPath.replace(/\\/g, "/");
  const base = path.posix.basename(norm).replace(/\.(json|resx)$/i, "");
  const fromName = base.match(/(?:^|[._-])([a-z]{2}(?:[-_][A-Z]{2})?)$/);
  if (fromName) return fromName[1]!;
  const dir = path.posix.basename(path.posix.dirname(norm));
  if (/^[a-z]{2}(?:[-_][A-Z]{2})?$/.test(dir)) return dir;
  return norm.toLowerCase().endsWith(".resx") ? "neutral" : base;
}

function flatten(obj: unknown, prefix: string, out: Array<{ key: string; value: string }>): void {
  if (out.length >= MAX_ENTRIES_PER_FILE) return;
  if (typeof obj === "string") {
    out.push({ key: prefix, value: obj });
  } else if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

function lineOfKey(text: string, key: string): number {
  const last = key.split(".").pop()!;
  const idx = text.indexOf(`"${last}"`);
  return idx >= 0 ? lineAt(text, idx) : 1;
}

export function extractI18n(file: SourceFile, facts: CodeFacts): void {
  const locale = localeOf(file.path);
  const lower = file.path.toLowerCase();

  if (lower.endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text.replace(/^﻿/, ""));
    } catch {
      return;
    }
    const entries: Array<{ key: string; value: string }> = [];
    flatten(parsed, "", entries);
    for (const e of entries) {
      if (!e.value.trim() || e.value.length > 160) continue;
      facts.i18n.push({ repo: file.repo, path: file.path, line: lineOfKey(file.text, e.key), locale, key: e.key, value: e.value.trim() });
    }
    return;
  }

  if (lower.endsWith(".resx")) {
    const re = /<data\s+name="([^"]+)"[^>]*>\s*<value>([\s\S]*?)<\/value>/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(file.text)) !== null && count < MAX_ENTRIES_PER_FILE) {
      const value = m[2]!.replace(/\s+/g, " ").trim();
      if (!value || value.length > 160 || m[1]!.includes(">>")) continue;
      facts.i18n.push({ repo: file.repo, path: file.path, line: lineAt(file.text, m.index), locale, key: m[1]!, value });
      count++;
    }
  }
}
