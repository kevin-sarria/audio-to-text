import { ProjectFolder } from "../entities/ProjectFolder.js";

export interface IProjectFolderRepository {
  create(folder: ProjectFolder): Promise<ProjectFolder>;
  findById(id: string): Promise<ProjectFolder | null>;
  findAll(userId?: string | null): Promise<ProjectFolder[]>;
  update(folder: ProjectFolder): Promise<ProjectFolder>;
  delete(id: string): Promise<void>;
}
