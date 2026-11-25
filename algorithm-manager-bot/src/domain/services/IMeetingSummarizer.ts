import { MeetingSummary, SummaryUtterance } from "../models/MeetingSummary.js";

export interface SummarizeInput {
  sessionId: string;
  utterances: SummaryUtterance[];
}

export interface IMeetingSummarizer {
  summarize(input: SummarizeInput): Promise<MeetingSummary>;
}
