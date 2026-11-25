import { MeetingClassification, BotConnectionMode } from "../domain/models/MeetingTypes.js";
import { CommercialProposal } from "../domain/models/CommercialProposal.js";
import { MeetingSummary, SummaryUtterance } from "../domain/models/MeetingSummary.js";
import { IMeetingClassifier } from "../domain/services/IMeetingClassifier.js";
import { ICommercialProposalGenerator } from "../domain/services/ICommercialProposalGenerator.js";
import { IMeetingSummarizer } from "../domain/services/IMeetingSummarizer.js";
import { MeetingSummaryLlmService, createMinimalSummary } from "../infrastructure/ai/MeetingSummaryLlmService.js";
import { parseTranscriptLines } from "./transcriptParsing.js";

export interface ProcessMeetingInput {
  sessionId?: string;
  transcript: string;
  /** Si se entregan, se usan en lugar de parsear `transcript` (traen offsets de tiempo). */
  utterances?: SummaryUtterance[];
  mode?: BotConnectionMode;
  clientHint?: string;
  companyContext?: string;
}

export interface ProcessMeetingOutput {
  sessionId: string;
  classification: MeetingClassification;
  mode: BotConnectionMode;
  summary: MeetingSummary;
  commercialProposal?: CommercialProposal;
}

export class ProcessMeetingSessionUseCase {
  constructor(
    private meetingClassifier: IMeetingClassifier,
    private proposalGenerator: ICommercialProposalGenerator,
    private summarizer: IMeetingSummarizer = new MeetingSummaryLlmService()
  ) {}

  public async execute(input: ProcessMeetingInput): Promise<ProcessMeetingOutput> {
    if (!input.transcript || input.transcript.trim().length === 0) {
      throw new Error("No se proporcionó una transcripción válida para procesar la reunión.");
    }

    const sessionId = input.sessionId || `session-${Date.now()}`;
    const mode = input.mode || "LOCAL_CAPTURE";

    // 1. Clasificación de la reunión (Interna vs Comercial/Cliente)
    const classification = await this.meetingClassifier.classify(input.transcript);

    // Si el usuario especificó un hint explícito de cliente, lo preservamos
    if (input.clientHint && !classification.clientName) {
      classification.clientName = input.clientHint;
    }

    // 2. Resumen estilo Fireflies para toda reunión
    let summary: MeetingSummary;
    try {
      summary = await this.summarizer.summarize({
        sessionId,
        utterances: input.utterances ?? parseTranscriptLines(input.transcript)
      });
    } catch (err) {
      console.warn("[ProcessMeetingSession] El resumen falló; se continúa con los demás entregables:", err);
      summary = createMinimalSummary(sessionId, [], "el resumidor lanzó un error inesperado");
    }

    // 3. Entregable adicional según el tipo de reunión
    if (classification.type === "COMMERCIAL_CLIENT") {
      const commercialProposal = await this.proposalGenerator.generateProposal(
        input.transcript,
        classification,
        input.companyContext
      );
      return { sessionId, classification, mode, summary, commercialProposal };
    }

    return { sessionId, classification, mode, summary };
  }
}
