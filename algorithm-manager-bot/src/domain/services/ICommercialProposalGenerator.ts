import { CommercialProposal } from "../models/CommercialProposal.js";
import { MeetingClassification } from "../models/MeetingTypes.js";

export interface ICommercialProposalGenerator {
  generateProposal(
    transcript: string,
    classification: MeetingClassification,
    companyContext?: string
  ): Promise<CommercialProposal>;
}
