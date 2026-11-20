import { ICommercialProposalGenerator } from "../../domain/services/ICommercialProposalGenerator.js";
import { CommercialProposal } from "../../domain/models/CommercialProposal.js";
import { MeetingClassification } from "../../domain/models/MeetingTypes.js";

export class CommercialProposalLlmService implements ICommercialProposalGenerator {
  constructor(
    private callLlmFn?: (system: string, user: string) => Promise<string>
  ) {}

  public async generateProposal(
    transcript: string,
    classification: MeetingClassification,
    companyContext?: string
  ): Promise<CommercialProposal> {
    const today = new Date().toISOString().slice(0, 10);
    const proposalId = `PROP-${today.replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
    const clientName = classification.clientName || "Cliente";

    const systemPrompt = `Eres un Vicepresidente Comercial y Arquitecto de Soluciones de IA de élite.
Tu tarea es convertir la transcripción de una reunión con cliente en una PROPUESTA COMERCIAL EJECUTIVA, formal, persuasiva y de altísimo valor.

Debes responder EXCLUSIVAMENTE con un JSON válido estructurado así:
{
  "projectTitle": "Título comercial atractivo del proyecto",
  "clientName": "${clientName}",
  "executiveSummary": "Resumen ejecutivo del problema del cliente y por qué nuestra solución es ideal...",
  "clientPainPoints": ["Dolor 1 detectado en la reunión", "Dolor 2..."],
  "proposedSolution": "Descripción técnica y operativa de la solución...",
  "coreDeliverables": ["Entregable 1", "Entregable 2", "Entregable 3"],
  "roadmap": [
    {
      "phase": "Fase 1: Descubrimiento y Arquitectura",
      "duration": "2 semanas",
      "description": "Alcance de la fase...",
      "deliverables": ["Documento de arquitectura", "Prototipo inicial"]
    },
    {
      "phase": "Fase 2: Desarrollo y Automatización",
      "duration": "4 semanas",
      "description": "Implementación de los módulos...",
      "deliverables": ["Código fuente", "Integración con APIs"]
    }
  ],
  "investment": {
    "estimatedCost": "Monto o rango estimado deducido o sugerido",
    "currency": "USD",
    "paymentTerms": "50% al inicio, 50% contra entrega y satisfacción"
  },
  "nextSteps": [
    "Aprobación de la presente propuesta comercial.",
    "Reunión de kick-off y entrega de accesos.",
    "Inicio de la Fase 1."
  ]
}`;

    const userPrompt = `Transcripción de la reunión con el cliente:\n\n${transcript}\n\nContexto de nuestra empresa:\n${
      companyContext || "Empresa líder en desarrollo de software, automatizaciones e inteligencia artificial para optimización de procesos."
    }\n\nGenera la propuesta comercial en JSON estricto:`;

    let parsedProposal: any = null;
    if (this.callLlmFn) {
      try {
        const raw = await this.callLlmFn(systemPrompt, userPrompt);
        const clean = this.cleanJson(raw);
        parsedProposal = JSON.parse(clean);
      } catch (err) {
        console.warn("[CommercialProposalLlmService] Error generando propuesta con LLM, usando plantilla:", err);
      }
    }

    const title = parsedProposal?.projectTitle || `Solución de Inteligencia Artificial para ${clientName}`;
    const summary = parsedProposal?.executiveSummary || "Propuesta comercial orientada a transformar los procesos del cliente con IA.";
    const painPoints = Array.isArray(parsedProposal?.clientPainPoints) && parsedProposal.clientPainPoints.length > 0
      ? parsedProposal.clientPainPoints
      : classification.keyPainPoints.length > 0 ? classification.keyPainPoints : ["Optimización de tiempos operativos"];
    const solution = parsedProposal?.proposedSolution || "Implementación de un sistema automatizado de procesamiento con inteligencia artificial.";
    const deliverables = Array.isArray(parsedProposal?.coreDeliverables) && parsedProposal.coreDeliverables.length > 0
      ? parsedProposal.coreDeliverables
      : ["Módulo central de procesamiento", "Panel de visualización y métricas", "Documentación técnica"];
    const roadmap = Array.isArray(parsedProposal?.roadmap) && parsedProposal.roadmap.length > 0
      ? parsedProposal.roadmap
      : [
          { phase: "Fase 1: Diagnóstico y Prototipado", duration: "2 semanas", description: "Configuración y pruebas iniciales", deliverables: ["Prototipo funcional"] },
          { phase: "Fase 2: Implementación", duration: "4 semanas", description: "Puesta en producción y despliegue", deliverables: ["Sistema en producción"] }
        ];
    const investment = parsedProposal?.investment || {
      estimatedCost: classification.budgetMentioned || "A convenir según alcance final",
      currency: "USD",
      paymentTerms: "50% anticipo / 50% contra entrega final"
    };
    const nextSteps = Array.isArray(parsedProposal?.nextSteps) && parsedProposal.nextSteps.length > 0
      ? parsedProposal.nextSteps
      : ["Revisión y firma de la propuesta", "Reunión de alineación de inicio (Kick-off)"];

    const markdownContent = this.formatAsMarkdown(
      proposalId,
      title,
      clientName,
      today,
      summary,
      painPoints,
      solution,
      deliverables,
      roadmap,
      investment,
      nextSteps
    );

    return {
      id: proposalId,
      clientName,
      projectTitle: title,
      createdAt: today,
      executiveSummary: summary,
      clientPainPoints: painPoints,
      proposedSolution: solution,
      coreDeliverables: deliverables,
      roadmap,
      investment,
      nextSteps,
      status: "DRAFT_FOR_REVIEW",
      markdownContent
    };
  }

  private formatAsMarkdown(
    id: string,
    title: string,
    client: string,
    date: string,
    summary: string,
    painPoints: string[],
    solution: string,
    deliverables: string[],
    roadmap: any[],
    investment: any,
    nextSteps: string[]
  ): string {
    return `# PROPUESTA COMERCIAL: ${title.toUpperCase()}
**Referencia:** \`${id}\` | **Cliente:** ${client} | **Fecha:** ${date}

---

## 1. Resumen Ejecutivo
${summary}

## 2. Diagnóstico: Dolores y Necesidades del Cliente
${painPoints.map((p) => `- ❗ **${p}**`).join("\n")}

## 3. Solución Propuesta
${solution}

## 4. Entregables Principales
${deliverables.map((d) => `- [x] ${d}`).join("\n")}

## 5. Cronograma y Fases de Trabajo
${roadmap.map((r) => `### ${r.phase} (${r.duration})\n${r.description}\n**Entregables:** ${r.deliverables?.join(", ") || "N/A"}`).join("\n\n")}

## 6. Inversión y Términos Comerciales
- **Inversión estimada:** \`${investment.estimatedCost} ${investment.currency}\`
- **Condiciones de pago:** ${investment.paymentTerms}

## 7. Próximos Pasos (Call to Action)
${nextSteps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}
`;
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
