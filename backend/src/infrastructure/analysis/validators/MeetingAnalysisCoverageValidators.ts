import { GeneratedMeetingData } from "../../../domain/services/IMeetingAnalysisService.js";
import { TranscriptCoverageDetector } from "../TranscriptCoverageDetector.js";

export class MeetingAnalysisCoverageValidators {
  public static validateCoverageAndIntegrityErrors(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    errors: string[]
  ): void {
    // 1. Validar que el backlog nunca aparezca como issue (repo 'otro', 0 h o prioridad 'backlog')
    for (const issue of data.issues) {
      const isBacklogRepo = (issue.repo as string) === "otro" || (issue.repo as string) === "none";
      const isZeroHours = Number(issue.estimation?.totalHours) === 0;
      const isBacklogPriority = issue.priority?.toLowerCase() === "backlog";
      const hasBacklogTitle = issue.title.toLowerCase().startsWith("[backlog]") || issue.title.toLowerCase().includes("backlog");

      if (isBacklogRepo || (isZeroHours && isBacklogPriority) || (isBacklogRepo && isZeroHours) || hasBacklogTitle) {
        errors.push(
          `El issue [${issue.id}] está clasificado como backlog, con 0 horas o repo no permitido ('${issue.repo}'). El backlog va solo en la lista de backlog, nunca como issue (Regla 6 y 14).`
        );
      }
    }

    // 2. Validar que "Hablante N" no se use como persona responsable
    const speakerIdentityRegex = /\bHablante\s*\d+\b/i;
    for (const issue of data.issues) {
      const checkText = `${issue.title || ""} ${issue.description || ""} ${issue.agentPrompt || ""}`;
      const match = checkText.match(speakerIdentityRegex);
      if (match && (checkText.toLowerCase().includes("responsable") || checkText.toLowerCase().includes("a cargo") || checkText.toLowerCase().includes("revisor"))) {
        errors.push(
          `El issue [${issue.id}] usa "${match[0]}" como persona responsable. No usar 'Hablante N' como identidad; escribir nombre real o 'sin identificar' (Regla 2 y 20).`
        );
      }
    }

    for (const prog of data.inProgress || []) {
      const match = prog.match(speakerIdentityRegex);
      if (match) {
        errors.push(
          `El ítem en curso "${prog}" usa "${match[0]}" como persona responsable (Regla 2 y 20).`
        );
      }
    }

    if (!transcript || transcript.trim().length === 0) {
      return;
    }

    const coverage = TranscriptCoverageDetector.analyze(transcript);

    // 3. Si hay tramos sin audio o saltos > 60s, la salida debe iniciar con "Análisis parcial"
    if (coverage.isPartial) {
      const summaryTrimmed = (data.summary || "").trim().toLowerCase();
      if (!summaryTrimmed.startsWith("análisis parcial") && !summaryTrimmed.includes("analisis parcial")) {
        const gapLabels = coverage.gaps.map((g) => g.label).join(", ");
        errors.push(
          `La transcripción contiene tramos sin audio (${gapLabels}), pero la salida no inicia con el aviso obligatorio 'Análisis parcial: faltan ...' (Regla 20).`
        );
      }
    }

    // 4. Cobertura < 90%: no generar issues; devolver "transcripción incompleta, reintentar"
    if (coverage.coveragePct < 90 && data.issues.length > 0) {
      errors.push(
        `Cobertura de audio insuficiente (${coverage.coveragePct}% < 90%). Con menos del 90% de cobertura no se deben generar issues; devolver "transcripción incompleta, reintentar" (Regla 20).`
      );
    }

    // 5. Ninguna marca de tiempo citada debe caer dentro de un tramo sin audio
    if (coverage.gaps.length > 0) {
      for (const issue of data.issues) {
        const text = `${issue.title || ""} ${issue.description || ""} ${(issue.acceptanceCriteria || []).join(" ")}`;
        const tsRegex = /\[(\d{1,2}:\d{2})\]/g;
        let m: RegExpExecArray | null;
        while ((m = tsRegex.exec(text)) !== null) {
          if (!m[1]) continue;
          const sec = TranscriptCoverageDetector.parseSeconds(m[1]);
          const gap = TranscriptCoverageDetector.isInsideGap(sec, coverage.gaps);
          if (gap) {
            errors.push(
              `El issue [${issue.id}] cita la marca [${m[1]}] que cae dentro del tramo sin audio [${gap.label}] (Regla 20).`
            );
          }
        }
      }

      for (const dec of data.keyDecisions || []) {
        const tsRegex = /\[(\d{1,2}:\d{2})\]/g;
        let m: RegExpExecArray | null;
        while ((m = tsRegex.exec(dec)) !== null) {
          if (!m[1]) continue;
          const sec = TranscriptCoverageDetector.parseSeconds(m[1]);
          const gap = TranscriptCoverageDetector.isInsideGap(sec, coverage.gaps);
          if (gap) {
            errors.push(
              `La decisión "${dec}" cita la marca [${m[1]}] que cae dentro del tramo sin audio [${gap.label}] (Regla 20).`
            );
          }
        }
      }
    }
  }

  public static validateCoverageWarnings(
    data: GeneratedMeetingData,
    transcript: string | undefined,
    warnings: string[]
  ): void {
    if (!transcript || transcript.trim().length === 0) return;

    const coverage = TranscriptCoverageDetector.analyze(transcript);
    if (coverage.gaps.length === 0) return;

    const tsRegex = /\[(\d{1,2}:\d{2})\]/;

    // Una decisión, cierre o backlog cuya cita está a menos de 30 s antes de un tramo sin audio
    const allItems = [
      ...(data.keyDecisions || []).map((d) => ({ type: "Decisión", text: d })),
      ...(data.alreadyResolved || []).map((r) => ({ type: "Cierre", text: r })),
      ...(data.backlog || []).map((b) => ({ type: "Backlog", text: b }))
    ];

    for (const item of allItems) {
      const match = item.text.match(tsRegex);
      if (match && match[1]) {
        const sec = TranscriptCoverageDetector.parseSeconds(match[1]);
        const nearGap = TranscriptCoverageDetector.isNearGapStart(sec, coverage.gaps, 30);
        if (nearGap) {
          warnings.push(
            `${item.type} "${item.text}" cita la marca [${match[1]}] a menos de 30 s antes del tramo sin audio [${nearGap.label}]; verificar si el contexto posterior fue omitido.`
          );
        }
      }
    }
  }
}
