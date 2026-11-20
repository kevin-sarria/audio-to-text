import { IMeetingClassifier } from "../../domain/services/IMeetingClassifier.js";
import { MeetingClassification } from "../../domain/models/MeetingTypes.js";

export class MeetingClassifierLlmService implements IMeetingClassifier {
  constructor(
    private callLlmFn?: (system: string, user: string) => Promise<string>
  ) {}

  public async classify(transcript: string): Promise<MeetingClassification> {
    const systemPrompt = `Eres un Director de Operaciones y Estrategia de IA experto en clasificar reuniones de negocio y desarrollo de software.
Tu tarea es analizar la transcripción de una reunión y determinar con alta precisión si corresponde a:
1. "INTERNAL": Reunión interna de equipo (standup diario, sprint planning, retrospectiva, sincronización técnica, diseño de arquitectura o refactor).
2. "COMMERCIAL_CLIENT": Reunión comercial con cliente actual o prospecto (llamada de ventas, discovery de requerimientos, levantamiento de propuesta, presentación de presupuesto, resolución de dudas de cliente).

Debes devolver EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura:
{
  "type": "INTERNAL" o "COMMERCIAL_CLIENT",
  "confidence": 0.95,
  "reason": "Justificación concisa citando indicios de la conversación...",
  "clientName": "Nombre de la empresa o cliente si se mencionó (o null)",
  "keyPainPoints": ["Dolor o necesidad 1", "Dolor o necesidad 2"],
  "budgetMentioned": "Presupuesto o tarifa si se habló (o null)",
  "timelineMentioned": "Fechas o plazos solicitados si se hablaron (o null)"
}`;

    const userPrompt = `A continuación se presenta la transcripción de la reunión:\n\n${transcript}\n\nAnaliza y clasifica la reunión en JSON estricto.`;

    if (this.callLlmFn) {
      try {
        const raw = await this.callLlmFn(systemPrompt, userPrompt);
        const clean = this.cleanJson(raw);
        const parsed = JSON.parse(clean);
        return {
          type: parsed.type === "COMMERCIAL_CLIENT" ? "COMMERCIAL_CLIENT" : "INTERNAL",
          confidence: Number(parsed.confidence) || 0.9,
          reason: parsed.reason || "Clasificación automática por análisis de discurso",
          clientName: parsed.clientName || undefined,
          keyPainPoints: Array.isArray(parsed.keyPainPoints) ? parsed.keyPainPoints : [],
          budgetMentioned: parsed.budgetMentioned || undefined,
          timelineMentioned: parsed.timelineMentioned || undefined
        };
      } catch (err) {
        console.warn("[MeetingClassifierLlmService] Error en clasificación con LLM, usando heurística local:", err);
      }
    }

    // Heurística de fallback determinista basada en vocabulario
    return this.classifyHeuristic(transcript);
  }

  private classifyHeuristic(transcript: string): MeetingClassification {
    const lower = transcript.toLowerCase();

    const clientKeywords = [
      "cliente", "propuesta", "cotización", "presupuesto", "precio", "costo",
      "contrato", "tarifa", "servicios", "ustedes cobran", "nuestra necesidad",
      "requerimiento de la empresa", "plazo de entrega", "proveedor"
    ];

    const internalKeywords = [
      "sprint", "standup", "pull request", "pr", "deploy", "rama", "merge",
      "refactor", "bug", "tickets", "jira", "code review", "backend", "frontend"
    ];

    let clientScore = 0;
    let internalScore = 0;

    for (const kw of clientKeywords) {
      if (lower.includes(kw)) clientScore += 2;
    }
    for (const kw of internalKeywords) {
      if (lower.includes(kw)) internalScore += 1;
    }

    const isCommercial = clientScore > internalScore && clientScore >= 4;

    return {
      type: isCommercial ? "COMMERCIAL_CLIENT" : "INTERNAL",
      confidence: 0.85,
      reason: isCommercial
        ? "Se detectaron múltiples términos comerciales, indagación de requerimientos o conversación con clientes."
        : "Se detectó lenguaje técnico interno, sincronización de tareas de desarrollo o arquitectura.",
      keyPainPoints: isCommercial ? ["Necesidad de automatización o desarrollo"] : [],
      budgetMentioned: undefined,
      timelineMentioned: undefined
    };
  }

  private cleanJson(raw: string): string {
    let clean = raw.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*\n?/i, "");
      clean = clean.replace(/\n?\s*```\s*$/i, "");
    }
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
    return clean;
  }
}
