import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { ExtractionPointDto } from "../MeetingAnalysisResponseParser.js";
import { ProjectProfile } from "../profiles/ProjectProfile.js";
import { DIAMANTE_PROFILE } from "../profiles/diamanteProfile.js";
import { normalizeText, parseCitedSeconds } from "../TranscriptIndex.js";
import { TranscriptCoverageDetector } from "../TranscriptCoverageDetector.js";

export const REQUIRED_PROMPT_SECTIONS = [
  "Rol y Objetivo",
  "Contexto",
  "Pasos numerados",
  "Restricciones",
  "Criterios de Aceptación",
  "Verificación"
];

const TRAILING_CONNECTOR_REGEX =
  /(?:[,:;(\-]|\b(y|o|de|del|la|el|que|con|para|en|a|por))\s*$/i;

const FORBIDDEN_TITLE_TAGS_REGEX =
  /\b(PROPUESTO|por confirmar)\b|\[(Supuesto|Interpretación|Derivado)[^\]]*\]|\([^)]*\)/i;

const EXTRA_SCOPE_TITLE_REGEX = /\b(centraliz\w*|refactor\w*|unific\w*)\b/i;

/**
 * Regex de un término sensible del perfil que acepta singular y plural ("roles" → rol/roles,
 * "límites" → límite/límites). "límites de tiempo" no cuenta como límite de registros.
 */
