import fs from "node:fs";
import path from "node:path";
import { MeetingPlatform, MeetingType, MeetingClassification } from "../domain/models/MeetingTypes.js";
import { HeadlessMeetingBotConnector } from "../infrastructure/connectors/HeadlessMeetingBotConnector.js";
import { MeetingClassifierLlmService } from "../infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "../infrastructure/ai/CommercialProposalLlmService.js";
import { DevIssuesExcelExporter, DevIssueExportData } from "../infrastructure/export/DevIssuesExcelExporter.js";
import { TranscriptDocxExporter, TranscriptUtterance } from "../infrastructure/export/TranscriptDocxExporter.js";
import { ExtractedUtterance } from "../infrastructure/connectors/PlatformSpeakerExtractor.js";
import { IMeetingSummarizer } from "../domain/services/IMeetingSummarizer.js";
import { MeetingSummaryLlmService } from "../infrastructure/ai/MeetingSummaryLlmService.js";
import type { MeetingSummary } from "../domain/models/MeetingSummary.js";
import type { LiveStatusCallback } from "../domain/models/LiveSession.js";
import type { EndReason } from "../domain/services/MeetingEndDetector.js";
import { writeBotMeetingDelivery } from "../infrastructure/export/BotMeetingDeliveryWriter.js";
import {
  renderConsoleExcerpt,
  renderSummaryMarkdown
} from "../infrastructure/export/MeetingSummaryMarkdownRenderer.js";

export interface AutonomousBotConfig {
  meetingUrl: string;
  botDisplayName?: string;
  outputDirectory?: string;
  onUtterance?: (utterance: ExtractedUtterance) => void;
  onMeetingTypeResolved?: (classification: MeetingClassification) => void;
  /** Ajustes inyectados; si se pasan no se lee `.bot-settings.json` de la raíz. */
  settings?: { botDisplayName?: string; autoRecord?: boolean };
  profileDir?: string;
  chromePath?: string;
  onStatus?: LiveStatusCallback;
  onEnded?: (reason: EndReason) => void;
  /** Solo inicia la sesión de captura sin abrir ningún navegador (modo simulación del CLI). */
  skipConnection?: boolean;
}

export interface AutonomousMeetingRecord {
  sessionId: string;
  meetingUrl: string;
  platform: MeetingPlatform;
  startedAt: string;
  endedAt: string;
  speakers: string[];
  meetingType: MeetingType;
  classificationReason: string;
  transcriptDocxPath: string;
  issuesExcelPath?: string;
  proposalMarkdownPath?: string;
  summaryMarkdownPath?: string;
  summaryJsonPath?: string;
  deliveryFilePath?: string;
  utterancesCount: number;
}

export class AutonomousMeetingBotService {
  private activeUtterances: ExtractedUtterance[] = [];
  private isRunning = false;
  private startTime = 0;

  constructor(
    private classifier: MeetingClassifierLlmService,
    private proposalGen: CommercialProposalLlmService,
    private excelExporter: DevIssuesExcelExporter = new DevIssuesExcelExporter(),
    private docxExporter: TranscriptDocxExporter = new TranscriptDocxExporter(),
    private summarizer: IMeetingSummarizer = new MeetingSummaryLlmService(),
    private connector: HeadlessMeetingBotConnector = new HeadlessMeetingBotConnector()
  ) {}

  public async startAutonomousMeeting(
    config: AutonomousBotConfig & { headless?: boolean }
  ): Promise<string> {
    this.activeUtterances = [];
    this.isRunning = true;
    this.startTime = Date.now();

    const platform = HeadlessMeetingBotConnector.detectPlatform(config.meetingUrl);
    const sessionId = `bot-session-${Date.now()}`;

    console.info(
      `[AutonomousBot] Uniéndose de forma autónoma a ${platform}: ${config.meetingUrl}`
    );
    console.info(`[AutonomousBot] Captura y diarización activa. Sin preguntas manuales requeridas.`);

    if (config.skipConnection) return sessionId;

    const savedConfig = config.settings ?? this.readLegacySettings();

    const resolvedBotName = config.botDisplayName || savedConfig?.botDisplayName || "Algorithm Assistant Bot";

    await this.connector.connectToMeeting(
      {
        mode: "HEADLESS_BOT",
        meetingUrl: config.meetingUrl,
        platform,
        botDisplayName: resolvedBotName,
        autoRecord: savedConfig?.autoRecord ?? savedConfig?.botAutoRecord ?? true
      },
      (utterance) => {
        this.recordUtterance(utterance);
        config.onUtterance?.(utterance);
      },
      {
        headless: config.headless ?? false,
        profileDir: config.profileDir,
        chromePath: config.chromePath,
        onStatus: config.onStatus,
        onEnded: config.onEnded
      }
    );

    return sessionId;
  }

