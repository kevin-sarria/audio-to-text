import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto } from "@audio-to-text/shared";
import { TranscriptIndex, normalizeText, parseCitedSeconds } from "../TranscriptIndex.js";
import { MOBILE_EVIDENCE_REGEX, APP_EVIDENCE_BEFORE_SEC, APP_EVIDENCE_AFTER_SEC } from "../ExtractionPointNormalizer.js";
import { ProjectProfile } from "../profiles/ProjectProfile.js";
import { DIAMANTE_PROFILE } from "../profiles/diamanteProfile.js";

const DOC_ASSERTION_REGEX = /\b(?:docs\/)?REGLAS_DE_NEGOCIO(?:\.md)?\b/i;

const RESPONSIBLE_REGEX =
  /(?:[Rr]esponsable|[Aa] cargo de|[Ll]o lleva|[Ll]o tiene|[Ll]e toca a|[Aa]signado a|[Dd]ueñ[oa])\s*:?\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g;

function issueBody(issue: DevIssueDto): string {
  return `${issue.title || ""} ${issue.description || ""} ${(issue.acceptanceCriteria || []).join(" ")}`;
}

function mentionsTopic(text: string, topicStem: string): boolean {
  return normalizeText(text).includes(topicStem);
}

export class MeetingAnalysisV8Validators {
  public static validateErrors(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    errors: string[],
    profile: ProjectProfile = DIAMANTE_PROFILE
  ): void {
    const issues = data.issues || [];
    const questions = data.globalOpenQuestions || [];
    const issueIds = new Set(issues.map((i) => i.id.toUpperCase()));

    // Pregunta BLOQUEANTE sin issue existente que la nombre o sin "Si me equivoco"
    for (const q of questions) {
      if (!/\[BLOQUEANTE\]/.test(q)) continue;
      const refs = q.match(/\b[A-Z]+-\d+\b/g) || [];
      if (refs.length > 0 && !refs.some((r) => issueIds.has(r.toUpperCase()))) {
        errors.push(`La pregunta BLOQUEANTE "${q}" nombra un issue que no existe (${refs.join(", ")}) (Regla A6).`);
      }
    }

    // Issue de dimensionamiento/reprogramación en repos cuyo alcance sigue pendiente de decisión
    const scopeDefaults = profile.scopeDefaults || [];
    for (const issue of issues) {
      const title = normalizeText(`${issue.title || ""}`);
      for (const pending of scopeDefaults) {
        if (title.includes(pending.topic) && pending.disallowedRepos.includes(issue.repo as any)) {
          errors.push(
            `El issue [${issue.id}] crea trabajo de "${pending.topic}" en ${issue.repo}, pero ese alcance está PENDIENTE de decisión (${pending.description}) (Regla A4/A7).`
          );
        }
      }
    }

    // Endpoints /api/mobile mencionados sin issue de app
    const hasAppIssue = issues.some((i) => i.repo === "app");
    if (!hasAppIssue) {
      for (const issue of issues) {
        if (/\/api\/mobile/i.test(`${issueBody(issue)} ${issue.agentPrompt || ""}`)) {
          errors.push(`El issue [${issue.id}] menciona endpoints /api/mobile sin que exista un issue de app (Regla A7).`);
        }
      }
    }

    const index = new TranscriptIndex(transcript || "", profile);

    // Issue de app sin frase explícita de app en los segmentos citados.
    for (const issue of issues) {
      if (issue.repo !== "app") continue;
      if (index.isEmpty) {
        if (!MOBILE_EVIDENCE_REGEX.test(normalizeText(`${issueBody(issue)} ${issue.agentPrompt || ""}`))) {
          errors.push(`El issue [${issue.id}] está asignado a App Móvil pero carece de evidencia móvil (app, operario o supervisor móvil) (Regla A7).`);
        }
        continue;
      }
      const cited = parseCitedSeconds(issueBody(issue));
      const evidence = cited.some((sec) => MOBILE_EVIDENCE_REGEX.test(index.windowText(sec, APP_EVIDENCE_BEFORE_SEC, APP_EVIDENCE_AFTER_SEC)));
      if (!evidence) {
        errors.push(
          `El issue [${issue.id}] es de App Móvil pero carece de evidencia móvil: ningún segmento citado (${cited.length} marcas) contiene una frase explícita de app, operario o móvil (Regla A7).`
        );
      }
    }

    if (index.isEmpty) return;

    // Ítem con cierre posterior tratado como issue o pregunta (Regla A5)
    const closures = index.findLaterClosures();
    for (const closure of closures) {
      for (const issue of issues) {
        if (mentionsTopic(`${issue.title || ""} ${issue.description || ""}`, closure.topic)) {
          errors.push(
            `El issue [${issue.id}] trata "${closure.topic}", que se dio por resuelto más adelante ("${closure.cita}"). Debe ir a "Ya resuelto", sin issue (Regla A5).`
          );
        }
      }
      for (const q of questions) {
        if (mentionsTopic(q, closure.topic)) {
          errors.push(
            `La pregunta "${q}" trata "${closure.topic}", que se dio por resuelto más adelante ("${closure.cita}"). No lleva pregunta (Regla A5).`
          );
        }
      }
    }

    // Documentos que la transcripción no menciona (si no se dijeron)
    if (profile.allowedDocuments && profile.allowedDocuments.length > 0 && !index.containsWord(/reglas de negocio/)) {
      const docTexts = [
        { where: "el resumen", text: data.summary || "" },
        ...questions.map((q) => ({ where: `la pregunta "${q.slice(0, 60)}…"`, text: q })),
        ...(data.keyDecisions || []).map((d) => ({ where: `la decisión "${d.slice(0, 60)}…"`, text: d }))
      ];
      for (const item of docTexts) {
        if (DOC_ASSERTION_REGEX.test(item.text)) {
          errors.push(`${item.where} cita docs/REGLAS_DE_NEGOCIO.md como fuente, pero la reunión no lo mencionó (Regla A1).`);
        }
      }
    }

    // Responsable que no aparece en el segmento citado (Regla A3)
    const people = profile.people || [];
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
        const person = people.find((p) => normalizeText(p.name) === normalizeText(name));
        if (person?.neverResponsible) {
          errors.push(`${item.where} asigna a ${name} como responsable, pero el glosario indica "${person.role || "no responsable"}" (Regla A3).`);
          continue;
        }
        const nameNorm = normalizeText(name);
        const inSegment =
          cited.length === 0 ? index.containsAnywhere(name) : cited.some((sec) => index.windowText(sec, 30, 30).includes(nameNorm));
        if (!inSegment) {
          errors.push(`${item.where} nombra a ${name} como responsable, pero su nombre no aparece en el segmento citado (Regla A3).`);
        }
      }
    }
  }

  public static validateWarnings(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    warnings: string[],
    profile: ProjectProfile = DIAMANTE_PROFILE
  ): void {
    if (!transcript || !transcript.trim()) return;

    // Siglas que no aparecen en la transcripción ni en el glosario
    const accepted = new Set<string>();
    for (const c of profile.asrCorrections || []) accepted.add(c.correct.toLowerCase());
    for (const p of profile.people || []) accepted.add(p.name.toLowerCase());
    for (const t of profile.glossaryTerms || []) accepted.add(t.toLowerCase());
    for (const a of profile.acronyms || []) accepted.add(a.toLowerCase());

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
