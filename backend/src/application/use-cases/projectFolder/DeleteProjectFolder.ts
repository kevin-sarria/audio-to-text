import { IProjectFolderRepository } from "../../../domain/repositories/IProjectFolderRepository.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";

export class DeleteProjectFolder {
  constructor(private projectFolderRepository: IProjectFolderRepository) {}

  public async execute(id: string): Promise<void> {
    const folder = await this.projectFolderRepository.findById(id);
    if (!folder) {
      throw new NotFoundError("Carpeta de proyecto", id);
    }
    await this.projectFolderRepository.delete(id);
  }
}
