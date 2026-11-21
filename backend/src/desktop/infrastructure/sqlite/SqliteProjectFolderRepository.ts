import type { DatabaseSync } from "node:sqlite";
import { IProjectFolderRepository } from "../../../domain/repositories/IProjectFolderRepository.js";
import { ProjectFolder } from "../../../domain/entities/ProjectFolder.js";

export class SqliteProjectFolderRepository implements IProjectFolderRepository {
  constructor(private db: DatabaseSync) {}

  public async findById(id: string): Promise<ProjectFolder | null> {
    const row = this.db.prepare("SELECT * FROM project_folders WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.toDomain(row);
  }

  public async findAll(userId?: string | null): Promise<ProjectFolder[]> {
    let rows: any[];
    if (userId) {
      rows = this.db
        .prepare("SELECT * FROM project_folders WHERE user_id = ? OR user_id IS NULL ORDER BY name ASC")
        .all(userId) as any[];
    } else {
      rows = this.db.prepare("SELECT * FROM project_folders ORDER BY name ASC").all() as any[];
    }
    return rows.map((r) => this.toDomain(r));
  }

  public async create(folder: ProjectFolder): Promise<ProjectFolder> {
    const stmt = this.db.prepare(`
      INSERT INTO project_folders (
        id, user_id, name, description, technical_context,
        default_provider, default_model, custom_api_key, profile_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      folder.id,
      folder.userId ?? null,
      folder.name,
      folder.description ?? null,
      folder.technicalContext,
      folder.defaultProvider ?? null,
      folder.defaultModel ?? null,
      folder.customApiKey ?? null,
      folder.profileId ?? null,
      folder.createdAt.toISOString(),
      folder.updatedAt.toISOString()
    );

    return (await this.findById(folder.id))!;
  }

  public async update(folder: ProjectFolder): Promise<ProjectFolder> {
    const stmt = this.db.prepare(`
      UPDATE project_folders SET
        name = ?,
        description = ?,
        technical_context = ?,
        default_provider = ?,
        default_model = ?,
        custom_api_key = ?,
        profile_id = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      folder.name,
      folder.description ?? null,
      folder.technicalContext,
      folder.defaultProvider ?? null,
      folder.defaultModel ?? null,
      folder.customApiKey ?? null,
      folder.profileId ?? null,
      folder.updatedAt.toISOString(),
      folder.id
    );

    return (await this.findById(folder.id))!;
  }

  public async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM project_folders WHERE id = ?").run(id);
  }

  private toDomain(raw: any): ProjectFolder {
    return new ProjectFolder({
      id: raw.id,
      userId: raw.user_id,
      name: raw.name,
      description: raw.description ?? null,
      technicalContext: raw.technical_context,
      defaultProvider: raw.default_provider ?? null,
      defaultModel: raw.default_model ?? null,
      customApiKey: raw.custom_api_key ?? null,
      profileId: raw.profile_id ?? null,
      createdAt: new Date(raw.created_at),
      updatedAt: new Date(raw.updated_at)
    });
  }
}
