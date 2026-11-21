import path from "node:path";
import { DomainNames } from "./types.js";

const MAX_PER_CATEGORY = 80;

function add(list: string[], value: string): void {
  if (list.length < MAX_PER_CATEGORY && !list.includes(value)) list.push(value);
}

export function emptyDomain(): DomainNames {
  return { entities: [], migrations: [], controllers: [], routes: [], pages: [], i18n: [] };
}

/** Clasifica la RUTA de un archivo en categorías del dominio (no lee su contenido). */
export function collectDomainNames(relPath: string, domain: DomainNames): void {
  const norm = relPath.replace(/\\/g, "/");
  const lower = norm.toLowerCase();
  const base = path.posix.basename(norm);

  if (
    lower.includes("/entities/") ||
    lower.includes("/entity/") ||
    lower.includes("/models/") ||
    lower.includes("/model/") ||
    lower.includes("/domain/") ||
    lower.startsWith("entities/") ||
    lower.startsWith("models/") ||
    lower.startsWith("domain/") ||
    lower.endsWith(".entity.ts") ||
    lower.endsWith("prisma/schema.prisma")
  ) {
    add(domain.entities, norm);
  }

  if (lower.includes("/migrations/") || lower.startsWith("migrations/") || lower.endsWith(".sql")) {
    add(domain.migrations, norm);
  }

  if (lower.includes("controller") || lower.includes("/controllers/") || lower.startsWith("controllers/")) {
    add(domain.controllers, norm);
  }

  if (lower.includes("/routes/") || lower.startsWith("routes/") || lower.includes(".routes.") || lower.includes("router")) {
    add(domain.routes, norm);
  }

  if (
    lower.includes("/pages/") ||
    lower.startsWith("pages/") ||
    lower.includes("/views/") ||
    lower.startsWith("views/") ||
    lower.includes("/screens/") ||
    lower.startsWith("screens/") ||
    (lower.includes("/app/") && base.startsWith("page."))
  ) {
    add(domain.pages, norm);
  }

  if ((lower.includes("/locales/") || lower.startsWith("locales/")) && lower.endsWith(".json")) {
    add(domain.i18n, norm);
  } else if (lower.includes("/i18n/") || lower.startsWith("i18n/") || lower.endsWith(".resx")) {
    add(domain.i18n, norm);
  }
}
