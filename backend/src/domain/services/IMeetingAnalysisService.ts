import { DevIssueDto, MeetingAnalysisProvider } from "@audio-to-text/shared";

export interface GenerateAnalysisOptions {
  provider?: MeetingAnalysisProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface GeneratedMeetingData {
  summary: string;
  keyDecisions: string[];
  topicsDiscussed: string[];
  issues: DevIssueDto[];
}

export interface IMeetingAnalysisService {
  generateAnalysis(
    transcript: string,
    projectContext?: string,
    options?: GenerateAnalysisOptions
  ): Promise<GeneratedMeetingData>;

  generateContextFromRepo?(
    repoPath: string,
    options?: GenerateAnalysisOptions
  ): Promise<string>;
}
