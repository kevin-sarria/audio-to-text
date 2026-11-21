import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { ExtractionPointDto } from "../MeetingAnalysisResponseParser.js";
import { MeetingAnalysisV8Validators } from "./MeetingAnalysisV8Validators.js";
import { MeetingAnalysisV9Validators } from "./MeetingAnalysisV9Validators.js";
import { MeetingAnalysisV10Validators } from "./MeetingAnalysisV10Validators.js";
import { MeetingAnalysisCoverageValidators } from "./MeetingAnalysisCoverageValidators.js";
import { ExtractionPointNormalizer } from "../ExtractionPointNormalizer.js";
import { TranscriptCoverageDetector } from "../TranscriptCoverageDetector.js";
import { normalizeText } from "../TranscriptIndex.js";
import { ProjectProfile } from "../profiles/ProjectProfile.js";
import { DIAMANTE_PROFILE } from "../profiles/diamanteProfile.js";

export const REFERENCE_HOURS_TABLE: Record<string, number> = {};
for (const entry of DIAMANTE_PROFILE.referenceHours) {
  for (const k of entry.keys) {
    REFERENCE_HOURS_TABLE[k] = entry.hours;
  }
}

export class MeetingAnalysisQualityValidators {
  public static validateWarnings(
    data: GeneratedMeetingData,
    transcript?: string,
    extractionPoints?: ExtractionPointDto[],
    profile: ProjectProfile = DIAMANTE_PROFILE
  ): string[] {
    const warnings: string[] = [];

    // 15. Un issue NO BLOQUEADO que contiene la frase de detención sin parte pendiente sin default
    const stopPhraseRegex = /\bdetente\b/i;
    for (const issue of data.issues || []) {
      const isBlocked =
        issue.title.toLowerCase().includes("bloquead") ||
        (issue.openQuestions || []).some((q) => q.includes("[BLOQUEANTE]"));
      if (!isBlocked && stopPhraseRegex.test(issue.agentPrompt || "")) {
        warnings.push(
          `El issue [${issue.id}] no está bloqueado pero incluye la frase de detención sin una parte pendiente sin valor por defecto.`
        );
      }
    }

    // 16. Más del 40 % de los issues están BLOQUEADOS
    if (data.issues && data.issues.length > 0) {
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
      const glossary = profile.glossaryTerms || [];
      for (const issue of data.issues || []) {
        const text = `${issue.title || ""} ${issue.description || ""}`;
        let qMatch: RegExpExecArray | null;
        while ((qMatch = quotedRegex.exec(text)) !== null) {
          if (!qMatch[1]) continue;
          const term = qMatch[1].trim();
          const inTranscript = transcript.toLowerCase().includes(term.toLowerCase());
          const inGlossary = glossary.some((g) => g.toLowerCase().includes(term.toLowerCase()));
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
    if (profile.referenceHours && profile.referenceHours.length > 0) {
      for (const issue of data.issues || []) {
        const titleLower = (issue.title || "").toLowerCase();
        for (const entry of profile.referenceHours) {
          const matchedKey = entry.keys.find((k) => titleLower.includes(k.toLowerCase()));
          if (matchedKey) {
            const estimated = Number(issue.estimation?.totalHours) || 0;
            if (estimated > 0) {
              const diff = Math.abs(estimated - entry.hours) / entry.hours;
              if (
                diff > 0.5 &&
                !issue.description?.toLowerCase().includes("justifica") &&
                !issue.agentPrompt?.toLowerCase().includes("justifica")
              ) {
                warnings.push(
                  `La estimación del issue [${issue.id}] (${estimated}h) se desvía más del 50 % de la referencia (${entry.hours}h para "${matchedKey}") sin justificación explícita.`
                );
              }
            }
            break;
          }
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

    // 20. Siglas que no están en la transcripción ni en el glosario
    MeetingAnalysisV8Validators.validateWarnings(data, transcript, warnings, profile);

    // 21. Avisos de cobertura de transcripción (citas < 30s de tramos sin audio)
    MeetingAnalysisCoverageValidators.validateCoverageWarnings(data, transcript, warnings);

    // 22. Avisos v9: entradas resueltas sin marcas citadas, nombres inventados
    MeetingAnalysisV9Validators.validateWarnings(data, transcript, warnings, extractionPoints, profile);

    // 23. Avisos v10: sustantivo del requerimiento cambiado
    MeetingAnalysisV10Validators.validateWarnings(data, transcript, warnings, profile, extractionPoints);

    return warnings;
  }

  public static sanitizeAndAutocorrect(
    data: GeneratedMeetingData,
    transcript?: string,
    profile: ProjectProfile = DIAMANTE_PROFILE
  ): GeneratedMeetingData {
    let bSum = 0;
    let pSum = 0;
    let aSum = 0;

    const blockingQuestions = (data.globalOpenQuestions || []).filter(
      (q) => q.includes("[BLOQUEANTE]") && /si me equivoco/i.test(q)
    );
    const extraBacklog: string[] = [];

    // Separar issues que corresponden a backlog (repo 'otro', 0h o prioridad backlog)
    const filteredIssues = (data.issues || []).filter((issue) => {
      const isBacklogRepo = (issue.repo as string) === "otro" || (issue.repo as string) === "none";
      const isZeroHours = Number(issue.estimation?.totalHours) === 0;
      const isBacklogPriority = issue.priority?.toLowerCase() === "backlog";
      const hasBacklogTitle = issue.title.toLowerCase().startsWith("[backlog]");

      if (isBacklogRepo || (isZeroHours && isBacklogPriority) || (isBacklogRepo && isZeroHours) || hasBacklogTitle) {
        extraBacklog.push(`${issue.title}: ${issue.description}`);
        return false;
      }
      return true;
    });

    const cleanedIssues = filteredIssues.map((issue) => {
      let cleanedPrompt = issue.agentPrompt || "";
      cleanedPrompt = cleanedPrompt
        .replace(/el Paso\s*[12]\s*indica\s*/gi, "")
        .replace(/según el Paso\s*[12],?\s*/gi, "")
        .replace(/en el Paso\s*[12]\s*/gi, "")
        .replace(/Etapa\s*[12]\s*/gi, "");

      cleanedPrompt = cleanedPrompt.replace(/BITORACA\.md/gi, "BITACORA.md");
      const cleanedExpectedFiles = (issue.expectedFiles || []).map((f) => f.replace(/BITORACA\.md/gi, "BITACORA.md"));

      // Eliminar frase de detención si no hay pregunta bloqueante asociada a este issue
      const isBlockedByQuestion = blockingQuestions.some((q) => q && q.toUpperCase().includes(issue.id.toUpperCase()));
      if (!isBlockedByQuestion) {
        cleanedPrompt = cleanedPrompt
          .replace(/Si\s+[^.,\n]*no está resuelto,?\s*detente[^.,\n]*\./gi, "")
          .replace(/detente,?\s*repórtalo[^.,\n]*\./gi, "")
          .replace(/\bdetente\b[^.,\n]*\./gi, "")
          .trim();
      }

      // Saneamiento de dependencias: solo IDs o "Ninguna"
      const cleanedDeps = (issue.dependencies || []).map((dep) => {
        const trimmed = dep.trim();
        if (trimmed.toLowerCase() === "ninguna") return "Ninguna";
        const match = trimmed.match(/\b([A-Z]+-\d+)\b/i);
        return match && match[1] ? match[1].toUpperCase() : "Ninguna";
      });

      // Saneamiento numérico de estimación
      const parseHours = (val: unknown): number => {
        if (typeof val === "number" && !isNaN(val)) return val;
        const str = String(val || "").replace(/[^\d.]/g, "");
        const num = parseFloat(str);
        return isNaN(num) ? 0 : Math.round(num);
      };

      const b = parseHours(issue.estimation?.backendHours);
      const p = parseHours(issue.estimation?.panelHours);
      const a = parseHours(issue.estimation?.appHours);
      const parsedTotal = parseHours(issue.estimation?.totalHours);
      const t = parsedTotal > 0 && parsedTotal === b + p + a ? parsedTotal : b + p + a;

      if (issue.repo === "backend") bSum += b > 0 ? b : t;
      else if (issue.repo === "panel") pSum += p > 0 ? p : t;
      else if (issue.repo === "app") aSum += a > 0 ? a : t;

      return {
        ...issue,
        dependencies: cleanedDeps.length > 0 ? cleanedDeps : ["Ninguna"],
        estimation: {
          backendHours: b,
          panelHours: p,
          appHours: a,
          totalHours: t,
          text: `Backend: ${b}h | Panel: ${p}h | App: ${a}h | Total: ${t}h`
        },
        agentPrompt: cleanedPrompt,
        expectedFiles: cleanedExpectedFiles
      };
    });

    let cleanedSummary = (data.summary || "")
      .replace(/el Paso\s*[12]\s*indica\s*/gi, "")
      .replace(/según el Paso\s*[12],?\s*/gi, "");

    // Validar y anteponer "Análisis parcial" si existen tramos sin audio
    const coverage = transcript ? TranscriptCoverageDetector.analyze(transcript) : null;
    let finalIssues = cleanedIssues;

    if (coverage && coverage.isPartial) {
      const summaryLower = cleanedSummary.toLowerCase();
      if (!summaryLower.startsWith("análisis parcial") && !summaryLower.includes("analisis parcial")) {
        const gapLabels = coverage.gaps.map((g) => g.label).join(", ");
        cleanedSummary = `Análisis parcial: faltan [${gapLabels}] (~${coverage.missingPct}% de la reunión sin audio).\n\n${cleanedSummary}`;
      }

      // Si la cobertura es menor al 90%, no se deben generar issues
      if (coverage.coveragePct < 90) {
        finalIssues = [];
        bSum = 0;
        pSum = 0;
        aSum = 0;
        if (!cleanedSummary.toLowerCase().includes("transcripción incompleta")) {
          cleanedSummary = `Análisis parcial: transcripción incompleta, reintentar. Cobertura del ${coverage.coveragePct}% es inferior al 90% requerido.\n\n${cleanedSummary}`;
        }
      }
    }

    // Normalizar personas responsables en inProgress (sin Hablante N)
    const cleanedInProgress = (data.inProgress || []).map((prog) =>
      prog.replace(/\bHablante\s*\d+\b/gi, "sin identificar")
    );

    // Autocorrección de preguntas (reglas 3, 21 y 22)
    const transcriptNorm = normalizeText(transcript || "");
    const inventedTerms = [/\broles?\b/, /\bpermisos?\b/, /\blimites?\b/].filter((re) => transcript && !re.test(transcriptNorm));
    const closedTopics = transcript ? ExtractionPointNormalizer.closedTopics(transcript, profile) : [];
    const existingIds = new Set(finalIssues.map((i) => i.id.toUpperCase()));

    const cleanedQuestions = (data.globalOpenQuestions || [])
      .filter((q) => {
        const qNorm = normalizeText(q);
        // Preguntas sobre roles/permisos/límites que nadie planteó en la reunión
        if (inventedTerms.some((re) => re.test(qNorm))) return false;
        // Preguntas sobre ítems que se dieron por resueltos más adelante (regla 21)
        if (closedTopics.some((t) => qNorm.includes(t))) return false;
        return true;
      })
      .map((q) => {
        if (q.includes("[BLOQUEANTE]")) {
          const refs = q.match(/\b[A-Z]+-\d+\b/g) || [];
          const hasExistingIssueRef = refs.some((r) => existingIds.has(r.toUpperCase()));
          const hasWorkRedo = /si me equivoco/i.test(q);
          if (!hasExistingIssueRef || !hasWorkRedo) {
            return q.replace("[BLOQUEANTE]", "[NO BLOQUEANTE]");
          }
        }
        return q;
      });

    const combinedBacklog = [...(data.backlog || []), ...extraBacklog];

    return {
      ...data,
      summary: cleanedSummary,
      globalOpenQuestions: cleanedQuestions,
      inProgress: cleanedInProgress,
      issues: finalIssues,
      backlog: combinedBacklog,
      repoHoursTotals: {
        backend: bSum,
        panel: pSum,
        app: aSum,
        total: bSum + pSum + aSum
      }
    };
  }
}
