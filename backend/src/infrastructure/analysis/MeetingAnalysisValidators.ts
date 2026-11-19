import { GeneratedMeetingData } from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto } from "@audio-to-text/shared";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const ALLOWED_DOCUMENTS = new Set([
  "AI_CONTEXT.md",
  "CLAUDE.md",
  "CONTEXTO.md",
  "BITACORA.md",
  "docs/REGLAS_DE_NEGOCIO.md",
  "REGLAS_DE_NEGOCIO.md"
]);

export const FORBIDDEN_TERMS = [
  "Diamante.API",
  "Diamante.Core",
  "Diamante.Data",
  "FluentValidation",
  "Yup",
  "Zod",
  "ClosedXML",
  "EPPlus",
  "TanStack"
];

export const REQUIRED_PROMPT_SECTIONS = [
  "Rol y Objetivo",
  "Contexto",
  "Pasos numerados",
  "Restricciones",
  "Criterios de Aceptación",
  "Verificación"
];

export class MeetingAnalysisValidators {
  public static validate(data: GeneratedMeetingData, transcript?: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. El texto no contiene "Paso 1", "Paso 2" ni otras etapas internas
    const internalStageRegex = /\b(Paso\s*[12]|Step\s*[12]|el análisis previo|la lista extraída)\b/i;
    if (internalStageRegex.test(data.summary || "")) {
      errors.push(`El resumen contiene referencias a etapas internas de IA: "${(data.summary || "").match(internalStageRegex)?.[0]}"`);
    }

    for (const issue of data.issues) {
      const criteriaText = (issue.acceptanceCriteria || []).join(" ");
      const issueBlob = `${issue.title || ""} ${issue.description || ""} ${issue.agentPrompt || ""} ${criteriaText}`;
      if (internalStageRegex.test(issueBlob)) {
        errors.push(`El issue [${issue.id}] filtra mecánicas internas ("${issueBlob.match(internalStageRegex)?.[0]}").`);
      }
    }

    // 2. Los nombres de documentos coinciden con la lista exacta (*.md)
    const mdRegex = /\b([a-zA-Z0-9_\-/\\]+\.md)\b/g;
    for (const issue of data.issues) {
      const expectedText = (issue.expectedFiles || []).join(" ");
      const issueText = `${issue.description || ""} ${expectedText} ${issue.agentPrompt || ""}`;
      let match: RegExpExecArray | null;
      while ((match = mdRegex.exec(issueText)) !== null) {
        const docName = match[1]?.replace(/^[./\\]+/, "") || "";
        const normalized = docName.replace(/^docs\//, "docs/");
        if (!ALLOWED_DOCUMENTS.has(docName) && !ALLOWED_DOCUMENTS.has(normalized)) {
          errors.push(
            `El issue [${issue.id}] cita un documento no permitido o mal escrito: "${docName}". Permitidos: ${Array.from(
              ALLOWED_DOCUMENTS
            ).join(", ")}`
          );
        }
      }
    }

    // 3. Los totales por repo son la suma real de los issues
    let sumBackend = 0;
    let sumPanel = 0;
    let sumApp = 0;

    for (const issue of data.issues) {
      const b = Number(issue.estimation?.backendHours) || 0;
      const p = Number(issue.estimation?.panelHours) || 0;
      const a = Number(issue.estimation?.appHours) || 0;
      const t = Number(issue.estimation?.totalHours) || (b + p + a);

      if (issue.repo === "backend") sumBackend += b > 0 ? b : t;
      else if (issue.repo === "panel") sumPanel += p > 0 ? p : t;
      else if (issue.repo === "app") sumApp += a > 0 ? a : t;
      else {
        sumBackend += b;
        sumPanel += p;
        sumApp += a;
      }
    }

    const expectedTotal = sumBackend + sumPanel + sumApp;
    const totals = data.repoHoursTotals || { backend: 0, panel: 0, app: 0, total: 0 };
    if (
      totals.backend !== sumBackend ||
      totals.panel !== sumPanel ||
      totals.app !== sumApp ||
      totals.total !== expectedTotal
    ) {
      errors.push(
        `Descuadre aritmético en totales por repo: Reportado [Backend: ${totals.backend}h, Panel: ${totals.panel}h, App: ${totals.app}h, Total: ${totals.total}h] vs Suma Real [Backend: ${sumBackend}h, Panel: ${sumPanel}h, App: ${sumApp}h, Total: ${expectedTotal}h]`
      );
    }

    // 4. Prohibidos: Diamante.API, Diamante.Core, Diamante.Data, FluentValidation, etc.
    for (const issue of data.issues) {
      const expectedText = (issue.expectedFiles || []).join(" ");
      const allText = `${issue.title || ""} ${issue.description || ""} ${expectedText} ${issue.agentPrompt || ""}`;
      for (const term of FORBIDDEN_TERMS) {
        const escaped = term.replace(/\./g, "\\.");
        const termRegex = new RegExp(`\\b${escaped}\\b`, "i");
        if (termRegex.test(allText)) {
          errors.push(`El issue [${issue.id}] usa tecnología o namespace prohibido/no listado: "${term}".`);
        }
      }
    }

    // 5. Cada issue tiene las secciones del prompt en orden y datos de regla 11
    for (const issue of data.issues) {
      const prompt = issue.agentPrompt || "";
      let lastIndex = -1;
      let orderOk = true;
      const missingSections: string[] = [];

      for (const section of REQUIRED_PROMPT_SECTIONS) {
        const idx = prompt.indexOf(section);
        if (idx === -1) {
          missingSections.push(section);
          orderOk = false;
        } else if (idx < lastIndex) {
          orderOk = false;
        } else {
          lastIndex = idx;
        }
      }

      if (missingSections.length > 0) {
        errors.push(`El issue [${issue.id}] no contiene las secciones obligatorias en su agentPrompt: ${missingSections.join(", ")}`);
      } else if (!orderOk) {
        errors.push(`El issue [${issue.id}] no respeta el orden estricto de secciones en agentPrompt.`);
      }

      if (!issue.estimation || typeof issue.estimation.totalHours !== "number") {
        errors.push(`El issue [${issue.id}] carece de estimación numérica conforme a la regla 11.`);
      }
    }

    // 6. Los "Depende de ISSUE-N" apuntan a issues que existen
    const issueIds = new Set(data.issues.map((i) => i.id.toUpperCase()));
    for (const issue of data.issues) {
      const deps = issue.dependencies || [];
      for (const dep of deps) {
        const trimmed = dep.trim();
        if (trimmed && trimmed.toLowerCase() !== "ninguna") {
          const match = trimmed.match(/\b([A-Z]+-\d+)\b/i);
          if (match && match[1]) {
            const targetId = match[1].toUpperCase();
            if (!issueIds.has(targetId) && targetId !== issue.id.toUpperCase()) {
              errors.push(`El issue [${issue.id}] declara dependencia inexistente: "${dep}" (no existe ${targetId}).`);
            }
          }
        }
      }
    }

    // 7. Marcas de tiempo citadas existen en la transcripción
    if (transcript && transcript.trim().length > 0) {
      const tsRegex = /\[(\d{1,2}:\d{2})\]/g;
      for (const issue of data.issues) {
        const criteriaText = (issue.acceptanceCriteria || []).join(" ");
        const text = `${issue.title || ""} ${issue.description || ""} ${criteriaText}`;
        let tsMatch: RegExpExecArray | null;
        while ((tsMatch = tsRegex.exec(text)) !== null) {
          const ts = tsMatch[1];
          if (ts && !transcript.includes(ts)) {
            errors.push(`El issue [${issue.id}] cita una marca de tiempo inexistente en la transcripción: "[${ts}]".`);
          }
        }
      }
    }

    // 8. Más de 8 preguntas globales
    if (data.globalOpenQuestions && data.globalOpenQuestions.length > 8) {
      errors.push(`Se formularon ${data.globalOpenQuestions.length} preguntas globales abiertas (el límite máximo permitido es 8).`);
    }

    // AVISOS (Warnings)
    // Aviso: Frase "si esta parte no está resuelta, detente" en más de la mitad de issues
    let stopPhraseCount = 0;
    const stopPhraseRegex = /si (?:esta|la) parte (?:no está resuelta|pendiente)[^.,\n]*detente/i;
    for (const issue of data.issues) {
      if (stopPhraseRegex.test(issue.agentPrompt || "")) {
        stopPhraseCount++;
      }
    }
    if (data.issues.length > 0 && stopPhraseCount > data.issues.length / 2) {
      warnings.push(`La frase 'si esta parte no está resuelta, detente' se repite en ${stopPhraseCount} de ${data.issues.length} issues.`);
    }

    // Aviso: Issue de la app que modifica rutas compartidas con el panel en lugar de /api/mobile/...
    for (const issue of data.issues) {
      if (issue.repo === "app") {
        const expectedText = (issue.expectedFiles || []).join(" ");
        const text = `${issue.description || ""} ${issue.agentPrompt || ""} ${expectedText}`;
        if (text.includes("/api/") && !text.includes("/api/mobile/")) {
          warnings.push(`El issue [${issue.id}] de App Móvil menciona rutas API generales sin /api/mobile/...`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  public static sanitizeAndAutocorrect(data: GeneratedMeetingData): GeneratedMeetingData {
    let bSum = 0;
    let pSum = 0;
    let aSum = 0;

    const cleanedIssues = data.issues.map((issue) => {
      let cleanedPrompt = issue.agentPrompt || "";
      cleanedPrompt = cleanedPrompt
        .replace(/el Paso 1 indica\s*/gi, "")
        .replace(/según el Paso 1,?\s*/gi, "")
        .replace(/en el Paso 2\s*/gi, "");

      cleanedPrompt = cleanedPrompt.replace(/BITORACA\.md/gi, "BITACORA.md");
      const cleanedExpectedFiles = (issue.expectedFiles || []).map((f) => f.replace(/BITORACA\.md/gi, "BITACORA.md"));

      const b = Number(issue.estimation?.backendHours) || 0;
      const p = Number(issue.estimation?.panelHours) || 0;
      const a = Number(issue.estimation?.appHours) || 0;
      const t = Number(issue.estimation?.totalHours) || (b + p + a);

      if (issue.repo === "backend") bSum += b > 0 ? b : t;
      else if (issue.repo === "panel") pSum += p > 0 ? p : t;
      else if (issue.repo === "app") aSum += a > 0 ? a : t;

      return {
        ...issue,
        agentPrompt: cleanedPrompt,
        expectedFiles: cleanedExpectedFiles
      };
    });

    const cleanedSummary = (data.summary || "")
      .replace(/el Paso 1 indica\s*/gi, "")
      .replace(/según el Paso 1,?\s*/gi, "");

    return {
      ...data,
      summary: cleanedSummary,
      issues: cleanedIssues,
      repoHoursTotals: {
        backend: bSum,
        panel: pSum,
        app: aSum,
        total: bSum + pSum + aSum
      }
    };
  }
}
