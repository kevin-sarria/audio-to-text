import { ExportFormat } from "@audio-to-text/shared";
import { ISessionRepository } from "../../../domain/repositories/ISessionRepository.js";
import { IExporter } from "../../../domain/services/IExporter.js";
import { NotFoundError } from "../../../domain/errors/NotFoundError.js";
import { ForbiddenError } from "../../../domain/errors/ForbiddenError.js";

export interface ExportSessionInput {
  sessionId: string;
  format: ExportFormat;
  userId?: string | null;
  guestTokenHash?: string | null;
}

export interface ExportSessionOutput {
  data: Buffer | string;
  mimeType: string;
  fileName: string;
}

export class ExportSession {
  constructor(
    private sessionRepository: ISessionRepository,
    private exporters: Map<ExportFormat, IExporter>
  ) {}

  public async execute(input: ExportSessionInput): Promise<ExportSessionOutput> {
    const session = await this.sessionRepository.findById(input.sessionId);
    if (!session) {
      throw new NotFoundError("Sesión de transcripción", input.sessionId);
    }

    if (!session.canAccess(input.userId, input.guestTokenHash)) {
      throw new ForbiddenError("No tiene permisos para exportar esta sesión.");
    }

    const exporter = this.exporters.get(input.format);
    if (!exporter) {
      throw new NotFoundError(`Exportador para el formato '${input.format}'`);
    }

    const exportData = await exporter.export(
      session,
      session.speakers,
      session.segments
    );

    const baseName = session.originalFileName.replace(/\.[^/.]+$/, "");
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const fileName = `${safeBaseName}.${exporter.extension}`;

    return {
      data: exportData,
      mimeType: exporter.mimeType,
      fileName
    };
  }
}
