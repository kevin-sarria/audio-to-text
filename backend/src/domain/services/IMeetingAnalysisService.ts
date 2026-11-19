import { DevIssueDto, MeetingAnalysisProvider, RepoHoursTotals } from "@audio-to-text/shared";

export interface GenerateAnalysisOptions {
  provider?: MeetingAnalysisProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface GeneratedMeetingData {
  summary: string;
  alreadyResolved?: string[];
  inProgress?: string[];
  keyDecisions: string[];
  topicsDiscussed: string[];
  globalOpenQuestions?: string[];
  issues: DevIssueDto[];
  backlog?: string[];
  repoHoursTotals?: RepoHoursTotals;
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
