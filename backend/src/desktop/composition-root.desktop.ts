import path from "node:path";
import fs from "node:fs";
import { openSqliteDatabase } from "./infrastructure/sqlite/db.js";
import { SqliteUserRepository } from "./infrastructure/sqlite/SqliteUserRepository.js";
import { SqliteSessionRepository } from "./infrastructure/sqlite/SqliteSessionRepository.js";
import { SqliteSpeakerRepository } from "./infrastructure/sqlite/SqliteSpeakerRepository.js";
import { SqliteSegmentRepository } from "./infrastructure/sqlite/SqliteSegmentRepository.js";
import { SqliteTranslationRepository } from "./infrastructure/sqlite/SqliteTranslationRepository.js";
import { SqliteMeetingAnalysisRepository } from "./infrastructure/sqlite/SqliteMeetingAnalysisRepository.js";
import { SqliteProjectFolderRepository } from "./infrastructure/sqlite/SqliteProjectFolderRepository.js";
import { LocalStorageService } from "../infrastructure/storage/LocalStorageService.js";
import { InProcessJobQueue } from "./infrastructure/queue/InProcessJobQueue.js";
import { InProcessEventPublisher } from "./infrastructure/events/InProcessEventPublisher.js";
import { LocalTokenService } from "./infrastructure/security/LocalTokenService.js";
import { FfmpegAudioProcessor } from "../infrastructure/ffmpeg/FfmpegAudioProcessor.js";
import { SettingsStore } from "./infrastructure/settings/SettingsStore.js";
import { ISecretVault } from "./infrastructure/settings/ISecretVault.js";
import { ModelManager } from "./infrastructure/settings/ModelManager.js";
import { ProviderEngineRouter } from "./infrastructure/transcription/ProviderEngineRouter.js";
import { LlmMeetingAnalysisService } from "../infrastructure/analysis/LlmMeetingAnalysisService.js";
import { createExporterRegistry } from "../infrastructure/export/ExporterRegistry.js";
import { CreateTranscriptionSession } from "../application/use-cases/transcription/CreateTranscriptionSession.js";
import { GetSession } from "../application/use-cases/transcription/GetSession.js";
import { ListSessions } from "../application/use-cases/transcription/ListSessions.js";
import { RenameSpeaker } from "../application/use-cases/transcription/RenameSpeaker.js";
import { DeleteSession } from "../application/use-cases/transcription/DeleteSession.js";
import { CompleteSession } from "../application/use-cases/transcription/CompleteSession.js";
import { FailSession } from "../application/use-cases/transcription/FailSession.js";
import { ExportSession } from "../application/use-cases/export/ExportSession.js";
import { PurgeExpiredAudio } from "../application/use-cases/retention/PurgeExpiredAudio.js";
import { GenerateMeetingAnalysis } from "../application/use-cases/meetingAnalysis/GenerateMeetingAnalysis.js";
import { GetMeetingAnalysis } from "../application/use-cases/meetingAnalysis/GetMeetingAnalysis.js";
import { UpdateMeetingAnalysisTitle } from "../application/use-cases/meetingAnalysis/UpdateMeetingAnalysisTitle.js";
import { CreateProjectFolder } from "../application/use-cases/projectFolder/CreateProjectFolder.js";
import { ListProjectFolders } from "../application/use-cases/projectFolder/ListProjectFolders.js";
import { GetProjectFolder } from "../application/use-cases/projectFolder/GetProjectFolder.js";
import { UpdateProjectFolder } from "../application/use-cases/projectFolder/UpdateProjectFolder.js";
import { DeleteProjectFolder } from "../application/use-cases/projectFolder/DeleteProjectFolder.js";
import { LinkSessionToProjectFolder } from "../application/use-cases/transcription/LinkSessionToProjectFolder.js";
import { SessionController } from "../interfaces/http/controllers/SessionController.js";
import { ExportController } from "../interfaces/http/controllers/ExportController.js";
import { EventsController } from "../interfaces/http/controllers/EventsController.js";
import { MeetingAnalysisController } from "../interfaces/http/controllers/MeetingAnalysisController.js";
import { ProjectFolderController } from "../interfaces/http/controllers/ProjectFolderController.js";
import { ContextScanJobs } from "../application/services/ContextScanJobs.js";
import { setupDesktopPipeline, runStartupRecovery } from "./pipeline.js";
import { SqliteLibraryRepository } from "./infrastructure/sqlite/SqliteLibraryRepository.js";
import { ImportBotMeetings } from "./library/ImportBotMeetings.js";
import type { BotSessionDto, BotSessionState } from "@audio-to-text/shared";
import { resolveBotPaths } from "./bot/BotPaths.js";
import { BotSettingsStore } from "./bot/BotSettingsStore.js";
import { BotLoginService, type BotLoginDeps, type BotBrowserCloseResult } from "./bot/BotLoginService.js";
import { BotSessionService, type BotEngine } from "./bot/BotSessionService.js";

