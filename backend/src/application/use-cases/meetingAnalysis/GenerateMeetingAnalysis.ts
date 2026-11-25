import crypto from "node:crypto";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IMeetingAnalysisRepository } from "../../../domain/repositories/IMeetingAnalysisRepository.js";
import { IProjectFolderRepository } from "../../../domain/repositories/IProjectFolderRepository.js";
import { IMeetingAnalysisService } from "../../../domain/services/IMeetingAnalysisService.js";
import { MeetingAnalysis } from "../../../domain/entities/MeetingAnalysis.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";
import { SessionStatus } from "../../../domain/value-objects/SessionStatus.js";

import { MeetingAnalysisProvider } from "@audio-to-text/shared";

export interface GenerateMeetingAnalysisAccessInput {
  sessionId: string;
  userId?: string | null;
  guestTokenHash?: string | null;
}

export interface GenerateMeetingAnalysisInput extends GenerateMeetingAnalysisAccessInput {
  title?: string;
  projectContext?: string;
  provider?: MeetingAnalysisProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Perfil de reglas del proyecto. Si no llega, se usa el de la carpeta vinculada y si no, "generic". */
  profileId?: string;
  /** Avisa de la etapa en curso (para el seguimiento del trabajo en segundo plano). */
  onProgress?: (msg: string) => void;
}

export class GenerateMeetingAnalysis {
  constructor(
    private sessionRepository: ISessionRepository,
    private analysisRepository: IMeetingAnalysisRepository,
    private analysisService: IMeetingAnalysisService,
    private projectFolderRepository?: IProjectFolderRepository
  ) {}

  /** Comprueba que la sesión existe y que quien pregunta tiene acceso a ella. */
  public async assertCanAccess(input: GenerateMeetingAnalysisAccessInput): Promise<void> {
    await this.loadAccessibleSession(input);
  }

  /** Validaciones previas a generar (acceso, estado y segmentos), sin llamar a la IA. */
  public async assertCanGenerate(input: GenerateMeetingAnalysisAccessInput): Promise<void> {
    await this.loadGeneratableSession(input);
  }

  private async loadAccessibleSession(input: GenerateMeetingAnalysisAccessInput) {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new ForbiddenError("No tiene permisos para acceder a esta sesión.");
    }

    return session;
  }

  private async loadGeneratableSession(input: GenerateMeetingAnalysisAccessInput) {
    const session = await this.loadAccessibleSession(input);

    if (session.status !== SessionStatus.COMPLETED) {
      throw new ValidationError(
        "La sesión debe estar en estado COMPLETED para poder generar el resumen e issues de programación."
      );
    }

    const segments = session.segments;
    if (!segments || segments.length === 0) {
      throw new ValidationError(
        "La sesión no cuenta con segmentos transcritos para poder procesar la reunión."
      );
    }

    return session;
  }

  public async execute(input: GenerateMeetingAnalysisInput): Promise<MeetingAnalysis> {
    const session = await this.loadGeneratableSession(input);
    const segments = session.segments!;

    // Si la sesión está asociada a una carpeta de proyecto y no se especificó contexto o credenciales, cargarlas
    let resolvedProjectContext = input.projectContext;
    let resolvedProvider = input.provider;
    let resolvedModel = input.model;
    let resolvedApiKey = input.apiKey;
    let resolvedProfileId = input.profileId?.trim() || undefined;

    if (session.projectFolderId && this.projectFolderRepository) {
      try {
        const folder = await this.projectFolderRepository.findById(session.projectFolderId);
        if (folder) {
          if (!resolvedProjectContext) resolvedProjectContext = folder.technicalContext;
          if (!resolvedProvider && folder.defaultProvider) resolvedProvider = folder.defaultProvider as any;
          if (!resolvedModel && folder.defaultModel) resolvedModel = folder.defaultModel;
          if (!resolvedApiKey && folder.customApiKey) resolvedApiKey = folder.customApiKey;
          if (!resolvedProfileId && folder.profileId) resolvedProfileId = folder.profileId;
        }
      } catch (err) {
        console.warn(`[GenerateMeetingAnalysis] No se pudo cargar carpeta ${session.projectFolderId}:`, err);
      }
    }

    // Mapear hablantes por ID
    const speakerMap = new Map<string, string>();
    if (session.speakers) {
      for (const sp of session.speakers) {
        speakerMap.set(sp.id, sp.customName || sp.label);
      }
    }

    // Construir transcripción formateada con oradores y marcas de tiempo
    const formattedTranscript = segments
      .map((seg) => {
        const speakerName = speakerMap.get(seg.speakerId) || "Participante";
        const totalSec = Math.floor(seg.startTimeMs / 1000);
        const mins = Math.floor(totalSec / 60)
          .toString()
          .padStart(2, "0");
        const secs = (totalSec % 60).toString().padStart(2, "0");
        return `[${mins}:${secs}] ${speakerName}: ${seg.content}`;
      })
      .join("\n");

    const analysisData = await this.analysisService.generateAnalysis(
      formattedTranscript,
      resolvedProjectContext,
      {
        provider: resolvedProvider,
        apiKey: resolvedApiKey,
        model: resolvedModel,
        baseUrl: input.baseUrl,
        profileId: resolvedProfileId || "generic",
        onProgress: input.onProgress
      }
    );

    const defaultTitle = input.title || `Análisis: ${session.originalFileName.replace(/\.[^/.]+$/, "")}`;

    const existing = await this.analysisRepository.findBySessionId(input.sessionId);
    let resultAnalysis: MeetingAnalysis;

    if (existing) {
      existing.update({
        title: input.title !== undefined ? input.title : existing.title || defaultTitle,
        projectContext: resolvedProjectContext ?? null,
        summary: analysisData.summary,
        keyDecisions: analysisData.keyDecisions,
        topicsDiscussed: analysisData.topicsDiscussed,
        issues: analysisData.issues,
        alreadyResolved: analysisData.alreadyResolved ?? existing.alreadyResolved,
        inProgress: analysisData.inProgress ?? existing.inProgress,
        globalOpenQuestions: analysisData.globalOpenQuestions ?? existing.globalOpenQuestions,
        backlog: analysisData.backlog ?? existing.backlog,
        repoHoursTotals: analysisData.repoHoursTotals ?? existing.repoHoursTotals,
        generationMeta: analysisData.generationMeta ?? null
      });
      resultAnalysis = await this.analysisRepository.save(existing);
    } else {
      const newAnalysis = new MeetingAnalysis({
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        title: defaultTitle,
        projectContext: resolvedProjectContext ?? null,
        summary: analysisData.summary,
        keyDecisions: analysisData.keyDecisions,
        topicsDiscussed: analysisData.topicsDiscussed,
        issues: analysisData.issues,
        alreadyResolved: analysisData.alreadyResolved || [],
        inProgress: analysisData.inProgress || [],
        globalOpenQuestions: analysisData.globalOpenQuestions || [],
        backlog: analysisData.backlog || [],
        repoHoursTotals: analysisData.repoHoursTotals || null,
        generationMeta: analysisData.generationMeta ?? null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      resultAnalysis = await this.analysisRepository.save(newAnalysis);
    }

    return resultAnalysis;
  }
}
