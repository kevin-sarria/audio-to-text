import { z } from "zod";

export interface CustomAiProviderDto {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string;
}

export const CustomAiProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "El nombre del proveedor es obligatorio").max(100),
  baseUrl: z.string().url("La URL base debe ser una URL válida").max(500),
  apiKey: z.string().max(256).optional(),
  defaultModel: z.string().min(1, "El modelo por defecto es obligatorio").max(100)
});

export interface ProjectFolderDto {
  id: string;
  name: string;
  description?: string;
  technicalContext: string;
  defaultProvider?: string;
  defaultModel?: string;
  customApiKey?: string;
  profileId?: string;
  createdAt: string;
  updatedAt: string;
}

export const CreateProjectFolderSchema = z.object({
  name: z.string().trim().min(1, "El nombre de la carpeta de proyecto es obligatorio").max(120),
  description: z.string().max(500).optional(),
  technicalContext: z.string().min(1, "El contexto técnico es obligatorio").max(40000),
  defaultProvider: z.string().max(50).optional(),
  defaultModel: z.string().max(100).optional(),
  customApiKey: z.string().max(256).optional(),
  profileId: z.string().max(50).optional()
});

export const UpdateProjectFolderSchema = CreateProjectFolderSchema.partial();

export interface ProjectContextScanReportDto {
  generatedAt: string;
  providerLabel: string;
  model: string;
  layout: "single-repo" | "multi-repo" | "monorepo" | "no-git";
  repositories: Array<{
    path: string;
    name: string;
    headCommit: string | null;
    branch?: string | null;
    kind?: "repo" | "submodulo";
  }>;
  /** Copias de trabajo, clones duplicados y carpetas sin git: se listan pero no se analizan. */
  otherFolders?: Array<{
    path: string;
    kind: "copia-de-trabajo" | "clon-duplicado" | "sin-git";
    ownerPath: string | null;
    branch: string | null;
    lastModified: string | null;
    notes: string[];
  }>;
  readLog: Array<{ path: string; status: "complete" | "sections" | "omitted"; sections?: number; reason?: string }>;
  notFullyRead: string[];
  verification: { verified: number; unconfirmed: number; discarded: number };
  discarded: Array<{ section: string; dato: string; fuente: string; reason: string }>;
  openQuestions: string[];
  contradictions: number;
  notFound: string[];
  redactions: number;
  skippedSecretFiles: number;
  llmCalls: number;
}

export interface ProjectContextScanResultDto {
  technicalContext: string;
  report: ProjectContextScanReportDto;
}
