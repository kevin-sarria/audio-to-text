// Dominio
export * from "./domain/models/MeetingTypes.js";
export * from "./domain/models/CommercialProposal.js";
export * from "./domain/services/IMeetingClassifier.js";
export * from "./domain/services/ICommercialProposalGenerator.js";

// Conectores de Infraestructura (Modo Dual: Bot Remoto vs Captura Local)
export * from "./infrastructure/connectors/HeadlessMeetingBotConnector.js";
export * from "./infrastructure/connectors/LocalAudioCaptureConnector.js";

// Servicios IA
export * from "./infrastructure/ai/MeetingClassifierLlmService.js";
export * from "./infrastructure/ai/CommercialProposalLlmService.js";

// Aplicación / Casos de Uso
export * from "./application/ProcessMeetingSessionUseCase.js";
