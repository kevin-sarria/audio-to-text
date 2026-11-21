import path from "node:path";
import { DocumentCategory, DocumentRef } from "./types.js";

const AGENT_NAMES = ["claude.md", "agents.md", "gemini.md", ".cursorrules", ".windsurfrules"];

function docRef(
  relPath: string,
  repo: string,
  sizeBytes: number,
  category: DocumentCategory,
  priority: 1 | 2 | 3 | 4
): DocumentRef {
  return { path: relPath, repo, category, priority, sizeBytes, lastModified: "", dateSource: "mtime" };
}

/** Decide si un archivo es un documento que se lee y con qué prioridad. */
export function classifyDocument(relPath: string, repo: string, sizeBytes: number): DocumentRef | null {
  const norm = relPath.replace(/\\/g, "/");
  const lowerNorm = norm.toLowerCase();
  const lowerName = path.posix.basename(norm).toLowerCase();

  // 1. Instrucciones para agentes
  if (
    AGENT_NAMES.includes(lowerName) ||
    norm.includes("/.cursor/rules/") ||
    norm.startsWith(".cursor/rules/") ||
    lowerName === "copilot-instructions.md"
  ) {
    return docRef(relPath, repo, sizeBytes, "agent-instructions", 1);
  }

  // 3. Plantillas (antes que business-docs para las de .github)
  if (
    lowerName === "pull_request_template.md" ||
    lowerNorm.includes(".github/pull_request_template") ||
    lowerNorm.includes(".github/issue_template/")
  ) {
    return docRef(relPath, repo, sizeBytes, "templates", 3);
  }

  // 4. Plantillas de configuración
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

  // 2. Documentos del negocio
  if (
    ((lowerName.endsWith(".md") || lowerName.endsWith(".txt")) &&
      (lowerNorm.startsWith("docs/") ||
        lowerNorm.includes("/docs/") ||
        lowerNorm.startsWith("doc/") ||
        lowerNorm.includes("/doc/") ||
        lowerNorm.startsWith("adr/") ||
        lowerNorm.includes("/adr/"))) ||
    lowerName === "contributing.md" ||
    lowerName === "readme.md" ||
    lowerName === "architecture.md"
  ) {
    return docRef(relPath, repo, sizeBytes, "business-docs", 2);
  }

  return null;
}
