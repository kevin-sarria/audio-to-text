import fs from "node:fs";
import path from "node:path";
import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { MeetingAnalysisValidators, ValidationResult } from "../MeetingAnalysisValidators.js";

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
  };
  details: string[];
}

export class EvaluationRunner {
  public static loadCase(casesDir: string, caseId: string): EvaluationCase {
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
    generated: GeneratedMeetingData
  ): EvaluationReport {
    const validation = MeetingAnalysisValidators.validate(generated, evalCase.transcript);
    const details: string[] = [];

    // Verificación 1: Número de issues esperados (9)
    const issuesCountMatches = generated.issues.length === evalCase.expected.expectedIssuesCount;
    if (!issuesCountMatches) {
      details.push(
        `Cantidad de issues: Obtenido ${generated.issues.length} vs Esperado ${evalCase.expected.expectedIssuesCount}`
      );
    }

    // Verificación 2: App issues son 0
    const appIssues = generated.issues.filter((i) => i.repo === "app");
    const appIssuesAreZero = appIssues.length === (evalCase.expected.expectedRepoBreakdown?.app || 0);
    if (!appIssuesAreZero) {
      details.push(`Issues de app generados indebidamente: ${appIssues.length}`);
    }

    // Verificación 3: No fijar horas/rangos ambiguos como 19:00 o 7:00 p.m. sin [Interpretación]
    const fixedHoursRegex = /\b(19:00|06:00|7:00\s*(?:p\.?m\.?|a\.?m\.?)|entre 06:00 y 19:00)\b/i;
    const allText = `${generated.summary} ${generated.issues.map((i) => `${i.title} ${i.description}`).join(" ")} ${(generated.globalOpenQuestions || []).join(" ")}`;
    const hasFixed = fixedHoursRegex.test(allText) && !allText.includes("[Interpretación");
    const hasNoFixedTimeFlaws = !hasFixed;
    if (hasFixed) {
      details.push("Se fijó una hora no explícita ('19:00' / '7:00 p.m.') sin marcar [Interpretación].");
    }

    // Verificación 4: Sin filtración de mecánicas internas
    const internalRegex = /\b(Paso\s*[12]|Step\s*[12]|Etapa\s*[12]|el análisis previo|la lista extraída)\b/i;
    const hasNoInternalStageLeaking = !internalRegex.test(allText);
    if (!hasNoInternalStageLeaking) {
      details.push("Se filtraron etapas internas ('Paso 1' / 'Paso 2' / 'Etapa') en los textos.");
    }

    // Verificación 5: Decisiones clave presentes
    const keyDecisionsPresent = (generated.keyDecisions || []).length > 0;

    // Verificación 6: Ya resuelto presentes
    const alreadyResolvedPresent = (generated.alreadyResolved || []).length > 0;

    // Verificación 7: En curso presentes
    const inProgressPresent = (generated.inProgress || []).length > 0;

    // Verificación 8: Backlog presente
    const backlogPresent = (generated.backlog || []).length > 0;

    // Verificaciones v8 (datos en expected.json, así cada caso define sus propias trampas)
    const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const expected = evalCase.expected || {};

    const backlogCountMatches =
      typeof expected.expectedBacklogCount !== "number" || (generated.backlog || []).length === expected.expectedBacklogCount;
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

    // Verificaciones v9
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

    const outputText = `${generated.summary} ${(generated.alreadyResolved || []).join(" ")} ${(generated.inProgress || []).join(" ")} ${(generated.keyDecisions || []).join(" ")} ${(generated.backlog || []).join(" ")} ${(generated.globalOpenQuestions || []).join(" ")} ${generated.issues.map((i) => `${i.title} ${i.description}`).join(" ")}`;
    const hasUnsupportedFixedHours = /\b(?:19:00|7:00\s*(?:p\.?m\.?|a\.?m\.?))\b/i.test(outputText) && !outputText.includes("[Interpretación");
    const noUnsupportedFixedTimes = !hasUnsupportedFixedHours;
    if (hasUnsupportedFixedHours) {
      details.push("La salida contiene horas no respaldadas ('19:00' / '7:00 p.m.').");
    }

    const allChecksOk =
      issuesCountMatches &&
      appIssuesAreZero &&
      hasNoFixedTimeFlaws &&
      hasNoInternalStageLeaking &&
      backlogCountMatches &&
      noForbiddenIssueTopics &&
      noForbiddenQuestionTopics &&
      noForbiddenResponsibles &&
      noRenameInAlreadyResolved &&
      noCameraIssues &&
      noUnsupportedFixedTimes &&
      validation.isValid;

    return {
      caseId: evalCase.caseId,
      passed: allChecksOk,
      validation,
      checks: {
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
        noUnsupportedFixedTimes
      },
      details
    };
  }
}
