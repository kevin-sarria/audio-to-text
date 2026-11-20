import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto } from "@audio-to-text/shared";
import { TranscriptIndex, normalizeText, parseCitedSeconds } from "../TranscriptIndex.js";
import { MOBILE_EVIDENCE_REGEX, APP_EVIDENCE_BEFORE_SEC, APP_EVIDENCE_AFTER_SEC } from "../ExtractionPointNormalizer.js";
import {
  GLOSSARY_PEOPLE,
  PENDING_SCOPE_DECISIONS,
  glossaryAcceptedForms
} from "../glossary/ProjectGlossary.js";

/**
 * Términos de estructura de permisos/documentación que los modelos inventan (v8: Gemini
 * preguntó por roles y límites de registros y afirmó qué decía un documento). Solo son
 * válidos si la transcripción los menciona.
 */
const INVENTED_STRUCTURE_TERMS: Array<{ label: string; regex: RegExp }> = [
  { label: "roles", regex: /\broles?\b/ },
  { label: "permisos", regex: /\bpermisos?\b/ },
  { label: "límites", regex: /\blimites?\b(?! de tiempo)/ },
  { label: "perfiles de usuario", regex: /\bperfil(?:es)? de usuario/ }
];

const DOC_ASSERTION_REGEX = /\b(?:docs\/)?REGLAS_DE_NEGOCIO(?:\.md)?\b/i;

const RESPONSIBLE_REGEX =
  /(?:[Rr]esponsable|[Aa] cargo de|[Ll]o lleva|[Ll]o tiene|[Ll]e toca a|[Aa]signado a|[Dd]ueñ[oa])\s*:?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g;

function issueBody(issue: DevIssueDto): string {
  return `${issue.title || ""} ${issue.description || ""} ${(issue.acceptanceCriteria || []).join(" ")}`;
}

function mentionsTopic(text: string, topicStem: string): boolean {
  return normalizeText(text).includes(topicStem);
}

/**
 * Validadores v8 (reglas 21 y 22). Devuelven Errores (rechazar y reintentar) y avisos.
 * Todos se basan en la transcripción, no en lo que el modelo diga de sí mismo.
 */
