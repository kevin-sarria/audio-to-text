import fs from "node:fs";
import path from "node:path";
import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { MeetingAnalysisValidators, ValidationResult } from "../MeetingAnalysisValidators.js";
import { ProjectProfile } from "../profiles/ProjectProfile.js";
import { DIAMANTE_PROFILE } from "../profiles/diamanteProfile.js";
import { normalizeText } from "../TranscriptIndex.js";
import { REQUIRED_PROMPT_SECTIONS } from "../validators/MeetingAnalysisV10Validators.js";

export interface EvaluationCase {
  caseId: string;
  transcript: string;
  expected: any;
}

export interface EvaluationReport {
  caseId: string;
  passed: boolean;
  validation: ValidationResult;
  checks: {
    issuesCountMatches: boolean;
    appIssuesAreZero: boolean;
    hasNoFixedTimeFlaws: boolean;
    hasNoInternalStageLeaking: boolean;
    keyDecisionsPresent: boolean;
    alreadyResolvedPresent: boolean;
    inProgressPresent: boolean;
    backlogPresent: boolean;
    backlogCountMatches: boolean;
    noForbiddenIssueTopics: boolean;
    noForbiddenQuestionTopics: boolean;
    noForbiddenResponsibles: boolean;
    noRenameInAlreadyResolved: boolean;
    noCameraIssues: boolean;
    noUnsupportedFixedTimes: boolean;
    // Nuevos checks v10
    totalHoursMatches: boolean;
    repoHoursMatch: boolean;
    noInternalTerms: boolean;
    promptsComplete: boolean;
    requiredInProgressPresent: boolean;
    requiredDecisionsPresent: boolean;
    nounsPreserved: boolean;
    noBlockingQuestions: boolean;
  };
  details: string[];
}

export type EvaluationRequirement = string | { label: string; keywords?: string[]; timestamps?: string[] };

