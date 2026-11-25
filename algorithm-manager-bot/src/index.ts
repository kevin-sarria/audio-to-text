// Dominio
export * from "./domain/models/MeetingTypes.js";
export * from "./domain/models/CommercialProposal.js";
export * from "./domain/services/IMeetingClassifier.js";
export * from "./domain/models/MeetingSummary.js";
export * from "./domain/services/IMeetingSummarizer.js";
export * from "./domain/services/ICommercialProposalGenerator.js";
export * from "./domain/services/SpeakingStatsCalculator.js";
export * from "./domain/timeFormat.js";

// Conectores de Infraestructura (Modo Dual: Bot Remoto vs Captura Local)
export * from "./infrastructure/connectors/HeadlessMeetingBotConnector.js";
export * from "./infrastructure/connectors/LocalAudioCaptureConnector.js";
export * from "./infrastructure/connectors/PlatformSpeakerExtractor.js";

// Exportadores de Documentos (Word y Excel)
export * from "./infrastructure/export/DevIssuesExcelExporter.js";
export * from "./infrastructure/export/TranscriptDocxExporter.js";
export * from "./infrastructure/export/MeetingSummaryMarkdownRenderer.js";

// Servicios IA
export * from "./infrastructure/ai/MeetingClassifierLlmService.js";
export * from "./infrastructure/ai/CommercialProposalLlmService.js";
export * from "./infrastructure/ai/LlmClientFactory.js";
export * from "./infrastructure/ai/MeetingSummaryLlmService.js";
export * from "./infrastructure/ai/MeetingSummaryValidator.js";

// Aplicación / Casos de Uso
export * from "./application/ProcessMeetingSessionUseCase.js";
export * from "./application/AutonomousMeetingBotService.js";
export * from "./application/transcriptParsing.js";
