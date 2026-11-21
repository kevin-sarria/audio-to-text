import { IProjectFolderRepository } from "../../../domain/repositories/IProjectFolderRepository.js";
import { ProjectFolder } from "../../../domain/entities/ProjectFolder.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

export interface UpdateProjectFolderInput {
  id: string;
  name?: string;
  description?: string;
  technicalContext?: string;
  defaultProvider?: string;
  defaultModel?: string;
  customApiKey?: string;
  profileId?: string;
}

export class UpdateProjectFolder {
  constructor(private projectFolderRepository: IProjectFolderRepository) {}

  public async execute(input: UpdateProjectFolderInput): Promise<ProjectFolder> {
    const folder = await this.projectFolderRepository.findById(input.id);
    if (!folder) {
      throw new NotFoundError("Carpeta de proyecto", input.id);
    }

    folder.update({
      name: input.name !== undefined ? input.name.trim() : undefined,
      description: input.description !== undefined ? input.description.trim() : undefined,
      technicalContext: input.technicalContext !== undefined ? input.technicalContext.trim() : undefined,
      defaultProvider: input.defaultProvider !== undefined ? input.defaultProvider.trim() : undefined,
      defaultModel: input.defaultModel !== undefined ? input.defaultModel.trim() : undefined,
      customApiKey: input.customApiKey !== undefined ? input.customApiKey.trim() : undefined,
      profileId: input.profileId !== undefined ? input.profileId.trim() || null : undefined
    });

    return await this.projectFolderRepository.update(folder);
  }
}
