import { MeetingClassification, MeetingType, BotConnectionMode } from "../domain/models/MeetingTypes.js";
import { CommercialProposal } from "../domain/models/CommercialProposal.js";
import { IMeetingClassifier } from "../domain/services/IMeetingClassifier.js";
import { ICommercialProposalGenerator } from "../domain/services/ICommercialProposalGenerator.js";

export interface ProcessMeetingInput {
  sessionId?: string;
  transcript: string;
  mode?: BotConnectionMode;
  clientHint?: string;
  companyContext?: string;
}

export interface ProcessMeetingOutput {
  sessionId: string;
  classification: MeetingClassification;
  mode: BotConnectionMode;
  commercialProposal?: CommercialProposal;
  internalSummary?: {
    notes: string;
    actionItemsSuggested: boolean;
  };
}

export class ProcessMeetingSessionUseCase {
  constructor(
    private meetingClassifier: IMeetingClassifier,
    private proposalGenerator: ICommercialProposalGenerator
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

    // 2. Ejecución según el tipo de reunión clasificado
    if (classification.type === "COMMERCIAL_CLIENT") {
      const commercialProposal = await this.proposalGenerator.generateProposal(
        input.transcript,
        classification,
        input.companyContext
      );

      return {
        sessionId,
        classification,
        mode,
        commercialProposal
      };
    }

    // En caso de reunión interna técnica
    return {
      sessionId,
      classification,
      mode,
      internalSummary: {
        notes: `Reunión clasificada como Interna (${classification.reason}). Lista para extracción de issues técnicas de desarrollo.`,
        actionItemsSuggested: true
      }
    };
  }
}
