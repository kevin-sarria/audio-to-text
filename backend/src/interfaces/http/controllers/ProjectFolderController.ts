import { Request, Response, NextFunction } from "express";
import { CreateProjectFolder } from "../../../application/use-cases/projectFolder/CreateProjectFolder.js";
import { ListProjectFolders } from "../../../application/use-cases/projectFolder/ListProjectFolders.js";
import { GetProjectFolder } from "../../../application/use-cases/projectFolder/GetProjectFolder.js";
import { UpdateProjectFolder } from "../../../application/use-cases/projectFolder/UpdateProjectFolder.js";
import { DeleteProjectFolder } from "../../../application/use-cases/projectFolder/DeleteProjectFolder.js";
import { IMeetingAnalysisService } from "../../../domain/services/IMeetingAnalysisService.js";

export class ProjectFolderController {
  constructor(
    private createProjectFolder: CreateProjectFolder,
    private listProjectFolders: ListProjectFolders,
    private getProjectFolder: GetProjectFolder,
    private updateProjectFolderUseCase: UpdateProjectFolder,
    private deleteProjectFolderUseCase: DeleteProjectFolder,
    private analysisService?: IMeetingAnalysisService
  ) {}

  public scanContext = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { folderPath, provider, model, apiKey, baseUrl } = req.body || {};
      if (!folderPath || typeof folderPath !== "string" || !folderPath.trim()) {
        res.status(400).json({ success: false, error: "La ruta de la carpeta del proyecto es obligatoria." });
        return;
      }

      if (!this.analysisService || !this.analysisService.generateContextFromRepo) {
        res.status(501).json({
          success: false,
          error: "El servicio de escaneo de contexto con IA no está disponible."
        });
        return;
      }

      const scanResult = await this.analysisService.generateContextFromRepo(folderPath.trim(), {
        provider,
        model,
        apiKey,
        baseUrl
      });

      res.json({
        success: true,
        data: {
          folderPath: folderPath.trim(),
          technicalContext: scanResult.technicalContext,
          report: scanResult.report
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId || null;
      const { name, description, technicalContext, defaultProvider, defaultModel, customApiKey, profileId } = req.body;

      const folder = await this.createProjectFolder.execute({
        userId,
        name,
        description,
        technicalContext,
        defaultProvider,
        defaultModel,
        customApiKey,
        profileId
      });

      res.status(201).json({
        success: true,
        data: {
          id: folder.id,
          name: folder.name,
          description: folder.description,
          technicalContext: folder.technicalContext,
          defaultProvider: folder.defaultProvider,
          defaultModel: folder.defaultModel,
          customApiKey: folder.customApiKey ? "••••" + folder.customApiKey.slice(-4) : undefined,
          profileId: folder.profileId ?? undefined,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString()
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId || null;
      const folders = await this.listProjectFolders.execute(userId);

      res.json({
        success: true,
        data: folders.map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          technicalContext: f.technicalContext,
          defaultProvider: f.defaultProvider,
          defaultModel: f.defaultModel,
          customApiKey: f.customApiKey ? "••••" + f.customApiKey.slice(-4) : undefined,
          profileId: f.profileId ?? undefined,
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString()
        }))
      });
    } catch (err) {
      next(err);
    }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params["id"]!;
      const folder = await this.getProjectFolder.execute(id);

      res.json({
        success: true,
        data: {
          id: folder.id,
          name: folder.name,
          description: folder.description,
          technicalContext: folder.technicalContext,
          defaultProvider: folder.defaultProvider,
          defaultModel: folder.defaultModel,
          customApiKey: folder.customApiKey ? "••••" + folder.customApiKey.slice(-4) : undefined,
          profileId: folder.profileId ?? undefined,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString()
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params["id"]!;
      const { name, description, technicalContext, defaultProvider, defaultModel, customApiKey, profileId } = req.body;

      const folder = await this.updateProjectFolderUseCase.execute({
        id,
        name,
        description,
        technicalContext,
        defaultProvider,
        defaultModel,
        customApiKey,
        profileId
      });

      res.json({
        success: true,
        data: {
          id: folder.id,
          name: folder.name,
          description: folder.description,
          technicalContext: folder.technicalContext,
          defaultProvider: folder.defaultProvider,
          defaultModel: folder.defaultModel,
          customApiKey: folder.customApiKey ? "••••" + folder.customApiKey.slice(-4) : undefined,
          profileId: folder.profileId ?? undefined,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString()
        }
      });
    } catch (err) {
      next(err);
    }
  };

  public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params["id"]!;
      await this.deleteProjectFolderUseCase.execute(id);

      res.json({
        success: true,
        message: "Carpeta de proyecto eliminada correctamente."
      });
    } catch (err) {
      next(err);
    }
  };
}
