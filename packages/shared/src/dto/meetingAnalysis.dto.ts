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

export interface AnalysisGenerationMetaDto {
  /** ID del proveedor resuelto: "google-account" | "gemini" | "groq" | "openai" | "custom-xxxx" */
  provider: string;
  /** Nombre legible: "Cuenta de Google (Antigravity)", "Google Gemini API", "Groq", "OpenAI" o el nombre del proveedor personalizado ("DeepSeek") */
  providerLabel: string;
  /** Modelo efectivo usado. "" = modelo predeterminado del proveedor */
  model: string;
  /** Perfil de proyecto usado: "diamante" | "generic" | ... */
  profileId: string;
  profileName: string;
  /** ISO 8601 */
  generatedAt: string;
  durationMs: number;
  /** Intentos de la etapa de redacción (1 = sin reintentos). 0 si no se llamó al modelo */
  attempts: number;
  /** true si se cayó al análisis de paso único */
  usedFallback: boolean;
  /** true si la transcripción tiene tramos sin audio (Análisis parcial) */
  partialAnalysis: boolean;
  /** Errores de validación que quedaron tras el último reintento (vacío = todo validado) */
  validationErrors: string[];
  /** Avisos para revisión humana */
  validationWarnings: string[];
}

export interface ProjectProfileSummaryDto {
  id: string;          // "diamante", "generic"
  name: string;        // "DIAMANTE (Limpieza Inteligente)", "Genérico (sin reglas de negocio)"
  description: string; // una línea
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
  generationMeta?: AnalysisGenerationMetaDto | null;
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
  profileId?: string;
}

export const GenerateMeetingAnalysisSchema = z.object({
  projectContext: z.string().max(10000, "El contexto del proyecto no puede superar 10000 caracteres").optional(),
  provider: z.string().max(100).optional(),
  apiKey: z.string().max(256).optional(),
  model: z.string().max(100).optional(),
  baseUrl: z.string().url("La URL base debe ser una URL válida").max(500).optional(),
  profileId: z.string().max(50).optional()
});

export interface AvailableModelItem {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
}

export interface AvailableLlmModelsDto {
  provider: string;
  models: AvailableModelItem[];
  defaultModel: string;
  isLiveDiscovered?: boolean;
}