export class MeetingAnalysisV8Validators {
  public static validateErrors(data: GeneratedMeetingData, transcript: string | undefined, errors: string[]): void {
    const issues = data.issues || [];
    const questions = data.globalOpenQuestions || [];
    const issueIds = new Set(issues.map((i) => i.id.toUpperCase()));

    // Pregunta BLOQUEANTE sin issue existente que la nombre o sin "Si me equivoco"
    for (const q of questions) {
      if (!/\[BLOQUEANTE\]/.test(q)) continue;
      const refs = q.match(/\b[A-Z]+-\d+\b/g) || [];
      if (refs.length > 0 && !refs.some((r) => issueIds.has(r.toUpperCase()))) {
        errors.push(`La pregunta BLOQUEANTE "${q}" nombra un issue que no existe (${refs.join(", ")}) (Regla 3 y 22).`);
      }
    }

    // Issue de dimensionamiento/reprogramación en repos cuyo alcance sigue pendiente de decisión
    for (const issue of issues) {
      const title = normalizeText(`${issue.title || ""}`);
      for (const pending of PENDING_SCOPE_DECISIONS) {
        if (title.includes(pending.topic) && pending.disallowedRepos.includes(issue.repo as any)) {
          errors.push(
            `El issue [${issue.id}] crea trabajo de "${pending.topic}" en ${issue.repo}, pero ese alcance está PENDIENTE de decisión (${pending.description}) (Regla 22).`
          );
        }
      }
    }

    // Endpoints /api/mobile mencionados sin issue de app
    const hasAppIssue = issues.some((i) => i.repo === "app");
    if (!hasAppIssue) {
      for (const issue of issues) {
        if (/\/api\/mobile/i.test(`${issueBody(issue)} ${issue.agentPrompt || ""}`)) {
          errors.push(`El issue [${issue.id}] menciona endpoints /api/mobile sin que exista un issue de app (Regla 22).`);
        }
      }
    }

    const index = new TranscriptIndex(transcript || "");

    // Issue de app sin frase explícita de app en los segmentos citados.
    // Sin transcripción solo se puede revisar el texto del propio issue.
    for (const issue of issues) {
      if (issue.repo !== "app") continue;
      if (index.isEmpty) {
        if (!MOBILE_EVIDENCE_REGEX.test(normalizeText(`${issueBody(issue)} ${issue.agentPrompt || ""}`))) {
          errors.push(`El issue [${issue.id}] está asignado a App Móvil pero carece de evidencia móvil (app, operario o supervisor móvil) (Regla 7 y 22).`);
        }
        continue;
      }
      const cited = parseCitedSeconds(issueBody(issue));
      const evidence = cited.some((sec) => MOBILE_EVIDENCE_REGEX.test(index.windowText(sec, APP_EVIDENCE_BEFORE_SEC, APP_EVIDENCE_AFTER_SEC)));
      if (!evidence) {
        errors.push(
          `El issue [${issue.id}] es de App Móvil pero carece de evidencia móvil: ningún segmento citado (${cited.length} marcas) contiene una frase explícita de app, operario o móvil (Regla 7 y 22).`
        );
      }
    }

    if (index.isEmpty) return;

    // Ítem con cierre posterior tratado como issue o pregunta (Regla 21)
    const closures = index.findLaterClosures();
    for (const closure of closures) {
      for (const issue of issues) {
        if (mentionsTopic(`${issue.title || ""} ${issue.description || ""}`, closure.topic)) {
          errors.push(
            `El issue [${issue.id}] trata "${closure.topic}", que se dio por resuelto más adelante ("${closure.cita}"). Debe ir a "Ya resuelto", sin issue (Regla 21).`
          );
        }
      }
      for (const q of questions) {
        if (mentionsTopic(q, closure.topic)) {
          errors.push(
            `La pregunta "${q}" trata "${closure.topic}", que se dio por resuelto más adelante ("${closure.cita}"). No lleva pregunta (Regla 21).`
          );
        }
      }
    }

    // Documentos, roles, permisos o límites que la transcripción no menciona (Regla 22)
    const assertionTexts: Array<{ where: string; text: string }> = [
      { where: "el resumen", text: data.summary || "" },
      ...questions.map((q) => ({ where: `la pregunta "${q.slice(0, 60)}…"`, text: q })),
      ...(data.keyDecisions || []).map((d) => ({ where: `la decisión "${d.slice(0, 60)}…"`, text: d })),
      ...issues.map((i) => ({ where: `el issue [${i.id}]`, text: `${i.description || ""} ${(i.acceptanceCriteria || []).join(" ")}` }))
    ];
    for (const term of INVENTED_STRUCTURE_TERMS) {
      if (index.containsWord(term.regex)) continue;
      for (const item of assertionTexts) {
        if (term.regex.test(normalizeText(item.text))) {
          errors.push(`${item.where} menciona ${term.label}, que no se habló en la reunión (Regla 22).`);
        }
      }
    }
    if (!index.containsWord(/reglas de negocio/)) {
      const docTexts = [
        { where: "el resumen", text: data.summary || "" },
        ...questions.map((q) => ({ where: `la pregunta "${q.slice(0, 60)}…"`, text: q })),
        ...(data.keyDecisions || []).map((d) => ({ where: `la decisión "${d.slice(0, 60)}…"`, text: d }))
      ];
      for (const item of docTexts) {
        if (DOC_ASSERTION_REGEX.test(item.text)) {
          errors.push(`${item.where} cita docs/REGLAS_DE_NEGOCIO.md como fuente, pero la reunión no lo mencionó (Regla 22).`);
        }
      }
    }

    // Responsable que no aparece en el segmento citado (Regla 22)
    const responsibleTexts = [
      ...(data.inProgress || []).map((t) => ({ where: `En curso "${t.slice(0, 60)}…"`, text: t })),
      ...issues.map((i) => ({ where: `el issue [${i.id}]`, text: issueBody(i) }))
    ];
    for (const item of responsibleTexts) {
      const cited = parseCitedSeconds(item.text);
      RESPONSIBLE_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RESPONSIBLE_REGEX.exec(item.text)) !== null) {
        const name = (m[1] || "").trim();
        if (!name || /^(sin|ninguno|nadie)$/i.test(name)) continue;
        const person = GLOSSARY_PEOPLE.find((p) => normalizeText(p.name) === normalizeText(name));
        if (person?.neverResponsible) {
          errors.push(`${item.where} asigna a ${name} como responsable, pero el glosario indica "${person.role}" (Regla 22).`);
          continue;
        }
        const nameNorm = normalizeText(name);
        const inSegment =
          cited.length === 0 ? index.containsAnywhere(name) : cited.some((sec) => index.windowText(sec, 30, 30).includes(nameNorm));
        if (!inSegment) {
          errors.push(`${item.where} nombra a ${name} como responsable, pero su nombre no aparece en el segmento citado (Regla 22).`);
        }
      }
    }
  }

  public static validateWarnings(data: GeneratedMeetingData, transcript: string | undefined, warnings: string[]): void {
    if (!transcript || !transcript.trim()) return;

    // Siglas que no aparecen en la transcripción ni en el glosario (ej. LRP normalizado a otra sigla)
    const accepted = glossaryAcceptedForms();
    const transcriptUpper = transcript;
    const outputText = `${data.summary || ""} ${(data.keyDecisions || []).join(" ")} ${(data.issues || [])
      .map((i) => `${i.title} ${i.description}`)
      .join(" ")}`;
    const ignored = new Set(["PR", "QA", "API", "SQL", "UI", "ID", "PDF", "JSON", "HTTP", "URL", "AAAAMMDD", "NA", "PROPUESTO", "BLOQUEANTE", "BLOQUEADO", "NO"]);
    const seen = new Set<string>();
    for (const m of outputText.matchAll(/\b[A-Z]{2,5}\b/g)) {
      const sigla = m[0];
      if (seen.has(sigla) || ignored.has(sigla)) continue;
      seen.add(sigla);
      const inTranscript = new RegExp(`\\b${sigla}\\b`).test(transcriptUpper);
      if (!inTranscript && !accepted.has(sigla.toLowerCase())) {
        warnings.push(`La sigla "${sigla}" no aparece en la transcripción ni en el glosario; verificar que no se normalizó otra sigla.`);
      }
    }
  }
}
