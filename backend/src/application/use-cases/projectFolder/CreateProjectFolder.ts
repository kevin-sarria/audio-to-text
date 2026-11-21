import crypto from "node:crypto";
import { IProjectFolderRepository } from "../../../domain/repositories/IProjectFolderRepository.js";
import { ProjectFolder } from "../../../domain/entities/ProjectFolder.js";

export interface CreateProjectFolderInput {
  userId?: string | null;
  name: string;
  description?: string;
  technicalContext: string;
  defaultProvider?: string;
  defaultModel?: string;
  customApiKey?: string;
  /** Perfil de reglas del proyecto ("diamante", "generic"…). Vacío = genérico. */
  profileId?: string;
}

export class CreateProjectFolder {
  constructor(private projectFolderRepository: IProjectFolderRepository) {}

  public async execute(input: CreateProjectFolderInput): Promise<ProjectFolder> {
    const now = new Date();
    const folder = new ProjectFolder({
      id: crypto.randomUUID(),
      userId: input.userId || null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      technicalContext: input.technicalContext.trim(),
      defaultProvider: input.defaultProvider?.trim() || null,
      defaultModel: input.defaultModel?.trim() || null,
      customApiKey: input.customApiKey?.trim() || null,
      profileId: input.profileId?.trim() || null,
      createdAt: now,
      updatedAt: now
    });

    return await this.projectFolderRepository.create(folder);
  }
}
