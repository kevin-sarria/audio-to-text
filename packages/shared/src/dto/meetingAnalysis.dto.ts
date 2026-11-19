import { z } from "zod";

export type DevIssueType = "feature" | "bug" | "refactor" | "chore" | "spike";
export type DevIssuePriority = "high" | "medium" | "low";
export type DevIssueRepo = "backend" | "panel" | "app" | "otro";

export interface DevIssueEstimation {
  backendHours: number;
  panelHours: number;
  appHours: number;
  totalHours: number;
  text: string;
}

export interface DevIssueDto {
  id: string;
  title: string;
  type: DevIssueType;
  priority: DevIssuePriority;
  component: string;
  description: string;
  expectedFiles?: string[];
  acceptanceCriteria: string[];
  agentPrompt: string;
  repo?: DevIssueRepo;
  estimation?: DevIssueEstimation;
  openQuestions?: string[];
  dependencies?: string[];
  prWorkflow?: string;
}

export interface RepoHoursTotals {
  backend: number;
  panel: number;
  app: number;
  total: number;
}

export interface MeetingAnalysisDto {
  id: string;
  sessionId: string;
  title?: string;
  projectContext?: string;
  summary: string;
  keyDecisions: string[];
  topicsDiscussed: string[];
  issues: DevIssueDto[];
  alreadyResolved?: string[];
  inProgress?: string[];
  globalOpenQuestions?: string[];
  backlog?: string[];
  repoHoursTotals?: RepoHoursTotals;
  createdAt: string;
  updatedAt: string;
}

export const UpdateMeetingAnalysisTitleSchema = z.object({
  title: z.string().trim().min(1, "El título no puede estar vacío").max(150)
});

export type MeetingAnalysisProvider = "google-account" | "gemini" | "groq" | "openai" | "custom" | (string & {});

export interface GenerateMeetingAnalysisRequestDto {
  projectContext?: string;
  provider?: MeetingAnalysisProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export const GenerateMeetingAnalysisSchema = z.object({
  projectContext: z.string().max(10000, "El contexto del proyecto no puede superar 10000 caracteres").optional(),
  provider: z.string().max(100).optional(),
  apiKey: z.string().max(256).optional(),
  model: z.string().max(100).optional(),
  baseUrl: z.string().url("La URL base debe ser una URL válida").max(500).optional()
});
