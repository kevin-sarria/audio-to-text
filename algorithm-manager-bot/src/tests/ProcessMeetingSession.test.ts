import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { MeetingClassifierLlmService } from "../infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "../infrastructure/ai/CommercialProposalLlmService.js";
import { ProcessMeetingSessionUseCase } from "../application/ProcessMeetingSessionUseCase.js";
import { HeadlessMeetingBotConnector } from "../infrastructure/connectors/HeadlessMeetingBotConnector.js";
import { LocalAudioCaptureConnector } from "../infrastructure/connectors/LocalAudioCaptureConnector.js";
import { PlatformSpeakerExtractor } from "../infrastructure/connectors/PlatformSpeakerExtractor.js";
import { AutonomousMeetingBotService } from "../application/AutonomousMeetingBotService.js";

describe("Algorithm Manager Bot - Dual Meeting Agent", () => {
  describe("Conectores Duales (Bot Remoto vs Captura Local)", () => {
    it("detecta adecuadamente la plataforma de la reunión según la URL", () => {
      expect(HeadlessMeetingBotConnector.detectPlatform("https://meet.google.com/abc-defg-hij")).toBe("GOOGLE_MEET");
      expect(HeadlessMeetingBotConnector.detectPlatform("https://teams.microsoft.com/l/meetup-join/19...")).toBe("MICROSOFT_TEAMS");
      expect(HeadlessMeetingBotConnector.detectPlatform("https://zoom.us/j/1234567890")).toBe("ZOOM");
      expect(HeadlessMeetingBotConnector.detectPlatform("custom-audio-feed")).toBe("LOCAL_DESKTOP");
    });

    it("inicia y detiene la captura local sin requerir navegador remoto", () => {
      const localConnector = new LocalAudioCaptureConnector();
      const session = localConnector.startLocalCapture();
      expect(session.status).toBe("RECORDING");
      expect(session.outputPath).toContain("local-capture-");

      const stopped = localConnector.stopLocalCapture(session);
      expect(stopped.success).toBe(true);
      expect(stopped.audioPath).toBe(session.outputPath);
    });

    it("simula la conexión de un bot headless con los flags de WebRTC apropiados", async () => {
      const headlessConnector = new HeadlessMeetingBotConnector();
      const joinResult = await headlessConnector.connectToMeeting({
        mode: "HEADLESS_BOT",
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        platform: "GOOGLE_MEET",
        botDisplayName: "Algorithm AI Assistant",
        autoRecord: true
      });

      expect(joinResult.status).toBe("CONNECTED_AND_RECORDING");
      expect(joinResult.platform).toBe("GOOGLE_MEET");
      expect(joinResult.sessionId).toBeDefined();

      const leaveResult = await headlessConnector.leaveMeeting(joinResult.sessionId);
      expect(leaveResult.success).toBe(true);
      expect(leaveResult.recordedAudioPath).toContain(joinResult.sessionId);
    });
  });

  describe("Clasificador de Reuniones (Interna vs Cliente/Comercial)", () => {
    it("clasifica como reunión de CLIENTE / COMERCIAL por heurística cuando hay palabras de propuesta y presupuesto", async () => {
      const classifier = new MeetingClassifierLlmService();
      const transcript = `
        Hola Andrés, gracias por recibirnos. Somos de Retail Express.
        Queremos ver la propuesta comercial para automatizar nuestro catálogo.
        ¿Cuál es el costo y presupuesto estimado? ¿Cuáles son sus tarifas de servicios?
      `;

      const result = await classifier.classify(transcript);
      expect(result.type).toBe("COMMERCIAL_CLIENT");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("clasifica como reunión INTERNA cuando se discuten sprints, branches y bugs", async () => {
      const classifier = new MeetingClassifierLlmService();
      const transcript = `
        Equipo, en la daily de hoy: el PR del backend ya está listo para merge.
        Tenemos que revisar el bug de autenticación antes del deploy al staging del sprint 42.
      `;

      const result = await classifier.classify(transcript);
      expect(result.type).toBe("INTERNAL");
    });
  });

  describe("Generador de Propuestas Comerciales", () => {
    it("genera una propuesta comercial estructurada con markdown formal para revisión", async () => {
      const proposalService = new CommercialProposalLlmService();
      const classification = {
        type: "COMMERCIAL_CLIENT" as const,
        confidence: 0.95,
        reason: "Reunión con prospecto interesado en IA",
        clientName: "Acme Corp",
        keyPainPoints: ["Demora en procesamiento de audios", "Pérdida de trazabilidad"],
        budgetMentioned: "15,000 USD",
        timelineMentioned: "6 semanas"
      };

      const transcript = "Necesitamos urgentemente automatizar el flujo de trabajo de Acme Corp.";
      const proposal = await proposalService.generateProposal(transcript, classification);

      expect(proposal.id).toBeDefined();
      expect(proposal.clientName).toBe("Acme Corp");
      expect(proposal.status).toBe("DRAFT_FOR_REVIEW");
      expect(proposal.markdownContent).toContain("# PROPUESTA COMERCIAL");
      expect(proposal.markdownContent).toContain("Acme Corp");
      expect(proposal.markdownContent).toContain("1. Resumen Ejecutivo");
      expect(proposal.markdownContent).toContain("6. Inversión y Términos Comerciales");
    });
  });

  describe("ProcessMeetingSessionUseCase (Orquestador Dual)", () => {
    it("procesa reunión de cliente y devuelve propuesta comercial lista para revisión", async () => {
      const classifier = new MeetingClassifierLlmService();
      const proposalService = new CommercialProposalLlmService();
      const useCase = new ProcessMeetingSessionUseCase(classifier, proposalService);

      const transcript = `
        Reunión con Banco del Futuro.
        Queremos cotización y presupuesto de sus servicios de inteligencia artificial.
        El plazo de entrega deseado es de 2 meses.
      `;

      const output = await useCase.execute({
        transcript,
        clientHint: "Banco del Futuro",
        mode: "HEADLESS_BOT"
      });

      expect(output.classification.type).toBe("COMMERCIAL_CLIENT");
      expect(output.commercialProposal).toBeDefined();
      expect(output.commercialProposal?.clientName).toBe("Banco del Futuro");
      expect(output.mode).toBe("HEADLESS_BOT");
    });

    it("procesa reunión interna y devuelve resumen técnico para derivación a issues", async () => {
      const classifier = new MeetingClassifierLlmService();
      const proposalService = new CommercialProposalLlmService();
      const useCase = new ProcessMeetingSessionUseCase(classifier, proposalService);

      const transcript = `
        Sprint Planning: vamos a refactorizar el módulo de auth y preparar el PR del backend.
      `;

      const output = await useCase.execute({
        transcript,
        mode: "LOCAL_CAPTURE"
      });

      expect(output.classification.type).toBe("INTERNAL");
      expect(output.commercialProposal).toBeUndefined();
      expect(output.summary).toBeDefined();
      expect(output.summary.sessionId).toBe(output.sessionId);
    });
  });

  describe("AutonomousMeetingBotService & Exportadores Autónomos", () => {
    it("extrae y sanitiza adecuadamente el nombre del orador en captions de Meet y Teams", () => {
      expect(PlatformSpeakerExtractor.sanitizeSpeakerName("Carlos Gómez (Invitado)")).toBe("Carlos Gómez");
      expect(PlatformSpeakerExtractor.sanitizeSpeakerName("Ana Torres (Tú)")).toBe("Ana Torres");

      const parsed = PlatformSpeakerExtractor.parseMeetCaption("Juan Pérez: Hola a todos");
      expect(parsed?.speakerName).toBe("Juan Pérez");
      expect(parsed?.content).toBe("Hola a todos");
    });

    it("ejecuta la sesión autónoma y genera entregables sin preguntar al usuario", async () => {
      const classifier = new MeetingClassifierLlmService();
      const proposalService = new CommercialProposalLlmService();
      const bot = new AutonomousMeetingBotService(classifier, proposalService);

      const sessionId = await bot.startAutonomousMeeting({
        meetingUrl: "https://meet.google.com/test-room",
        headless: true
      });

      bot.recordUtterance({
        speakerName: "David Tech Lead",
        content: "Equipo, en este sprint vamos a refactorizar el backend y cerrar los bugs de auth.",
        timestamp: "09:00:00",
        platform: "GOOGLE_MEET"
      });

      const tempOut = path.resolve(process.cwd(), "temp-test-output");
      const result = await bot.finalizeAndGenerateDeliverables(sessionId, "https://meet.google.com/test-room", tempOut);

      expect(result.meetingType).toBe("INTERNAL");
      expect(result.speakers).toContain("David Tech Lead");
      expect(result.transcriptDocxPath).toContain(".docx");
      expect(result.issuesExcelPath).toContain(".xlsx");

      // Limpieza de carpeta temporal
      if (fs.existsSync(tempOut)) {
        fs.rmSync(tempOut, { recursive: true, force: true });
      }
    }, 15000);
  });
});
