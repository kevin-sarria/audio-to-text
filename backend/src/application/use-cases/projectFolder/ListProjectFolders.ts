import { IProjectFolderRepository } from "../../../domain/repositories/IProjectFolderRepository.js";
import { ProjectFolder } from "../../../domain/entities/ProjectFolder.js";

export class ListProjectFolders {
  constructor(private projectFolderRepository: IProjectFolderRepository) {}

  public async execute(userId?: string | null): Promise<ProjectFolder[]> {
    return await this.projectFolderRepository.findAll(userId);
  }
}
