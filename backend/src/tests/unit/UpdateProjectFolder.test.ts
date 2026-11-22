import { describe, it, expect, beforeEach } from "vitest";
import { UpdateProjectFolder } from "../../application/use-cases/projectFolder/UpdateProjectFolder.js";
import { IProjectFolderRepository } from "../../domain/repositories/IProjectFolderRepository.js";
import { ProjectFolder } from "../../domain/entities/ProjectFolder.js";
import { NotFoundError } from "../../domain/errors/NotFoundError.js";

class InMemoryProjectFolderRepository implements IProjectFolderRepository {
  private folders = new Map<string, ProjectFolder>();

  public async findById(id: string): Promise<ProjectFolder | null> {
    return this.folders.get(id) || null;
  }

  public async findAll(_userId?: string | null): Promise<ProjectFolder[]> {
    return Array.from(this.folders.values());
  }

  public async create(folder: ProjectFolder): Promise<ProjectFolder> {
    this.folders.set(folder.id, folder);
    return folder;
  }

  public async update(folder: ProjectFolder): Promise<ProjectFolder> {
    this.folders.set(folder.id, folder);
    return folder;
  }

  public async delete(id: string): Promise<void> {
    this.folders.delete(id);
  }
}

describe("UpdateProjectFolder", () => {
  let repo: InMemoryProjectFolderRepository;
  let useCase: UpdateProjectFolder;
  const folderId = "folder-test-123";

  beforeEach(async () => {
    repo = new InMemoryProjectFolderRepository();
    useCase = new UpdateProjectFolder(repo);

    const initial = new ProjectFolder({
      id: folderId,
      userId: null,
      name: "Proyecto Original",
      description: "Descripción original",
      technicalContext: "Contexto técnico inicial",
      defaultProvider: "openai",
      defaultModel: "gpt-4o",
      customApiKey: "sk-original-secret",
      profileId: "diamante",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await repo.create(initial);
  });

  it("guardar un modelo distinto persiste", async () => {
    const updated = await useCase.execute({
      id: folderId,
      defaultModel: "gpt-4o-mini"
    });

    expect(updated.defaultModel).toBe("gpt-4o-mini");
    const retrieved = await repo.findById(folderId);
    expect(retrieved?.defaultModel).toBe("gpt-4o-mini");
  });

  it("actualizar solo el nombre conserva proveedor y modelo", async () => {
    const updated = await useCase.execute({
      id: folderId,
      name: "Proyecto Renombrado"
    });

    expect(updated.name).toBe("Proyecto Renombrado");
    expect(updated.defaultProvider).toBe("openai");
    expect(updated.defaultModel).toBe("gpt-4o");
    expect(updated.customApiKey).toBe("sk-original-secret");
    expect(updated.description).toBe("Descripción original");
  });

  it("defaultModel: \"\" lo deja en null", async () => {
    const updated = await useCase.execute({
      id: folderId,
      defaultModel: ""
    });

    expect(updated.defaultModel).toBeNull();
    const retrieved = await repo.findById(folderId);
    expect(retrieved?.defaultModel).toBeNull();
  });

  it("description y defaultProvider vacíos tras trim() se guardan como null", async () => {
    const updated = await useCase.execute({
      id: folderId,
      description: "   ",
      defaultProvider: ""
    });

    expect(updated.description).toBeNull();
    expect(updated.defaultProvider).toBeNull();
  });

  it("customApiKey: \"\" conserva la clave guardada", async () => {
    const updated = await useCase.execute({
      id: folderId,
      customApiKey: ""
    });

    expect(updated.customApiKey).toBe("sk-original-secret");
    const retrieved = await repo.findById(folderId);
    expect(retrieved?.customApiKey).toBe("sk-original-secret");
  });

  it("customApiKey con valor nuevo la actualiza", async () => {
    const updated = await useCase.execute({
      id: folderId,
      customApiKey: "sk-new-api-key"
    });

    expect(updated.customApiKey).toBe("sk-new-api-key");
  });

  it("lanza NotFoundError si la carpeta no existe", async () => {
    await expect(
      useCase.execute({
        id: "non-existent-id",
        name: "Test"
      })
    ).rejects.toThrow(NotFoundError);
  });
});