function sensitiveTermRegex(term: string): RegExp | null {
  const norm = normalizeText(term).trim();
  if (!norm) return null;
  let base = norm;
  if (/[lrnd]es$/.test(norm)) base = norm.slice(0, -2);
  else if (/s$/.test(norm)) base = norm.slice(0, -1);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:es|s)?\\b(?! de tiempo)`);
}

export class MeetingAnalysisV10Validators {
  public static validateErrors(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    errors: string[],
    profile: ProjectProfile = DIAMANTE_PROFILE,
    extractionPoints?: ExtractionPointDto[]
  ): void {
    const rawTranscript = transcript || "";
    const transcriptNorm = normalizeText(rawTranscript);

    // 1. Términos internos (B7) en cualquier texto de salida
    if (profile.internalTerms && profile.internalTerms.length > 0) {
      const outputBlobs: Array<{ location: string; text: string }> = [
        { location: "el resumen", text: data.summary || "" },
        ...(data.alreadyResolved || []).map((t) => ({ location: `Ya resuelto ("${t.slice(0, 40)}…")`, text: t })),
        ...(data.inProgress || []).map((t) => ({ location: `En curso ("${t.slice(0, 40)}…")`, text: t })),
        ...(data.keyDecisions || []).map((t) => ({ location: `Decisiones clave ("${t.slice(0, 40)}…")`, text: t })),
        ...(data.globalOpenQuestions || []).map((t) => ({ location: `Preguntas abiertas ("${t.slice(0, 40)}…")`, text: t })),
        ...(data.backlog || []).map((t) => ({ location: `Backlog ("${t.slice(0, 40)}…")`, text: t }))
      ];

      for (const issue of data.issues || []) {
        outputBlobs.push(
          { location: `el título del issue [${issue.id}]`, text: issue.title || "" },
          { location: `la descripción del issue [${issue.id}]`, text: issue.description || "" },
          { location: `los criterios del issue [${issue.id}]`, text: (issue.acceptanceCriteria || []).join(" ") },
          { location: `el prompt del issue [${issue.id}]`, text: issue.agentPrompt || "" },
          { location: `las preguntas del issue [${issue.id}]`, text: (issue.openQuestions || []).join(" ") }
        );
      }

      for (const term of profile.internalTerms) {
        const termNorm = normalizeText(term);
        if (!termNorm) continue;
        for (const blob of outputBlobs) {
          if (normalizeText(blob.text).includes(termNorm)) {
            errors.push(
              `${blob.location} filtra términos internos prohibidos ("${term}").`
            );
          }
        }
      }
    }

    // 2. Bloque de prompt incompleto
    for (const issue of data.issues || []) {
      const prompt = (issue.agentPrompt || "").trim();
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
        errors.push(
          `El issue [${issue.id}] no contiene las secciones obligatorias del prompt: ${missingSections.join(", ")}.`
        );
      } else if (!orderOk) {
        errors.push(`El issue [${issue.id}] no respeta el orden estricto de secciones en agentPrompt.`);
      }

      if (TRAILING_CONNECTOR_REGEX.test(prompt)) {
        errors.push(
          `El prompt del issue [${issue.id}] está incompleto o termina con puntuación o conector suelto.`
        );
      }
    }

    // 3. Título con etiquetas o paréntesis
    for (const issue of data.issues || []) {
      const rawTitle = issue.title || "";
      const strippedTitle = rawTitle.replace(/^\s*\[(Backend|Panel|App|Otro)\]\s*/i, "");

      if (FORBIDDEN_TITLE_TAGS_REGEX.test(strippedTitle)) {
        errors.push(
          `El título del issue [${issue.id}] ("${rawTitle}") contiene etiquetas prohibidas o paréntesis.`
        );
      }
    }

    // 4. Hora del día no literal fuera de marcas de tiempo
    if (rawTranscript.trim().length > 0) {
      const allText = [
        data.summary || "",
        ...(data.alreadyResolved || []),
        ...(data.inProgress || []),
        ...(data.keyDecisions || []),
        ...(data.globalOpenQuestions || []),
        ...(data.backlog || []),
        ...(data.issues || []).map((i) => `${i.title || ""} ${i.description || ""} ${(i.acceptanceCriteria || []).join(" ")}`)
      ].join(" ");

      // Quita los corchetes que solo contienen marcas de tiempo ("[05:44]", "[16:05, 22:07]",
      // "[29:19, cierre 32:58]", "[mm:ss–mm:ss]"). Una hora dentro de "[Interpretación: … → 19:00]"
      // o "[Supuesto] … 19:00" sí se revisa. La existencia de cada marca la valida otro validador.
      const withoutTimestamps = allText.replace(/\[[^\]]*\]/g, (group) => {
        const rest = group
          .slice(1, -1)
          .replace(/\d{1,3}:\d{2}/g, "")
          .replace(/\b(?:cierre|y|a|al)\b/gi, "")
          .replace(/[\s,;–\-]/g, "");
        return rest.length === 0 ? "" : group;
      });
      const timePattern = /\b(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?|am|pm))\b/gi;
      let m: RegExpExecArray | null;
      const seenTimes = new Set<string>();

      while ((m = timePattern.exec(withoutTimestamps)) !== null) {
        const timeStr = m[0];
        if (seenTimes.has(timeStr.toLowerCase())) continue;
        seenTimes.add(timeStr.toLowerCase());

        const regexLiteral = new RegExp(`\\b${timeStr.replace(/\./g, "\\.")}\\b`, "i");
        if (!regexLiteral.test(rawTranscript)) {
          errors.push(
            `Se fijó la hora o rango "${timeStr}" que no aparece literal en la transcripción ni lleva [Interpretación] (Regla A2).`
          );
        }
      }
    }

    // 5. Alcance extra en títulos (centraliz*, refactor*, unific*)
    for (const issue of data.issues || []) {
      const title = issue.title || "";
      const match = title.match(EXTRA_SCOPE_TITLE_REGEX);
      if (match && match[1]) {
        const root = match[1].toLowerCase();
        const rootStem = root.slice(0, 7);
        if (!transcriptNorm.includes(rootStem)) {
          errors.push(
            `El título del issue [${issue.id}] añade alcance no solicitado ("${match[1]}") ausente de la transcripción.`
          );
        }
      }
    }

    // 7. Rutas móviles fuera del prefijo
    if (profile.mobileRoutePrefix) {
      const prefix = profile.mobileRoutePrefix.toLowerCase();
      for (const issue of data.issues || []) {
        if (issue.repo === "app") {
          const body = `${issue.title || ""} ${issue.description || ""} ${(issue.acceptanceCriteria || []).join(" ")} ${issue.agentPrompt || ""}`;
          const routeRegex = /\/api\/[a-zA-Z0-9_\-/]+/g;
          let rMatch: RegExpExecArray | null;
          while ((rMatch = routeRegex.exec(body)) !== null) {
            const route = rMatch[0].toLowerCase();
            if (!route.startsWith(prefix)) {
              errors.push(
                `El issue de App [${issue.id}] menciona una ruta ("${rMatch[0]}") que no empieza por el prefijo móvil obligatorio "${profile.mobileRoutePrefix}".`
              );
            }
          }
        }
      }
    }

    // 8. Roles/permisos/límites inventados (sensitiveScopeTerms, A1): se revisan el resumen, las
    //    preguntas, las decisiones y los issues (v8: Gemini preguntó por roles y límites que nadie mencionó).
    if (profile.sensitiveScopeTerms && profile.sensitiveScopeTerms.length > 0 && rawTranscript.trim().length > 0) {
      const assertionTexts: Array<{ where: string; text: string }> = [
        { where: "el resumen", text: data.summary || "" },
        ...(data.globalOpenQuestions || []).map((q) => ({ where: `la pregunta "${q.slice(0, 60)}…"`, text: q })),
        ...(data.keyDecisions || []).map((d) => ({ where: `la decisión "${d.slice(0, 60)}…"`, text: d })),
        ...(data.issues || []).map((i) => ({
          where: `el issue [${i.id}]`,
          text: `${i.title || ""} ${i.description || ""} ${(i.acceptanceCriteria || []).join(" ")}`
        }))
      ];
      for (const term of profile.sensitiveScopeTerms) {
        const termRegex = sensitiveTermRegex(term);
        if (!termRegex || termRegex.test(transcriptNorm)) continue;
        for (const item of assertionTexts) {
          if (termRegex.test(normalizeText(item.text))) {
            errors.push(`${item.where} menciona ${term}, que no se habló en la reunión (Regla A1).`);
          }
        }
      }
    }
  }

  public static validateWarnings(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    warnings: string[],
    profile: ProjectProfile = DIAMANTE_PROFILE,
    extractionPoints?: ExtractionPointDto[]
  ): void {
    // 6. Sustantivo del requerimiento cambiado
    if (extractionPoints && extractionPoints.length > 0 && data.issues && data.issues.length > 0) {
      const nounChangeRegex = /\b([a-záéíóúñ]+)\s+de\s+(?:las|los|la|el)\s+([a-záéíóúñ]+)\b/gi;

      for (const pt of extractionPoints) {
        if (!pt.cita) continue;
        let match: RegExpExecArray | null;
        while ((match = nounChangeRegex.exec(pt.cita)) !== null) {
          const nounA = match[1]?.toLowerCase() || "";
          const nounB = match[2]?.toLowerCase() || "";
          if (nounA.length < 3 || nounB.length < 3) continue;

          const ptSec = pt.timestamp ? TranscriptCoverageDetector.parseSeconds(pt.timestamp) : -1;

          for (const issue of data.issues) {
            const issueBody = `${issue.title || ""} ${issue.description || ""}`.toLowerCase();
            const citedSecs = parseCitedSeconds(issueBody);
            const matchesTime = ptSec >= 0 && citedSecs.some((sec) => Math.abs(sec - ptSec) <= 15);
            // Solo issues que citan el mismo tramo: compartir una palabra suelta no basta (evita falsos avisos).
            if (matchesTime && issueBody.includes(nounB) && !issueBody.includes(nounA)) {
              warnings.push(
                `El issue [${issue.id}] cambió "${match[0]}" por "${nounB}".`
              );
            }
          }
        }
      }
    }
  }

  public static sanitizeAndAutocorrect(
    data: GeneratedMeetingData,
    transcript?: string
  ): GeneratedMeetingData {
    // 9. Análisis parcial (A14)
    if (transcript && transcript.trim().length > 0) {
      const coverage = TranscriptCoverageDetector.analyze(transcript);
      if (coverage.coveragePct >= 90 && coverage.gaps.length > 0) {
        const hasGapOver60 = coverage.gaps.some((g) => (g.endSec - g.startSec) >= 60);
        if (hasGapOver60) {
          const gapsStr = coverage.gaps.map((g) => g.label).join(", ");
          const partialPrefix = `Análisis parcial: faltan [${gapsStr}] (~${coverage.missingPct}% de la reunión)`;
          const currentSummary = (data.summary || "").trim();
          if (!currentSummary.toLowerCase().startsWith("análisis parcial")) {
            data.summary = currentSummary ? `${partialPrefix}\n\n${currentSummary}` : partialPrefix;
          }
        }
      }
    }

    return data;
  }
}