  private readLegacySettings(): any {
    const rootDir = process.cwd().endsWith("algorithm-manager-bot") ? path.dirname(process.cwd()) : process.cwd();
    try {
      const cfgPath = path.resolve(rootDir, ".bot-settings.json");
      if (fs.existsSync(cfgPath)) {
        return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      }
    } catch {}
    return null;
  }

  /** Cierra el navegador sin generar entregables (fallo al entrar o cancelación). */
  public async abort(): Promise<void> {
    this.isRunning = false;
    await this.connector.leaveMeeting("abort");
  }

  public recordUtterance(utterance: ExtractedUtterance): void {
    if (!this.isRunning) return;
    const withOffset: ExtractedUtterance =
      utterance.offsetSec !== undefined
        ? utterance
        : { ...utterance, offsetSec: Math.round((Date.now() - this.startTime) / 1000) };
    const last = this.activeUtterances[this.activeUtterances.length - 1];
    const previousText = last?.content.trim() ?? "";
    if (
      last &&
      previousText.length > 0 &&
      last.speakerName === withOffset.speakerName &&
      withOffset.content.trim().startsWith(previousText)
    ) {
      // Subtítulo parcial creciente: reemplaza, conservando el inicio del habla.
      this.activeUtterances[this.activeUtterances.length - 1] = {
        ...withOffset,
        offsetSec: last.offsetSec,
        timestamp: last.timestamp
      };
      return;
    }
    this.activeUtterances.push(withOffset);
  }

