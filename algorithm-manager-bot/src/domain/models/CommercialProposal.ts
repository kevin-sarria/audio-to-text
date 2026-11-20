export type ProposalStatus = "DRAFT_FOR_REVIEW" | "APPROVED" | "SENT";

export interface CommercialProposalPhase {
  phase: string;
  duration: string;
  description: string;
  deliverables: string[];
}

export interface CommercialProposalInvestment {
  estimatedCost: string;
  currency: string;
  paymentTerms: string;
}

export interface CommercialProposal {
  id: string;
  clientName: string;
  projectTitle: string;
  createdAt: string;
  executiveSummary: string;
  clientPainPoints: string[];
  proposedSolution: string;
  coreDeliverables: string[];
  roadmap: CommercialProposalPhase[];
  investment: CommercialProposalInvestment;
  nextSteps: string[];
  status: ProposalStatus;
  markdownContent: string;
}