export interface CreateDesktopContainerOptions {
  userDataDir: string;
  resourcesDir: string;
  vault: ISecretVault;
  launchToken: string;
  botEngine: BotEngine;
  locateBrowser: (preferred: string) => string;
  browserDisplayName: (browserPath: string) => string;
  probeAccount: BotLoginDeps["probeAccount"];
  closeBotBrowser: () => Promise<BotBrowserCloseResult>;
  onBotEvent?: (session: BotSessionDto, previous: BotSessionState) => void;
}

export function createDesktopContainer(options: CreateDesktopContainerOptions) {
  const { userDataDir, resourcesDir, vault, launchToken } = options;

  // 1. Base de datos SQLite integrada (node:sqlite)
  const dbPath = path.join(userDataDir, "audio2text.db");
  const db = openSqliteDatabase({ dbPath });

  // 2. Repositorios SQLite
  const userRepository = new SqliteUserRepository(db);
  const sessionRepository = new SqliteSessionRepository(db);
  const speakerRepository = new SqliteSpeakerRepository(db);
  const segmentRepository = new SqliteSegmentRepository(db);
  const translationRepository = new SqliteTranslationRepository(db);
  const meetingAnalysisRepository = new SqliteMeetingAnalysisRepository(db);
  const projectFolderRepository = new SqliteProjectFolderRepository(db);

  // 3. Almacenamiento local de audios en userData
  const storageLocalPath = path.join(userDataDir, "audio");
  const storageService = new LocalStorageService(storageLocalPath);

  // 4. Servicios en proceso
  const jobQueue = new InProcessJobQueue();
  const eventPublisher = new InProcessEventPublisher();
  const tokenService = new LocalTokenService(launchToken);
  const audioProcessor = new FfmpegAudioProcessor();
  const settingsStore = new SettingsStore(userDataDir);
  const modelManager = new ModelManager(userDataDir);

  // Resolución de binario de whisper.cpp
  const isWin = process.platform === "win32";
  const whisperBinName = isWin ? "whisper-cli.exe" : "whisper-cli";
  let whisperBinaryPath = process.env.WHISPER_CPP_PATH || "";
  if (!whisperBinaryPath || !fs.existsSync(whisperBinaryPath)) {
    const candidatePath = path.join(resourcesDir, "bin", whisperBinName);
    if (fs.existsSync(candidatePath)) {
      whisperBinaryPath = candidatePath;
    }
  }

  // Motor de transcripción enrutador multi-proveedor
  const transcriptionEngine = new ProviderEngineRouter({
    settingsStore,
    secretVault: vault,
    modelManager,
    whisperBinaryPath
  });

  const exporterRegistry = createExporterRegistry();

  // 5. Casos de uso
  const currentSettings = settingsStore.getSettings();
  const createSession = new CreateTranscriptionSession(
    sessionRepository,
    storageService,
    jobQueue,
    currentSettings.retentionHours
  );
  const getSession = new GetSession(sessionRepository);
  const listSessions = new ListSessions(sessionRepository);
  const renameSpeaker = new RenameSpeaker(sessionRepository, speakerRepository);
  const deleteSession = new DeleteSession(sessionRepository, storageService);
  const completeSession = new CompleteSession(
    sessionRepository,
    speakerRepository,
    segmentRepository,
    eventPublisher
  );
  const failSession = new FailSession(sessionRepository, eventPublisher);
  const exportSession = new ExportSession(sessionRepository, exporterRegistry);
  const purgeExpiredAudio = new PurgeExpiredAudio(sessionRepository, storageService);
  const linkSessionToProjectFolder = new LinkSessionToProjectFolder(sessionRepository);

  const createProjectFolder = new CreateProjectFolder(projectFolderRepository);
  const listProjectFolders = new ListProjectFolders(projectFolderRepository);
  const getProjectFolder = new GetProjectFolder(projectFolderRepository);
  const updateProjectFolder = new UpdateProjectFolder(projectFolderRepository);
  const deleteProjectFolder = new DeleteProjectFolder(projectFolderRepository);

  const meetingAnalysisService = new LlmMeetingAnalysisService({ secretVault: vault, settingsStore });
  const generateMeetingAnalysis = new GenerateMeetingAnalysis(
    sessionRepository,
    meetingAnalysisRepository,
    meetingAnalysisService,
    projectFolderRepository
  );
  const getMeetingAnalysis = new GetMeetingAnalysis(sessionRepository, meetingAnalysisRepository);
  const updateMeetingAnalysisTitle = new UpdateMeetingAnalysisTitle(sessionRepository, meetingAnalysisRepository);

  // 6. Controladores HTTP
  const sessionController = new SessionController(
    createSession,
    getSession,
    listSessions,
    renameSpeaker,
    deleteSession,
    linkSessionToProjectFolder,
    sessionRepository,
    storageService,
    jobQueue
  );
  const exportController = new ExportController(exportSession);
  const eventsController = new EventsController(eventPublisher);
  const meetingAnalysisController = new MeetingAnalysisController(
    generateMeetingAnalysis,
    getMeetingAnalysis,
    updateMeetingAnalysisTitle
  );
  const contextScanJobs = new ContextScanJobs();
  const projectFolderController = new ProjectFolderController(
    createProjectFolder,
    listProjectFolders,
    getProjectFolder,
    updateProjectFolder,
    deleteProjectFolder,
    meetingAnalysisService,
    contextScanJobs
  );
  const libraryRepository = new SqliteLibraryRepository(db);
  const botPaths = resolveBotPaths(userDataDir);
  const botSettings = new BotSettingsStore(botPaths);
  const importBotMeetings = new ImportBotMeetings(db, () => botSettings.effectiveOutputDir());
  const botLogin = new BotLoginService({
    paths: botPaths,
    getPreferredBrowser: () => botSettings.get().botPreferredBrowser,
    locateBrowser: options.locateBrowser,
    displayName: options.browserDisplayName,
    probeAccount: options.probeAccount,
    closeBotBrowser: options.closeBotBrowser
  });
  const botSessions = new BotSessionService({
    engine: options.botEngine,
    getConfig: () => botSettings.get(),
    resolveBrowserPath: options.locateBrowser,
    profileDir: botPaths.profileDir,
    outputDir: () => botSettings.effectiveOutputDir(),
    importMeetings: () => importBotMeetings.execute(),
    onEvent: options.onBotEvent
  });

  // 7. Pipeline en proceso y handlers
  setupDesktopPipeline({
    jobQueue,
    sessionRepository,
    storageService,
    audioProcessor,
    transcriptionEngine,
    eventPublisher,
    completeSession,
    failSession,
    purgeExpiredAudio
  });

  // 8. Tarea recurrente de retención horaria
  jobQueue.scheduleRetentionJob().catch((err) => {
    console.error("[DesktopContainer] Error programando retención:", err);
  });

  // 9. Recovery al arrancar
  runStartupRecovery({
    sessionRepository,
    storageService,
    jobQueue,
    failSession
  }).catch((err) => {
    console.error("[DesktopContainer] Error en startup recovery:", err);
  });

  return {
    db,
    userRepository,
    sessionRepository,
    speakerRepository,
    segmentRepository,
    translationRepository,
    meetingAnalysisRepository,
    projectFolderRepository,
    storageService,
    jobQueue,
    eventPublisher,
    tokenService,
    audioProcessor,
    settingsStore,
    modelManager,
    transcriptionEngine,
    meetingAnalysisService,
    sessionController,
    exportController,
    eventsController,
    meetingAnalysisController,
    projectFolderController,
    libraryRepository,
    importBotMeetings,
    botSettings,
    botLogin,
    botSessions,
    whisperBinaryPath,
    resourcesDir,
    async close() {
      await botSessions.dispose();
      await jobQueue.close();
      try {
        db.close();
      } catch {}
    }
  };
}

export type DesktopContainer = ReturnType<typeof createDesktopContainer>;
