import { PrismaClient } from "@prisma/client";
import { IProjectFolderRepository } from "../../domain/repositories/IProjectFolderRepository.js";
import { ProjectFolder } from "../../domain/entities/ProjectFolder.js";

export class PrismaProjectFolderRepository implements IProjectFolderRepository {
  constructor(private prisma: PrismaClient) {}

  public async findById(id: string): Promise<ProjectFolder | null> {
    const raw = await this.prisma.projectFolder.findUnique({
      where: { id }
    });
    return raw ? this.toDomain(raw) : null;
  }

  public async findAll(userId?: string | null): Promise<ProjectFolder[]> {
    const where = userId ? { OR: [{ userId }, { userId: null }] } : {};
    const rawList = await this.prisma.projectFolder.findMany({
      where,
      orderBy: { name: "asc" }
    });
    return rawList.map((r) => this.toDomain(r));
  }

  public async create(folder: ProjectFolder): Promise<ProjectFolder> {
    const raw = await this.prisma.projectFolder.create({
      data: {
        id: folder.id,
        userId: folder.userId || null,
        name: folder.name,
        description: folder.description || null,
        technicalContext: folder.technicalContext,
        defaultProvider: folder.defaultProvider || null,
        defaultModel: folder.defaultModel || null,
        customApiKey: folder.customApiKey || null,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      }
    });
    return this.toDomain(raw);
  }

  public async update(folder: ProjectFolder): Promise<ProjectFolder> {
    const raw = await this.prisma.projectFolder.update({
      where: { id: folder.id },
      data: {
        name: folder.name,
        description: folder.description || null,
        technicalContext: folder.technicalContext,
        defaultProvider: folder.defaultProvider || null,
        defaultModel: folder.defaultModel || null,
        customApiKey: folder.customApiKey || null,
        updatedAt: folder.updatedAt
      }
    });
    return this.toDomain(raw);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.projectFolder.delete({
      where: { id }
    });
  }

  private toDomain(raw: any): ProjectFolder {
    return new ProjectFolder({
      id: raw.id,
      userId: raw.userId,
      name: raw.name,
      description: raw.description ?? null,
      technicalContext: raw.technicalContext,
      defaultProvider: raw.defaultProvider ?? null,
      defaultModel: raw.defaultModel ?? null,
      customApiKey: raw.customApiKey ?? null,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt
    });
  }
}
