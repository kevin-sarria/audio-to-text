import { z } from "zod";

export type DevIssueType = "feature" | "bug" | "refactor" | "chore" | "spike";
export type DevIssuePriority = "high" | "medium" | "low";

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
  createdAt: string;
  updatedAt: string;
}

export const UpdateMeetingAnalysisTitleSchema = z.object({
  title: z.string().trim().min(1, "El título no puede estar vacío").max(150)
});

export type MeetingAnalysisProvider = "google-account" | "gemini" | "groq" | "openai" | "custom";

export interface GenerateMeetingAnalysisRequestDto {
  projectContext?: string;
  provider?: MeetingAnalysisProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export const GenerateMeetingAnalysisSchema = z.object({
  projectContext: z.string().max(10000, "El contexto del proyecto no puede superar 10000 caracteres").optional(),
  provider: z.enum(["google-account", "gemini", "groq", "openai", "custom"]).optional(),
  apiKey: z.string().max(256).optional(),
  model: z.string().max(100).optional(),
  baseUrl: z.string().url("La URL base debe ser una URL válida").max(500).optional()
});
