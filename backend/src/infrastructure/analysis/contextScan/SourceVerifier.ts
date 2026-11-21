import path from "node:path";
import { ProjectInventory } from "./ProjectInventory.js";
import {
  ScanResponse,
  ScanSectionKey,
  ScanItem,
  GlossaryItem,
  Contradiction,
  DATA_SECTION_KEYS
} from "./ContextScanSchema.js";
import { isConcrete, isPathToken } from "./FactConcreteness.js";
import { SourceContext, ResolvedSource, splitSources } from "./verification/sourceResolver.js";
import { normalizeForCite } from "./verification/citeMatcher.js";

/**
 * Verificador determinista. Un dato queda:
 * - confirmado: su cita (o su valor literal) aparece en la fuente o en otro archivo
 *   conocido (en ese caso se corrige la fuente). La fuente queda como `archivo:línea`;
 * - deducido: no está literal, pero el modelo dice de qué fuentes existentes lo dedujo;
 * - sin confirmar: la fuente existe, pero la cita no aparece;
 * - descartado: la fuente no existe, es secreta o está fuera del proyecto; cita una
 *   ruta o un comando que no existen sin evidencia; o (con `discardTopics`) nombra el
 *   tema sin responderlo.
 */

export interface DiscardedItem {
  section: ScanSectionKey;
  dato: string;
  fuente: string;
  reason: string;
}

export interface VerificationStats {
  verified: number;
  deduced: number;
  unconfirmed: number;
  discarded: number;
  /** Datos cuyo valor nombra el tema sin responderlo (antes de descartarlos). */
  topics: number;
}

/** Un hecho que el lector de código sacó de un archivo (código/describeCode.ts). */
export interface CodeEvidence {
  path: string;
  line: number;
  text: string;
}

export interface VerifyOptions {
  /** Descarta los temas. En la primera pasada se marcan para re-pedirlos al modelo. */
  discardTopics?: boolean;
  /**
   * Hechos extraídos del código: una cita copiada del bloque CÓDIGO no es literal del
   * archivo, pero sí de un hecho determinista de ese archivo, y cuenta como confirmada.
   */
  codeEvidence?: CodeEvidence[];
  /** Entidades, enums y roles del código: confirman el «nombre_codigo» del glosario. */
  codeNames?: string[];
}

const MIN_EVIDENCE_MATCH = 8;