function normalizeForMatch(text: string): string {
  return (text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function requirementLabel(req: EvaluationRequirement): string {
  return typeof req === "string" ? req : req.label;
}

function sectionMeetsRequirement(items: string[], req: EvaluationRequirement): boolean {
  const keywords = typeof req === "string" ? [req] : req.keywords || [];
  const timestamps = typeof req === "string" ? [] : req.timestamps || [];
  return items.some((item) => {
    const itemNorm = normalizeForMatch(item);
    return (
      keywords.some((k) => itemNorm.includes(normalizeForMatch(k))) ||
      timestamps.some((ts) => item.includes(ts))
    );
  });
}

export class EvaluationRunner {
  public static loadCase(casesDir: string, caseId: string): EvaluationCase {
    // caseId = "<proyecto>/<reunión>" (p. ej. "diamante/2026-11-18_08-04-57"): cada proyecto tiene su carpeta.
    const caseFolder = path.join(casesDir, caseId);
    if (!fs.existsSync(caseFolder)) {
      throw new Error(`Carpeta de caso de evaluación no encontrada: ${caseFolder}`);
    }

    const transcriptPath = path.join(caseFolder, "transcript.txt");
    const expectedPath = path.join(caseFolder, "expected.json");

    const transcript = fs.readFileSync(transcriptPath, "utf-8");
    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));

    return { caseId, transcript, expected };
  }

  public static evaluate(
    evalCase: EvaluationCase,
    generated: GeneratedMeetingData,
    profile: ProjectProfile = DIAMANTE_PROFILE
  ): EvaluationReport {
    const validation = MeetingAnalysisValidators.validate(generated, evalCase.transcript, undefined, profile);
    const details: string[] = [];
    const expected = evalCase.expected || {};
    const norm = (t: string) => normalizeText(t);

    // 1. Número de issues esperados
    const issuesCountMatches =
      typeof expected.expectedIssuesCount === "number"
        ? generated.issues.length === expected.expectedIssuesCount
        : true;
    if (!issuesCountMatches) {
      details.push(
        `Cantidad de issues: Obtenido ${generated.issues.length} vs Esperado ${expected.expectedIssuesCount}`
      );
    }

    // 2. App issues son 0
    const appIssues = generated.issues.filter((i) => i.repo === "app");
    const appIssuesAreZero = appIssues.length === (expected.expectedRepoBreakdown?.app ?? 0);
    if (!appIssuesAreZero) {
      details.push(`Issues de app generados indebidamente: ${appIssues.length}`);
    }

    // 3. No fijar horas/rangos ambiguos
    const fixedHoursRegex = /\b(19:00|06:00|7:00\s*(?:p\.?m\.?|a\.?m\.?)|entre 06:00 y 19:00)\b/i;
    const allText = `${generated.summary} ${generated.issues.map((i) => `${i.title} ${i.description}`).join(" ")} ${(generated.globalOpenQuestions || []).join(" ")}`;
    const hasFixed = fixedHoursRegex.test(allText) && !allText.includes("[Interpretación");
    const hasNoFixedTimeFlaws = !hasFixed;
    if (hasFixed) {
      details.push("Se fijó una hora no explícita ('19:00' / '7:00 p.m.') sin marcar [Interpretación].");
    }

    // 4. Sin filtración de mecánicas internas
    const internalRegex = /\b(Paso\s*[12]|Step\s*[12]|Etapa\s*[12]|el análisis previo|la lista extraída)\b/i;
    const hasNoInternalStageLeaking = !internalRegex.test(allText);
    if (!hasNoInternalStageLeaking) {
      details.push("Se filtraron etapas internas ('Paso 1' / 'Paso 2' / 'Etapa') en los textos.");
    }

    // 5-8. Secciones presentes
    const keyDecisionsPresent = (generated.keyDecisions || []).length > 0;
    const alreadyResolvedPresent = (generated.alreadyResolved || []).length > 0;
    const inProgressPresent = (generated.inProgress || []).length > 0;
    const backlogPresent = (generated.backlog || []).length > 0;

    const backlogCountMatches =
      typeof expected.expectedBacklogCount !== "number" ||
      (generated.backlog || []).length === expected.expectedBacklogCount;
    if (!backlogCountMatches) {
      details.push(`Backlog: Obtenido ${(generated.backlog || []).length} vs Esperado ${expected.expectedBacklogCount}`);
    }

    const forbiddenIssueTopics: string[] = expected.forbiddenIssueTopics || [];
    const issueHits = generated.issues.flatMap((i) =>
      forbiddenIssueTopics.filter((t) => norm(`${i.title} ${i.description}`).includes(norm(t))).map((t) => `${i.id}: ${t}`)
    );
    const noForbiddenIssueTopics = issueHits.length === 0;
    if (!noForbiddenIssueTopics) details.push(`Issues sobre temas que no llevan issue: ${issueHits.join(", ")}`);

    const forbiddenQuestionTopics: string[] = expected.forbiddenQuestionTopics || [];
    const questionHits = (generated.globalOpenQuestions || []).filter((q) =>
      forbiddenQuestionTopics.some((t) => norm(q).includes(norm(t)))
    );
    const noForbiddenQuestionTopics = questionHits.length === 0;
    if (!noForbiddenQuestionTopics) details.push(`Preguntas sobre temas cerrados o no hablados: ${questionHits.join(" | ")}`);

    const forbiddenResponsibles: string[] = expected.forbiddenResponsibles || [];
    const responsibleText = `${(generated.inProgress || []).join(" ")} ${generated.issues.map((i) => i.description).join(" ")}`;
    const responsibleHits = forbiddenResponsibles.filter((name) =>
      new RegExp(`(?:responsable|a cargo de|lo lleva|due[ñn]o)\\s*:?\\s*${name}`, "i").test(responsibleText)
    );
    const noForbiddenResponsibles = responsibleHits.length === 0;
    if (!noForbiddenResponsibles) details.push(`Responsables sin respaldo: ${responsibleHits.join(", ")}`);

    const noRenameInAlreadyResolved = !(generated.alreadyResolved || []).some(
      (r) => norm(r).includes("renombr") || norm(r).includes("asignacion automatica")
    );
    if (!noRenameInAlreadyResolved) {
      details.push("El punto de renombre se marcó erróneamente en alreadyResolved.");
    }

    const cameraIssues = generated.issues.filter(
      (i) => (i.repo === "panel" || i.repo === "app") && (norm(i.title).includes("camara") || norm(i.description || "").includes("camara"))
    );
    const noCameraIssues = cameraIssues.length === 0;
    if (!noCameraIssues) {
      details.push(`Se crearon issues de panel/app sobre cámara: ${cameraIssues.map((i) => i.id).join(", ")}`);
    }

    const noUnsupportedFixedTimes = hasNoFixedTimeFlaws;

    // Checks nuevos v10:
    // A. totalHoursMatches
    const currentTotalHours = (generated.issues || []).reduce((sum, i) => sum + (Number(i.estimation?.totalHours) || 0), 0);
    const expectedTotal = expected.expectedTotalHours ?? expected.expectedRepoHours?.total;
    const totalHoursMatches = typeof expectedTotal === "number" ? currentTotalHours === expectedTotal : true;
    if (!totalHoursMatches) {
      details.push(`Total de horas: Obtenido ${currentTotalHours}h vs Esperado ${expectedTotal}h`);
    }

    // B. repoHoursMatch
    const backendHours = generated.issues.filter((i) => i.repo === "backend").reduce((sum, i) => sum + (Number(i.estimation?.totalHours) || 0), 0);
    const panelHours = generated.issues.filter((i) => i.repo === "panel").reduce((sum, i) => sum + (Number(i.estimation?.totalHours) || 0), 0);
    const appHours = generated.issues.filter((i) => i.repo === "app").reduce((sum, i) => sum + (Number(i.estimation?.totalHours) || 0), 0);
    const repoHoursMatch =
      !expected.expectedRepoHours ||
      (backendHours === expected.expectedRepoHours.backend &&
        panelHours === expected.expectedRepoHours.panel &&
        appHours === expected.expectedRepoHours.app);
    if (!repoHoursMatch && expected.expectedRepoHours) {
      details.push(
        `Horas por repo no coinciden: Obtenido [backend: ${backendHours}, panel: ${panelHours}, app: ${appHours}] vs Esperado [backend: ${expected.expectedRepoHours.backend}, panel: ${expected.expectedRepoHours.panel}, app: ${expected.expectedRepoHours.app}]`
      );
    }

    // C. noInternalTerms
    const outputBlobs = [
      generated.summary || "",
      ...(generated.alreadyResolved || []),
      ...(generated.inProgress || []),
      ...(generated.keyDecisions || []),
      ...(generated.globalOpenQuestions || []),
      ...(generated.backlog || []),
      ...generated.issues.map((i) => `${i.title} ${i.description} ${(i.acceptanceCriteria || []).join(" ")} ${i.agentPrompt}`)
    ].join(" ");
    const internalTermsHits = (profile.internalTerms || []).filter((term) => norm(outputBlobs).includes(norm(term)));
    const noInternalTerms = internalTermsHits.length === 0;
    if (!noInternalTerms) {
      details.push(`Se filtraron términos internos prohibidos: ${internalTermsHits.join(", ")}`);
    }

    // D. promptsComplete
    const promptIssuesIncomplete = generated.issues.filter((i) => {
      const p = (i.agentPrompt || "").trim();
      return (
        !REQUIRED_PROMPT_SECTIONS.every((sec) => p.includes(sec)) ||
        /(?:[,:;(\-]|\b(y|o|de|del|la|el|que|con|para|en|a|por))\s*$/i.test(p)
      );
    });
    const promptsComplete = promptIssuesIncomplete.length === 0;
    if (!promptsComplete) {
      details.push(`Prompts incompletos en issues: ${promptIssuesIncomplete.map((i) => i.id).join(", ")}`);
    }

    // E. requiredInProgressPresent / F. requiredDecisionsPresent
    // Un requisito es un texto o { label, keywords?, timestamps? }: se cumple si alguna entrada de la
    // sección contiene una de las palabras clave o cita una de las marcas. Así no se exige que el
    // modelo use las mismas palabras que el resultado esperado.
    const missingInProgress = (expected.requiredInProgress || [])
      .filter((req: EvaluationRequirement) => !sectionMeetsRequirement(generated.inProgress || [], req))
      .map(requirementLabel);
    const requiredInProgressPresent = missingInProgress.length === 0;
    if (!requiredInProgressPresent) {
      details.push(`Faltan ítems requeridos en En curso: ${missingInProgress.join(", ")}`);
    }

    const missingDecisions = (expected.requiredDecisions || [])
      .filter((req: EvaluationRequirement) => !sectionMeetsRequirement(generated.keyDecisions || [], req))
      .map(requirementLabel);
    const requiredDecisionsPresent = missingDecisions.length === 0;
    if (!requiredDecisionsPresent) {
      details.push(`Faltan decisiones requeridas: ${missingDecisions.join(", ")}`);
    }

    // G. nounsPreserved
    const preservedNounsHits = (expected.preservedNouns || []).every((noun: string) => {
      return norm(allText).includes(norm(noun));
    });
    const nounsPreserved = preservedNounsHits;
    if (!nounsPreserved) {
      details.push("No se preservaron los sustantivos requeridos.");
    }

    // H. noBlockingQuestions
    const blockingQCount = (generated.globalOpenQuestions || []).filter((q) => q.includes("[BLOQUEANTE]")).length;
    const noBlockingQuestions = blockingQCount === 0;
    if (!noBlockingQuestions) {
      details.push(`Existen ${blockingQCount} preguntas BLOQUEANTE cuando todas deberían ser NO BLOQUEANTE.`);
    }

    const checks = {
      issuesCountMatches,
      appIssuesAreZero,
      hasNoFixedTimeFlaws,
      hasNoInternalStageLeaking,
      keyDecisionsPresent,
      alreadyResolvedPresent,
      inProgressPresent,
      backlogPresent,
      backlogCountMatches,
      noForbiddenIssueTopics,
      noForbiddenQuestionTopics,
      noForbiddenResponsibles,
      noRenameInAlreadyResolved,
      noCameraIssues,
      noUnsupportedFixedTimes,
      totalHoursMatches,
      repoHoursMatch,
      noInternalTerms,
      promptsComplete,
      requiredInProgressPresent,
      requiredDecisionsPresent,
      nounsPreserved,
      noBlockingQuestions
    };

    const passed =
      validation.isValid &&
      Object.values(checks).every(Boolean) &&
      details.length === 0;

    return {
      caseId: evalCase.caseId,
      passed,
      validation,
      checks,
      details
    };
  }
}
