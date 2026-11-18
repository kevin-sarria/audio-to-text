import { prisma } from "./infrastructure/db/prisma.js";
import { env } from "./infrastructure/config/env.js";

// Repositories
import { PrismaUserRepository } from "./infrastructure/repositories/PrismaUserRepository.js";
import { PrismaSessionRepository } from "./infrastructure/repositories/PrismaSessionRepository.js";
import { PrismaSpeakerRepository } from "./infrastructure/repositories/PrismaSpeakerRepository.js";
import { PrismaSegmentRepository } from "./infrastructure/repositories/PrismaSegmentRepository.js";
import { PrismaRefreshTokenRepository } from "./infrastructure/repositories/PrismaRefreshTokenRepository.js";
import { PrismaMeetingAnalysisRepository } from "./infrastructure/repositories/PrismaMeetingAnalysisRepository.js";

// Services & Infrastructure
import { LocalStorageService } from "./infrastructure/storage/LocalStorageService.js";
import { S3StorageService } from "./infrastructure/storage/S3StorageService.js";
import { BullMqJobQueue } from "./infrastructure/queue/BullMqJobQueue.js";
import { SseEventPublisher } from "./infrastructure/events/SseEventPublisher.js";
import { Argon2PasswordHasher } from "./infrastructure/security/Argon2PasswordHasher.js";
import { JwtTokenService } from "./infrastructure/security/JwtTokenService.js";
import { RecaptchaVerifier } from "./infrastructure/security/RecaptchaVerifier.js";
import { FfmpegAudioProcessor } from "./infrastructure/ffmpeg/FfmpegAudioProcessor.js";
import { createTranscriptionEngine } from "./infrastructure/transcription/engineFactory.js";
import { createExporterRegistry } from "./infrastructure/export/ExporterRegistry.js";
import { LlmMeetingAnalysisService } from "./infrastructure/analysis/LlmMeetingAnalysisService.js";

// Use cases
import { RegisterUser } from "./application/use-cases/auth/RegisterUser.js";
import { LoginUser } from "./application/use-cases/auth/LoginUser.js";
import { RefreshTokens } from "./application/use-cases/auth/RefreshTokens.js";
import { LogoutUser } from "./application/use-cases/auth/LogoutUser.js";
import { CreateTranscriptionSession } from "./application/use-cases/transcription/CreateTranscriptionSession.js";
import { GetSession } from "./application/use-cases/transcription/GetSession.js";
import { ListSessions } from "./application/use-cases/transcription/ListSessions.js";
import { RenameSpeaker } from "./application/use-cases/transcription/RenameSpeaker.js";
import { DeleteSession } from "./application/use-cases/transcription/DeleteSession.js";
import { CompleteSession } from "./application/use-cases/transcription/CompleteSession.js";
import { FailSession } from "./application/use-cases/transcription/FailSession.js";
import { ExportSession } from "./application/use-cases/export/ExportSession.js";
import { PurgeExpiredAudio } from "./application/use-cases/retention/PurgeExpiredAudio.js";
import { GenerateMeetingAnalysis } from "./application/use-cases/meetingAnalysis/GenerateMeetingAnalysis.js";
import { GetMeetingAnalysis } from "./application/use-cases/meetingAnalysis/GetMeetingAnalysis.js";

// Controllers
import { AuthController } from "./interfaces/http/controllers/AuthController.js";
import { SessionController } from "./interfaces/http/controllers/SessionController.js";
import { ExportController } from "./interfaces/http/controllers/ExportController.js";
import { EventsController } from "./interfaces/http/controllers/EventsController.js";
import { MeetingAnalysisController } from "./interfaces/http/controllers/MeetingAnalysisController.js";

// 1. Repositorios
const userRepository = new PrismaUserRepository(prisma);
const sessionRepository = new PrismaSessionRepository(prisma);
const speakerRepository = new PrismaSpeakerRepository(prisma);
const segmentRepository = new PrismaSegmentRepository(prisma);
const refreshTokenRepository = new PrismaRefreshTokenRepository(prisma);
const meetingAnalysisRepository = new PrismaMeetingAnalysisRepository(prisma);

// 2. Servicios
const storageService =
  env.STORAGE_DRIVER === "s3"
    ? new S3StorageService(env.S3_BUCKET_NAME || "", env.S3_REGION || "")
    : new LocalStorageService(env.STORAGE_LOCAL_PATH);

const jobQueue = new BullMqJobQueue();
const eventPublisher = new SseEventPublisher();
const passwordHasher = new Argon2PasswordHasher();

const tokenService = new JwtTokenService({
  accessSecret: env.JWT_ACCESS_SECRET,
  refreshSecret: env.JWT_REFRESH_SECRET,
  accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
  refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN
});

const captchaVerifier = new RecaptchaVerifier(
  env.RECAPTCHA_SECRET_KEY,
  env.RECAPTCHA_ENABLED,
  env.RECAPTCHA_MIN_SCORE
);

const audioProcessor = new FfmpegAudioProcessor();
const transcriptionEngine = createTranscriptionEngine();
const exporters = createExporterRegistry();
const meetingAnalysisService = new LlmMeetingAnalysisService();

// 3. Casos de Uso
const registerUser = new RegisterUser(
  userRepository,
  passwordHasher,
  tokenService,
  refreshTokenRepository,
  captchaVerifier
);

const loginUser = new LoginUser(
  userRepository,
  passwordHasher,
  tokenService,
  refreshTokenRepository,
  captchaVerifier
);

const refreshTokens = new RefreshTokens(
  userRepository,
  refreshTokenRepository,
  tokenService
);

const logoutUser = new LogoutUser(refreshTokenRepository, tokenService);

const createTranscriptionSession = new CreateTranscriptionSession(
  sessionRepository,
  storageService,
  jobQueue,
  env.AUDIO_RETENTION_HOURS
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

const exportSession = new ExportSession(sessionRepository, exporters);
const purgeExpiredAudio = new PurgeExpiredAudio(sessionRepository, storageService);

const generateMeetingAnalysis = new GenerateMeetingAnalysis(
  sessionRepository,
  meetingAnalysisRepository,
  meetingAnalysisService
);
const getMeetingAnalysis = new GetMeetingAnalysis(sessionRepository, meetingAnalysisRepository);

// 4. Controladores
const authController = new AuthController(
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  userRepository
);

const sessionController = new SessionController(
  createTranscriptionSession,
  getSession,
  listSessions,
  renameSpeaker,
  deleteSession
);

const exportController = new ExportController(exportSession);
const eventsController = new EventsController(eventPublisher);
const meetingAnalysisController = new MeetingAnalysisController(
  generateMeetingAnalysis,
  getMeetingAnalysis
);

export const compositionRoot = {
  // Instancias DB y Repo
  prisma,
  userRepository,
  sessionRepository,
  speakerRepository,
  segmentRepository,
  refreshTokenRepository,
  meetingAnalysisRepository,

  // Servicios
  storageService,
  jobQueue,
  eventPublisher,
  passwordHasher,
  tokenService,
  captchaVerifier,
  audioProcessor,
  transcriptionEngine,
  exporters,
  meetingAnalysisService,

  // Casos de uso
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  createTranscriptionSession,
  getSession,
  listSessions,
  renameSpeaker,
  deleteSession,
  completeSession,
  failSession,
  exportSession,
  purgeExpiredAudio,
  generateMeetingAnalysis,
  getMeetingAnalysis,

  // Controladores
  authController,
  sessionController,
  exportController,
  eventsController,
  meetingAnalysisController
};