const COMMAND_RE = /\b((?:npm|pnpm|yarn|dotnet|make|mvn|\.\/gradlew|composer)\s+[^\s,;`]+(?:\s+[^\s,;`-][^\s,;`]*)?)/i;

function normalizeCommand(cmd: string): string {
  return cmd.trim().toLowerCase().replace(/^npm run test\b/, "npm test").replace(/\s+/g, " ");
}

const SOURCE_REASON: Record<string, string> = {
  missing: "la fuente no existe",
  outside: "fuente fuera del proyecto",
  secret: "fuente con secretos"
};

/** Nombres que solo indican el alcance (repos y carpetas del proyecto). */
export function scopeNamesOf(inventory: ProjectInventory): string[] {
  return [
    path.basename(path.resolve(inventory.rootPath)),
    ...inventory.repositories.flatMap((r) => [r.path, r.name]),
    ...inventory.otherFolders.flatMap((f) => [f.path, f.name])
  ].filter((n) => n && n !== ".");
}

interface Evidence {
  status: "confirmado" | "deducido" | "sin_confirmar";
  fuente: string;
}

export function verifyScanResponse(
  data: ScanResponse,
  inventory: ProjectInventory,
  rootPath: string,
  options: VerifyOptions = {}
): { data: ScanResponse; stats: VerificationStats; discarded: DiscardedItem[] } {
  const cloned: ScanResponse = JSON.parse(JSON.stringify(data));
  const ctx = new SourceContext(inventory, rootPath);
  const scopeNames = scopeNamesOf(inventory);
  const discarded: DiscardedItem[] = [];
  const stats: VerificationStats = { verified: 0, deduced: 0, unconfirmed: 0, discarded: 0, topics: 0 };
  const codeEvidence = options.codeEvidence ?? [];
  const codeNames = new Set((options.codeNames ?? []).map((n) => n.toLowerCase()));

  const count = (status: Evidence["status"]) => {
    if (status === "confirmado") stats.verified++;
    else if (status === "deducido") stats.deduced++;
    else stats.unconfirmed++;
  };

  /** Busca evidencia: la cita (o el valor literal) en la fuente, luego en el resto. */
  const findEvidence = (
    sources: ResolvedSource[],
    cita: string | undefined,
    valor: string | undefined,
    deducedFrom: string[] | undefined
  ): Evidence | null => {
    const files = sources.filter((s) => s.kind === "file" && s.rel) as Array<Required<ResolvedSource>>;
    // La cita primero; el valor solo si es un literal razonable y solo en la fuente indicada.
    const candidates = [cita, valor && valor.length >= 4 ? valor : undefined].filter((c): c is string => !!c);
    for (const text of candidates) {
      for (const src of files) {
        const line = ctx.index(src.rel)?.find(text) ?? null;
        if (line !== null) return { status: "confirmado", fuente: `${src.rel}:${line}` };
      }
      if (sources.some((s) => s.kind === "inventory") && ctx.inventoryText.toLowerCase().includes(text.toLowerCase())) {
        return { status: "confirmado", fuente: "inventario" };
      }
    }
    // Hechos del código del mismo archivo (la cita salió del bloque CÓDIGO).
    if (codeEvidence.length && cita) {
      const want = normalizeForCite(cita);
      const rels = new Set(files.map((f) => f.rel));
      const hit =
        want.length >= MIN_EVIDENCE_MATCH
          ? codeEvidence.find((e) => rels.has(e.path) && normalizeForCite(e.text).includes(want))
          : undefined;
      if (hit) return { status: "confirmado", fuente: `${hit.path}:${hit.line}` };
    }
    // Solo una cita explícita se busca en los demás archivos conocidos (un valor corto
    // como «React 19» podría coincidir por casualidad en cualquier parte).
    if (cita) {
      const elsewhere = ctx.findCiteAnywhere(cita, files[0]?.rel);
      if (elsewhere) return { status: "confirmado", fuente: `${elsewhere.rel}:${elsewhere.line}` };
    }
    const deducedSources = (deducedFrom ?? [])
      .map((d) => ctx.resolve(d))
      .filter((s) => s.kind === "file" || s.kind === "dir" || s.kind === "inventory");
    if (deducedSources.length > 0) {
      return { status: "deducido", fuente: deducedSources.map((s) => s.rel ?? "inventario").join(", ") };
    }
    const firstValid = sources.find((s) => s.kind === "file" || s.kind === "dir" || s.kind === "inventory");
    return firstValid ? { status: "sin_confirmar", fuente: firstValid.rel ?? "inventario" } : null;
  };

  // 1. Secciones de datos
  for (const secKey of DATA_SECTION_KEYS) {
    const items = (cloned.secciones[secKey] as ScanItem[] | undefined) ?? [];
    const kept: ScanItem[] = [];

    for (const item of items) {
      const reject = (reason: string) =>
        discarded.push({ section: secKey, dato: item.valor, fuente: item.fuente, reason });

      const sources = splitSources(item.fuente).map((s) => ctx.resolve(s));
      if (sources.length === 0) {
        reject("fuente no especificada");
        continue;
      }

      const evidence = findEvidence(sources, item.cita, item.valor, item.deducido_de);
      if (!evidence) {
        const bad = sources.find((s) => SOURCE_REASON[s.kind]);
        reject(bad ? SOURCE_REASON[bad.kind]! : "la fuente no existe");
        continue;
      }
      const confirmed = evidence.status === "confirmado";

      // Rutas citadas en el valor: sin evidencia, una ruta inexistente es invento.
      if (!confirmed) {
        const missingPath = item.valor
          .split(/\s+/)
          .map((t) => t.replace(/^[(`'"«]+|[)`'",.;:»]+$/g, ""))
          .find((t) => t.includes("/") && isPathToken(t) && !/^https?:/i.test(t) && !ctx.pathExists(t));
        if (missingPath) {
          reject("la ruta no existe");
          continue;
        }
      }

      // Comandos: sin evidencia literal, tienen que estar en el inventario de ese repo.
      if (secKey === "verificacion" && !confirmed) {
        const cmd = (item.valor.match(COMMAND_RE)?.[1] ?? "").trim();
        if (cmd) {
          const srcRel = sources.find((s) => s.rel)?.rel ?? "";
          const repo = [...inventory.repositories]
            .sort((a, b) => b.path.length - a.path.length)
            .find((r) => r.path === "." || srcRel === r.path || srcRel.startsWith(`${r.path}/`));
          const repoCommands = inventory.commands.filter((c) => !repo || c.repo === repo.path);
          if (!repoCommands.some((c) => normalizeCommand(c.runAs) === normalizeCommand(cmd))) {
            reject("el comando no existe en el inventario");
            continue;
          }
        }
      }

      item.estado = evidence.status;
      item.fuente = evidence.fuente;

      // Tema: el valor no responde y no hay una cita confirmada que lo haga.
      const valueIsTopic = !isConcrete(item.valor, { scopeNames });
      item.mostrar_cita = valueIsTopic && confirmed && !!item.cita;
      item.tema = valueIsTopic && !item.mostrar_cita;
      if (item.tema) {
        stats.topics++;
        if (options.discardTopics) {
          reject("nombra el tema sin dar el dato");
          continue;
        }
      }

      count(evidence.status);
      kept.push(item);
    }
    (cloned.secciones as Record<string, unknown>)[secKey] = kept;
  }

  // 2. Glosario: el nombre en el código debe aparecer en la fuente (o la cita)
  const keptGlossary: GlossaryItem[] = [];
  for (const item of cloned.secciones.glosario ?? []) {
    const sources = splitSources(item.fuente).map((s) => ctx.resolve(s));
    const valid = sources.find((s) => s.kind === "file" || s.kind === "dir" || s.kind === "inventory");
    if (!valid) {
      discarded.push({
        section: "glosario",
        dato: `${item.termino_reunion} → ${item.nombre_codigo}`,
        fuente: item.fuente,
        reason: "la fuente no existe"
      });
      continue;
    }
    const names = item.nombre_codigo.split(/\s+(?:o|y|u|or|and)\s+|[,/]/).map((n) => n.replace(/[`'"]/g, "").trim()).filter(Boolean);
    const content = valid.rel && valid.kind === "file" ? (ctx.read(valid.rel) ?? "") : "";
    const haystack = `${valid.rel ?? ""}\n${content}\n${valid.kind === "inventory" ? ctx.inventoryText : ""}`.toLowerCase();
    const nameFound = names.length > 0 && names.every((n) => haystack.includes(n.toLowerCase()));
    const citeLine = item.cita && valid.rel ? (ctx.index(valid.rel)?.find(item.cita) ?? null) : null;
    // La fuente suele ser el texto de pantalla (i18n) y el nombre, una entidad de otro
    // archivo: vale si el término está en la fuente y el nombre existe en el código.
    const termInSource = normalizeForCite(content).includes(normalizeForCite(item.termino_reunion));
    const nameIsCode = names.length > 0 && names.every((n) => codeNames.has(n.toLowerCase()));

    item.estado = nameFound || citeLine !== null || (termInSource && nameIsCode) ? "confirmado" : "sin_confirmar";
    item.fuente = citeLine !== null ? `${valid.rel}:${citeLine}` : (valid.rel ?? "inventario");
    count(item.estado);
    keptGlossary.push(item);
  }
  cloned.secciones.glosario = keptGlossary;

  // 3. Contradicciones: al menos una fuente real
  const keptContradictions: Contradiction[] = [];
  for (const c of cloned.secciones.contradicciones ?? []) {
    const validFuentes = (c.fuentes ?? []).filter((f) => {
      const r = ctx.resolve(f);
      return r.kind === "file" || r.kind === "dir" || r.kind === "inventory";
    });
    if (validFuentes.length === 0) {
      discarded.push({
        section: "contradicciones",
        dato: c.descripcion,
        fuente: (c.fuentes ?? []).join(", "),
        reason: "las fuentes de la contradicción no existen"
      });
      continue;
    }
    c.fuentes = validFuentes;
    keptContradictions.push(c);
  }
  cloned.secciones.contradicciones = keptContradictions;

  stats.discarded = discarded.length;
  return { data: cloned, stats, discarded };
}
