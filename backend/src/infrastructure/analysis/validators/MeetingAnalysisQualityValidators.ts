import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { ExtractionPointDto } from "../MeetingAnalysisResponseParser.js";
import { GLOSSARY_TERMS } from "./MeetingAnalysisErrorValidators.js";

export const REFERENCE_HOURS_TABLE: Record<string, number> = {
  "cambio de texto": 2,
  "etiqueta": 2,
  "select con búsqueda": 4,
  "select": 4,
  "exportación a excel": 8,
  "exportacion a excel": 8,
  "botón de exportación": 4,
  "boton de exportacion": 4,
  "borrado masivo": 8,
  "reprogramación": 8,
  "reprogramacion": 8,
  "dimensionamiento": 8
};

export class MeetingAnalysisQualityValidators {
  public static validateWarnings(
    data: GeneratedMeetingData,
    transcript?: string,
    extractionPoints?: ExtractionPointDto[]
  ): string[] {
    const warnings: string[] = [];

    // 15. Un issue NO BLOQUEADO que contiene la frase de detención sin parte pendiente sin default
    const stopPhraseRegex = /si (?:esta|la) parte (?:no está resuelta|pendiente)[^.,\n]*detente/i;
    for (const issue of data.issues) {
      const isBlocked = issue.title.toLowerCase().includes("bloquead") || issue.priority === "high";
      if (!isBlocked && stopPhraseRegex.test(issue.agentPrompt || "")) {
        warnings.push(
          `El issue [${issue.id}] no está bloqueado pero incluye la frase de detención sin una parte pendiente sin valor por defecto.`
        );
      }
    }

    // 16. Más del 40 % de los issues están BLOQUEADOS
    if (data.issues.length > 0) {
      const blockedCount = data.issues.filter(
        (i) => i.title.toLowerCase().includes("bloquead") || (i.openQuestions && i.openQuestions.some((q) => q.includes("[BLOQUEANTE]")))
      ).length;
      if (blockedCount / data.issues.length > 0.4) {
        warnings.push(
          `Más del 40 % de los issues están BLOQUEADOS (${blockedCount} de ${data.issues.length}). Revisar si existen valores por defecto razonables con [Supuesto].`
        );
      }
    }

    // 17. Término entre comillas que no está literal en transcripción ni glosario, y sin [Interpretación]
    if (transcript && transcript.trim().length > 0) {
      const quotedRegex = /"([^"\n]{4,30})"/g;
      for (const issue of data.issues) {
        const text = `${issue.title || ""} ${issue.description || ""}`;
        let qMatch: RegExpExecArray | null;
        while ((qMatch = quotedRegex.exec(text)) !== null) {
          if (!qMatch[1]) continue;
          const term = qMatch[1].trim();
          const inTranscript = transcript.toLowerCase().includes(term.toLowerCase());
          const inGlossary = GLOSSARY_TERMS.some((g) => g.toLowerCase().includes(term.toLowerCase()));
          const hasInterpretation = text.includes("[Interpretación") || text.includes("PROPUESTO");
          if (!inTranscript && !inGlossary && !hasInterpretation) {
            warnings.push(
              `El término entre comillas "${term}" en [${issue.id}] no aparece literal en la transcripción ni en el glosario, y no lleva [Interpretación].`
            );
          }
        }
      }
    }

    // 18. Estimación que se desvía más de 50 % de la tabla de referencia sin justificación de una línea
    for (const issue of data.issues) {
      const titleLower = issue.title.toLowerCase();
      for (const [key, refHours] of Object.entries(REFERENCE_HOURS_TABLE)) {
        if (titleLower.includes(key)) {
          const estimated = Number(issue.estimation?.totalHours) || 0;
          if (estimated > 0) {
            const diff = Math.abs(estimated - refHours) / refHours;
            if (diff > 0.5 && !issue.description?.toLowerCase().includes("justifica") && !issue.agentPrompt?.toLowerCase().includes("justifica")) {
              warnings.push(
                `La estimación del issue [${issue.id}] (${estimated}h) se desvía más del 50 % de la referencia (${refHours}h para "${key}") sin justificación explícita.`
              );
            }
          }
          break;
        }
      }
    }

    // 19. Más de una entrada de backlog con la misma cita de origen
    if (data.backlog && data.backlog.length > 1) {
      const seenQuotes = new Set<string>();
      for (const item of data.backlog) {
        const tsMatch = item.match(/\[(\d{1,2}:\d{2})\]/);
        if (tsMatch && tsMatch[1]) {
          const ts = tsMatch[1];
          if (seenQuotes.has(ts)) {
            warnings.push(`Existe más de una entrada de backlog con la misma marca de tiempo [${ts}] (posible duplicado).`);
          }
          seenQuotes.add(ts);
        }
      }
    }

    // 20. Issue de app cuyo punto de origen no menciona la app, el operario o el supervisor móvil
    for (const issue of data.issues) {
      if (issue.repo === "app") {
        const text = `${issue.title || ""} ${issue.description || ""} ${issue.agentPrompt || ""}`.toLowerCase();
        const mentionsMobile = text.includes("app") || text.includes("móvil") || text.includes("movil") || text.includes("operario") || text.includes("supervisor");
        if (!mentionsMobile) {
          warnings.push(`El issue [${issue.id}] está asignado a App Móvil pero su descripción no menciona la app, operario o supervisor móvil.`);
        }
      }
    }

    return warnings;
  }

  public static sanitizeAndAutocorrect(data: GeneratedMeetingData): GeneratedMeetingData {
    let bSum = 0;
    let pSum = 0;
    let aSum = 0;

    const cleanedIssues = data.issues.map((issue) => {
      let cleanedPrompt = issue.agentPrompt || "";
      cleanedPrompt = cleanedPrompt
        .replace(/el Paso\s*[12]\s*indica\s*/gi, "")
        .replace(/según el Paso\s*[12],?\s*/gi, "")
        .replace(/en el Paso\s*[12]\s*/gi, "")
        .replace(/Etapa\s*[12]\s*/gi, "");

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
      .replace(/el Paso\s*[12]\s*indica\s*/gi, "")
      .replace(/según el Paso\s*[12],?\s*/gi, "");

    // Autocorrección de preguntas BLOQUEANTE no ancladas a issue o sin 'si me equivoco' -> degradar a NO BLOQUEANTE
    const cleanedQuestions = (data.globalOpenQuestions || []).map((q) => {
      if (q.includes("[BLOQUEANTE]")) {
        const hasIssueRef = /\b([A-Z]+-\d+)\b/i.test(q);
        const hasWorkRedo = /si me equivoco/i.test(q);
        if (!hasIssueRef || !hasWorkRedo) {
          return q.replace("[BLOQUEANTE]", "[NO BLOQUEANTE]");
        }
      }
      return q;
    });

    return {
      ...data,
      summary: cleanedSummary,
      globalOpenQuestions: cleanedQuestions,
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
