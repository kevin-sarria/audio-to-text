import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { ExtractionPointDto } from "../MeetingAnalysisResponseParser.js";

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

export const GLOSSARY_TERMS = [
  "aislamientos",
  "san vicente",
  "hospital san vicente fundación",
  "bicitrack",
  "matriz de maquinaria",
  "máquina descripción",
  "cubrimientos cali",
  "sociedad portuaria"
];

export class MeetingAnalysisErrorValidators {
  public static validateErrors(
    data: GeneratedMeetingData,
    transcript?: string,
    extractionPoints?: ExtractionPointDto[]
  ): string[] {
    const errors: string[] = [];

    // 1. El texto no contiene "Paso 1", "Paso 2" ni otras etapas internas
    const internalStageRegex = /\b(Paso\s*[12]|Step\s*[12]|Etapa\s*[12]|el análisis previo|la lista extraída)\b/i;
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
            `El issue [${issue.id}] cita un documento no permitido: "${docName}". Permitidos: ${Array.from(ALLOWED_DOCUMENTS).join(", ")}`
          );
        }
      }
    }

    // 3. Prohibidos: Diamante.API, Diamante.Core, Diamante.Data, FluentValidation, Yup, Zod, TanStack
    for (const issue of data.issues) {
      const expectedText = (issue.expectedFiles || []).join(" ");
      const allText = `${issue.title || ""} ${issue.description || ""} ${expectedText} ${issue.agentPrompt || ""}`;
      for (const term of FORBIDDEN_TERMS) {
        const escaped = term.replace(/\./g, "\\.");
        const termRegex = new RegExp(`\\b${escaped}\\b`, "i");
        if (termRegex.test(allText)) {
          errors.push(`El issue [${issue.id}] usa tecnología o namespace prohibido: "${term}".`);
        }
      }

      // ClosedXML y EPPlus solo dentro de "verificar en el repo"
      for (const restricted of ["ClosedXML", "EPPlus"]) {
        const rRegex = new RegExp(`\\b${restricted}\\b`, "i");
        if (rRegex.test(allText) && !allText.toLowerCase().includes("verificar en el repo")) {
          errors.push(`El issue [${issue.id}] usa "${restricted}" sin rotularlo '(verificar en el repo)'.`);
        }
      }
    }

    // 4. Secciones obligatorias del prompt en orden
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
        errors.push(`El issue [${issue.id}] no contiene las secciones obligatorias: ${missingSections.join(", ")}`);
      } else if (!orderOk) {
        errors.push(`El issue [${issue.id}] no respeta el orden estricto de secciones en agentPrompt.`);
      }
    }

    // 5. Los campos de horas contienen solo números y Total = Backend + Panel + App
    for (const issue of data.issues) {
      const est = issue.estimation;
      if (!est) {
        errors.push(`El issue [${issue.id}] carece de estimación numérica conforme a la regla 11.`);
        continue;
      }
      const b = Number(est.backendHours);
      const p = Number(est.panelHours);
      const a = Number(est.appHours);
      const t = Number(est.totalHours);

      if (isNaN(b) || isNaN(p) || isNaN(a) || isNaN(t)) {
        errors.push(`El issue [${issue.id}] contiene valores no numéricos en los campos de horas.`);
      } else if (t !== b + p + a) {
        errors.push(`El issue [${issue.id}] tiene descuadre en estimación: Total (${t}h) != Backend (${b}h) + Panel (${p}h) + App (${a}h).`);
      }
    }

    // 6. Los totales por repo son la suma real de los issues
    let sumBackend = 0;
    let sumPanel = 0;
    let sumApp = 0;
    for (const issue of data.issues) {
      const b = Number(issue.estimation?.backendHours) || 0;
      const p = Number(issue.estimation?.panelHours) || 0;
      const a = Number(issue.estimation?.appHours) || 0;
      if (issue.repo === "backend") sumBackend += b > 0 ? b : (Number(issue.estimation?.totalHours) || 0);
      else if (issue.repo === "panel") sumPanel += p > 0 ? p : (Number(issue.estimation?.totalHours) || 0);
      else if (issue.repo === "app") sumApp += a > 0 ? a : (Number(issue.estimation?.totalHours) || 0);
      else {
        sumBackend += b;
        sumPanel += p;
        sumApp += a;
      }
    }
    const expectedTotal = sumBackend + sumPanel + sumApp;
    const totals = data.repoHoursTotals || { backend: 0, panel: 0, app: 0, total: 0 };
    if (totals.backend !== sumBackend || totals.panel !== sumPanel || totals.app !== sumApp || totals.total !== expectedTotal) {
      errors.push(
        `Descuadre aritmético en totales por repo: Reportado [Backend: ${totals.backend}h, Panel: ${totals.panel}h, App: ${totals.app}h, Total: ${totals.total}h] vs Suma Real [Backend: ${sumBackend}h, Panel: ${sumPanel}h, App: ${sumApp}h, Total: ${expectedTotal}h]`
      );
    }

    // 7. Dependencias que apuntan a issues inexistentes
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

    // 8. Marcas de tiempo citadas existen en la transcripción
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

    // 9. Solo etiquetas permitidas (Regla 19)
    const allowedTagRegex = /^\[(Supuesto|Interpretación:?.*|Derivado de [A-Z]+-\d+|\d{1,2}:\d{2}|Backend|Panel|App|BLOQUEADO|NO BLOQUEANTE|BLOQUEANTE)\]$/i;
    const bracketRegex = /\[([^\]]+)\]/g;
    for (const issue of data.issues) {
      const checkText = `${issue.title || ""} ${issue.description || ""} ${(issue.acceptanceCriteria || []).join(" ")}`;
      let m: RegExpExecArray | null;
      while ((m = bracketRegex.exec(checkText)) !== null) {
        if (!m[1]) continue;
        const fullTag = `[${m[1]}]`;
        if (!allowedTagRegex.test(fullTag)) {
          errors.push(`El issue [${issue.id}] usa una etiqueta entre corchetes no permitida (Regla 19): "${fullTag}".`);
        }
      }
    }

    // 10. Cada issue proviene de puntos con clase = nuevo y accion = codigo
    if (extractionPoints && extractionPoints.length > 0) {
      for (const issue of data.issues) {
        const issueText = `${issue.title || ""} ${issue.description || ""}`.toLowerCase();
        for (const pt of extractionPoints) {
          if (pt.clase !== "nuevo" || pt.accion !== "codigo") {
            const citeSub = (pt.cita || "").slice(0, 30).toLowerCase();
            if (citeSub.length > 10 && issueText.includes(citeSub)) {
              errors.push(
                `El issue [${issue.id}] proviene del punto [${pt.id}] clasificado como '${pt.clase}/${pt.accion}', pero solo se permiten issues de 'nuevo/codigo'.`
              );
            }
          }
        }
      }
    }

    // 11. Más de 8 preguntas globales
    if (data.globalOpenQuestions && data.globalOpenQuestions.length > 8) {
      errors.push(`Se formularon ${data.globalOpenQuestions.length} preguntas globales abiertas (máximo permitido: 8).`);
    }

    // 12. Toda hora o cifra no ambigua aparece literal en transcripción o lleva [Interpretación]
    if (transcript && transcript.trim().length > 0) {
      const fixedTimeRegex = /\b(19:00|06:00|7:00\s*(?:p\.?m\.?|a\.?m\.?)|entre\s*06:00\s*y\s*19:00)\b/gi;
      const allText = `${data.summary || ""} ${data.issues.map((i) => `${i.title} ${i.description}`).join(" ")} ${(data.globalOpenQuestions || []).join(" ")}`;
      let timeMatch: RegExpExecArray | null;
      while ((timeMatch = fixedTimeRegex.exec(allText)) !== null) {
        const matchedStr = timeMatch[0];
        if (!transcript.includes(matchedStr) && !allText.includes(`[Interpretación:`) && !allText.includes(`[Interpretación]`)) {
          errors.push(
            `Se fijó la hora o rango "${matchedStr}" que no aparece literal en la transcripción ni lleva [Interpretación] (Regla 2).`
          );
        }
      }
    }

    // 13. Pregunta BLOQUEANTE nombra el issue que bloquea y trae "si me equivoco"
    for (const q of data.globalOpenQuestions || []) {
      if (q.includes("[BLOQUEANTE]")) {
        const hasIssueRef = /\b([A-Z]+-\d+)\b/i.test(q);
        const hasWorkRedo = /si me equivoco/i.test(q);
        if (!hasIssueRef || !hasWorkRedo) {
          errors.push(
            `La pregunta BLOQUEANTE "${q}" no cumple las 3 condiciones (debe nombrar el issue que bloquea y contener 'si me equivoco').`
          );
        }
      }
    }

    // 14. Pregunta global que contiene un término del glosario junto a "no se entiende", "con certeza" o "ilegible"
    const noiseDoubtRegex = /\b(no se entiende|con certeza|ilegible|duda de vocabulario|cómo se escribe)\b/i;
    for (const q of data.globalOpenQuestions || []) {
      if (noiseDoubtRegex.test(q)) {
        for (const term of GLOSSARY_TERMS) {
          if (q.toLowerCase().includes(term.toLowerCase())) {
            errors.push(
              `La pregunta global "${q}" cuestiona el término del glosario "${term}" como ruido o duda de vocabulario (Regla 2 y Glosario).`
            );
          }
        }
      }
    }

    return errors;
  }
}
