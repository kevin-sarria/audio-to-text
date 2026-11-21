import path from "node:path";
import { DocumentCategory, DocumentPriority, DocumentRef } from "./types.js";

/**
 * Decide qué archivos se leen como documentos y en qué orden:
 * 1. instrucciones para agentes y reglas del repo;
 * 2. documentos de reglas de negocio, del dominio o de la API;
 * 3. README, guía de contribución, plantillas de issue/PR y CODEOWNERS;
 * 4. el resto de documentos vigentes y plantillas de configuración;
 * 5. planes, specs, propuestas y documentos con fecha: históricos, se leen al final
 *    y nunca sirven como fuente de lo vigente si hay algo más nuevo.
 */

const AGENT_NAMES = ["claude.md", "agents.md", "gemini.md", ".cursorrules", ".windsurfrules", "copilot-instructions.md"];
const EXCLUDED_DOCS = new Set(["license.md", "licence.md", "code_of_conduct.md", "third_party_notices.md"]);

const REPO_RULES_RE = /(?:^|[-_.])(guidelines|conventions|convenciones|coding[-_]?standards|estandares|lineamientos)(?:[-_.]|$)/i;
const DOMAIN_RE =
  /regla|negocio|business|domain|dominio|glosario|glossary|roles?(?:[-_.]|$)|permis|arquitect|architecture|modelo[-_]?de[-_]?datos|data[-_]?model|entidad|api(?:[-_.]|$)|endpoints?/i;
const HISTORICAL_RE =
  /(?:^|[\/_.-])(plans?|planes|planificacion|specs?|especificacion|propuestas?|proposals?|rfcs?|roadmap|drafts?|borrador(?:es)?|changelog|historial|minutas?|retro|postmortem)(?:[\/_.-]|$)/i;
const DATE_RE = /(?:^|[^\d])(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?:[^\d]|$)/;

function docRef(
  relPath: string,
  repo: string,
  sizeBytes: number,
  category: DocumentCategory,
  priority: DocumentPriority
): DocumentRef {
  return { path: relPath, repo, category, priority, sizeBytes, lastModified: "", dateSource: "mtime" };
}

export function classifyDocument(relPath: string, repo: string, sizeBytes: number): DocumentRef | null {
  const norm = relPath.replace(/\\/g, "/");
  const lowerNorm = norm.toLowerCase();
  const lowerName = path.posix.basename(norm).toLowerCase();
  const relToRepo = repo === "." ? lowerNorm : lowerNorm.slice(repo.length + 1);
  const depthInRepo = relToRepo.split("/").length - 1;
  const isMarkdown = /\.(md|mdx|txt|rst|adoc)$/.test(lowerName);
  const inDocsFolder = /(^|\/)(docs?|adr|documentacion|documentation|wiki)\//.test(relToRepo);

  if (
    AGENT_NAMES.includes(lowerName) ||
    norm.includes("/.cursor/rules/") ||
    norm.startsWith(".cursor/rules/")
  ) {
    return docRef(relPath, repo, sizeBytes, "agent-instructions", 1);
  }

  // Plantillas de issue/PR y dueños del código: dicen cómo se escribe y quién aprueba.
  if (
    lowerName === "pull_request_template.md" ||
    lowerNorm.includes(".github/pull_request_template") ||
    lowerNorm.includes(".github/issue_template/") ||
    lowerName === "codeowners"
  ) {
    return docRef(relPath, repo, sizeBytes, "templates", 3);
  }

  if (
    lowerName === ".env.example" ||
    lowerName === ".env.sample" ||
    lowerName === ".env.template" ||
    lowerName === "appsettings.template.json" ||
    lowerName.endsWith(".example.json") ||
    lowerName.endsWith(".template.json")
  ) {
    return docRef(relPath, repo, sizeBytes, "config-templates", 4);
  }

  if (!isMarkdown || EXCLUDED_DOCS.has(lowerName)) return null;
  // Fuera de una carpeta de documentación solo se leen los .md de la raíz del repo o del primer nivel.
  if (!inDocsFolder && depthInRepo > 1) return null;

  const stem = lowerName.replace(/\.[^.]+$/, "");
  if (HISTORICAL_RE.test(relToRepo) || DATE_RE.test(relToRepo)) {
    return docRef(relPath, repo, sizeBytes, "historical", 5);
  }
  if (!inDocsFolder && depthInRepo === 0 && REPO_RULES_RE.test(stem)) {
    return docRef(relPath, repo, sizeBytes, "repo-rules", 1);
  }
  if (DOMAIN_RE.test(stem)) {
    return docRef(relPath, repo, sizeBytes, "business-docs", 2);
  }
  if (lowerName === "readme.md" || lowerName === "contributing.md") {
    return docRef(relPath, repo, sizeBytes, "readme", 3);
  }
  return docRef(relPath, repo, sizeBytes, "other-docs", 4);
}