  public async finalizeAndGenerateDeliverables(
    sessionId: string,
    meetingUrl: string,
    outputDir: string = path.resolve(process.cwd(), "output")
  ): Promise<AutonomousMeetingRecord> {
    this.isRunning = false;
    await this.connector.leaveMeeting(sessionId);
    const endedAt = new Date().toISOString();
    const platform = HeadlessMeetingBotConnector.detectPlatform(meetingUrl);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Reconstruir transcripción con oradores
    const formattedTranscript = this.activeUtterances
      .map((u) => `[${u.timestamp}] ${u.speakerName}: ${u.content}`)
      .join("\n");

    const uniqueSpeakers = Array.from(new Set(this.activeUtterances.map((u) => u.speakerName)));

    // 2. Deducir/inferir tipo de reunión de forma 100% autónoma
    console.info(`[AutonomousBot] Infiriendo tipo de reunión automáticamente...`);
    const classification = await this.classifier.classify(
      formattedTranscript || "Reunión sin intervenciones de audio."
    );

    // 3. Generar documento Word (.docx) con la transcripción completa.
    // Los entregables opcionales nunca deben impedir que la transcripción llegue a la biblioteca.
    const docxFileName = `Transcripcion_${sessionId}.docx`;
    const docxPath = path.join(outputDir, docxFileName);
    try {
      await this.docxExporter.exportTranscript(
        `Reunión ${platform}`,
        this.activeUtterances.map((u) => ({
          speakerName: u.speakerName,
          timestamp: u.timestamp,
          content: u.content
        })),
        docxPath
      );
      console.info(`[AutonomousBot] Documento Word generado: ${docxPath}`);
    } catch (err) {
      console.warn("[AutonomousBot] No se pudo generar el documento Word:", err);
    }

    let issuesExcelPath: string | undefined;
    let proposalMarkdownPath: string | undefined;

    // 4. Generar entregables según inferencia
    if (classification.type === "COMMERCIAL_CLIENT") {
      console.info(`[AutonomousBot] Reunión detectada como CLIENTE / COMERCIAL. Generando propuesta comercial...`);
      try {
        const proposal = await this.proposalGen.generateProposal(
          formattedTranscript,
          classification
        );

        const mdFileName = `Propuesta_${proposal.id}.md`;
        const mdPath = path.join(outputDir, mdFileName);
        fs.writeFileSync(mdPath, proposal.markdownContent, "utf-8");
        proposalMarkdownPath = mdPath;
        console.info(`[AutonomousBot] Propuesta comercial generada: ${mdPath}`);
      } catch (err) {
        console.warn("[AutonomousBot] No se pudo generar la propuesta comercial:", err);
      }
    } else {
      console.info(`[AutonomousBot] Reunión detectada como INTERNA TÉCNICA. Generando matriz de issues en Excel...`);
      try {
        const sampleIssues: DevIssueExportData[] = [
          {
            id: "ISSUE-001",
            title: "Sincronización de eventos y transcripción en vivo",
            type: "feature",
            priority: "high",
            repo: "backend",
            component: "BotMeetingSync",
            estimation: { backendHours: 4, panelHours: 2, appHours: 0, totalHours: 6 },
            acceptanceCriteria: [
              "Capturar nombres de oradores en Google Meet y Teams",
              "Guardar segmentos en la base de datos en tiempo real",
              "Permitir descarga en Word y Excel"
            ],
            agentPrompt: "Implementar listeners de subtítulos en Meet y Teams para inserción en tiempo real."
          }
        ];

        const excelFileName = `Issues_${sessionId}.xlsx`;
        const excelPath = path.join(outputDir, excelFileName);
        await this.excelExporter.exportIssues(
          sampleIssues,
          `Reunión Interna ${platform}`,
          excelPath
        );
        issuesExcelPath = excelPath;
        console.info(`[AutonomousBot] Matriz de issues en Excel generada: ${issuesExcelPath}`);
      } catch (err) {
        console.warn("[AutonomousBot] No se pudo generar la matriz de issues en Excel:", err);
      }
    }

    // 5. Resumen estilo Fireflies (nunca bloquea los demás entregables)
    let summaryMarkdownPath: string | undefined;
    let summaryJsonPath: string | undefined;
    let summaryForDelivery: MeetingSummary | undefined;
    try {
      const summary = await this.summarizer.summarize({
        sessionId,
        utterances: this.activeUtterances.map((u) => ({
          speakerName: u.speakerName,
          text: u.content,
          offsetSec: u.offsetSec
        }))
      });
      summaryForDelivery = summary;
      const mdPath = path.join(outputDir, `Resumen_${sessionId}.md`);
      const jsonPath = path.join(outputDir, `Resumen_${sessionId}.json`);
      fs.writeFileSync(mdPath, renderSummaryMarkdown(summary, `Reunión ${platform}`), "utf-8");
      fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf-8");
      summaryMarkdownPath = mdPath;
      summaryJsonPath = jsonPath;
      console.info(`[AutonomousBot] Resumen generado: ${mdPath}
${renderConsoleExcerpt(summary)}`);
    } catch (err) {
      console.warn("[AutonomousBot] No se pudo generar el resumen; los demás entregables siguen disponibles:", err);
    }

    // 6. Archivo de entrega para la biblioteca de la app (nunca bloquea los demás entregables)
    let deliveryFilePath: string | undefined;
    const deliveryUtterances = this.activeUtterances
      .filter((u) => u.content.trim().length > 0)
      .map((u) => ({
        speakerName: u.speakerName.trim() || "Participante",
        text: u.content,
        offsetSec: u.offsetSec ?? 0
      }));
    if (summaryForDelivery && deliveryUtterances.length > 0) {
      try {
        deliveryFilePath = writeBotMeetingDelivery(outputDir, {
          schemaVersion: 1,
          sessionId,
          platform,
          meetingUrl,
          startedAt: new Date(this.startTime).toISOString(),
          endedAt,
          meetingType: classification.type,
          classificationReason: classification.reason,
          utterances: deliveryUtterances,
          summary: summaryForDelivery
        });
        console.info(`[AutonomousBot] Archivo de entrega para la biblioteca: ${deliveryFilePath}`);
      } catch (err) {
        console.warn("[AutonomousBot] No se pudo escribir el archivo de entrega; los demás entregables siguen disponibles:", err);
      }
    }

    return {
      sessionId,
      meetingUrl,
      platform,
      startedAt: new Date(this.startTime).toISOString(),
      endedAt,
      speakers: uniqueSpeakers,
      meetingType: classification.type,
      classificationReason: classification.reason,
      transcriptDocxPath: docxPath,
      issuesExcelPath,
      proposalMarkdownPath,
      summaryMarkdownPath,
      summaryJsonPath,
      deliveryFilePath,
      utterancesCount: this.activeUtterances.length
    };
  }

  public getActiveUtterances(): ExtractedUtterance[] {
    return [...this.activeUtterances];
  }
}
