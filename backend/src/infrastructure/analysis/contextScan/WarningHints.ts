import fs from "node:fs";
import path from "node:path";
import { DocumentRef } from "./ProjectInventory.js";
import { redactSecrets } from "./SecretRedactor.js";

/**
 * Pistas deterministas para la sección «Trampas»: lo que un desarrollador nuevo
 * rompería. Salen de frases de advertencia en los documentos y de plantillas de
 * configuración que apuntan a recursos remotos. Se le pasan al modelo y, si no las
 * usa, el render las muestra igual para que nunca se pierdan.
 */

export interface WarningHint {
  path: string;
  line: number;
  text: string;
  kind: "advertencia" | "config-remota";
}

const WARNING_RE =
  /⚠|⛔|🚨|\bojo\b|\bcuidado\b|\bnunca\b|\bjam[aá]s\b|no tocar|\bno (?:modificar|borrar|ejecutar|subir|usar|cambiar)\b|\bimportante\b|en producci[oó]n|\btrampa\b|\bgotcha\b|\bwarning\b|\bcaution\b|\bnever\b|\bdo not\b|\bdon'?t\b|\batenci[oó]n\b|\bprohibid[oa]\b|\bpeligro\b/i;

const REMOTE_KEY_RE = /(HOST|URL|URI|SERVER|ENDPOINT|BUCKET|DATABASE|DB_NAME|CONNECTION)/i;
const LOCAL_VALUE_RE = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1|host\.docker\.internal|db|postgres|mysql|redis|mongo)(?:[:/]|$)/i;
const PLACEHOLDER_RE = /^(?:<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|x+|changeme|tu[_-]|your[_-]|example|ejemplo)?$/i;

const MAX_HINTS = 40;
const MAX_TEXT = 240;

function cleanLine(line: string): string {
  return line.replace(/^\s*(?:[-*>]|\d+\.)\s*/, "").replace(/\s+/g, " ").trim();
}

function remoteConfigHint(line: string): string | null {
  const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*["']?([^"'#\s]*)/);
  if (!m || !m[1]) return null;
  const key = m[1];
  const value = (m[2] ?? "").trim();
  const host = value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]+@/, "");
  if (!REMOTE_KEY_RE.test(key) || PLACEHOLDER_RE.test(value) || LOCAL_VALUE_RE.test(host)) return null;
  // Se informa que apunta a un recurso remoto, sin enviar el valor.
  const looksShared = /compartid|shared|prod|staging|qa\b|dev\./i.test(value + line);
  return `${key} apunta a un servidor remoto${looksShared ? " (compartido o de otro entorno)" : ""}, no a uno local`;
}

export function extractWarningHints(rootPath: string, documents: DocumentRef[]): WarningHint[] {
  const hints: WarningHint[] = [];
  const seen = new Set<string>();

  for (const doc of documents) {
    if (hints.length >= MAX_HINTS) break;
    if (doc.priority === 5) continue; // los planes y specs históricos no definen lo vigente
    let content: string;
    try {
      content = fs.readFileSync(path.join(rootPath, doc.path), "utf-8");
    } catch {
      continue;
    }
    const isConfig = doc.category === "config-templates";
    let inCode = false;

    content.split(/\r?\n/).forEach((rawLine, i) => {
      if (hints.length >= MAX_HINTS) return;
      if (/^\s*(```|~~~)/.test(rawLine)) {
        inCode = !inCode;
        return;
      }
      if (inCode && !isConfig) return;

      let text: string | null = null;
      let kind: WarningHint["kind"] = "advertencia";
      if (isConfig) {
        // En una plantilla de configuración también cuentan los comentarios de advertencia.
        text = remoteConfigHint(rawLine);
        if (text) kind = "config-remota";
        else if (/^\s*#/.test(rawLine) && (WARNING_RE.test(rawLine) || /compartid|shared/i.test(rawLine))) {
          text = cleanLine(rawLine.replace(/^\s*#+/, ""));
        }
      } else if (WARNING_RE.test(rawLine) && !/^\s*#{1,6}\s/.test(rawLine)) {
        text = cleanLine(rawLine);
      }
      if (!text || text.length < 12) return;

      const redacted = redactSecrets(text.slice(0, MAX_TEXT)).text;
      const key = redacted.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      hints.push({ path: doc.path, line: i + 1, text: redacted, kind });
    });
  }
  return hints;
}
