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
  createdAt: string;
  updatedAt: string;
}

export const CreateProjectFolderSchema = z.object({
  name: z.string().trim().min(1, "El nombre de la carpeta de proyecto es obligatorio").max(120),
  description: z.string().max(500).optional(),
  technicalContext: z.string().min(1, "El contexto técnico es obligatorio").max(15000),
  defaultProvider: z.string().max(50).optional(),
  defaultModel: z.string().max(100).optional(),
  customApiKey: z.string().max(256).optional()
});

export const UpdateProjectFolderSchema = CreateProjectFolderSchema.partial();
