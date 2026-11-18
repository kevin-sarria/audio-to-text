import { IProjectFolderRepository } from "../../../domain/repositories/IProjectFolderRepository.js";
import { ProjectFolder } from "../../../domain/entities/ProjectFolder.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

export class GetProjectFolder {
  constructor(private projectFolderRepository: IProjectFolderRepository) {}

  public async execute(id: string): Promise<ProjectFolder> {
    const folder = await this.projectFolderRepository.findById(id);
    if (!folder) {
      throw new NotFoundError("Carpeta de proyecto", id);
    }
    return folder;
  }
}
