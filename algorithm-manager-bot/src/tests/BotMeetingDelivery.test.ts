import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { BotMeetingDeliverySchema } from "@audio-to-text/shared";
import { writeBotMeetingDelivery } from "../infrastructure/export/BotMeetingDeliveryWriter.js";
import { AutonomousMeetingBotService } from "../application/AutonomousMeetingBotService.js";
import { MeetingClassifierLlmService } from "../infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "../infrastructure/ai/CommercialProposalLlmService.js";
import { MeetingSummaryLlmService } from "../infrastructure/ai/MeetingSummaryLlmService.js";
import { stubConnector } from "./helpers/stubConnector.js";

const baseDelivery = {
  schemaVersion: 1 as const,
  sessionId: "bot-session-1",
  platform: "GOOGLE_MEET" as const,
  meetingUrl: "https://meet.google.com/test-room",
  startedAt: "2026-11-25T14:00:00.000Z",
  endedAt: "2026-11-25T14:10:00.000Z",
  meetingType: "INTERNAL" as const,
  classificationReason: "Sprint planning",
  utterances: [{ speakerName: "Ana", text: "Hola equipo.", offsetSec: 0 }],
  summary: {
    sessionId: "bot-session-1",
    generatedAt: "2026-11-25T14:11:00.000Z",
    language: "es",
    executiveSummary: "Resumen.",
    topics: [],
    decisions: [],
    actionItems: [],
    openQuestions: [],
    participants: [{ name: "Ana", speakingSeconds: 1, speakingPercent: 100 }],
    chapters: []
  }
};

describe("BotMeetingDeliveryWriter", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "bot-delivery-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("escribe reunion_<id>.json de forma atómica y válida contra el esquema compartido", () => {
    const dir = tmp();
    const file = writeBotMeetingDelivery(dir, baseDelivery);

    expect(file).toBe(path.join(dir, "reunion_bot-session-1.json"));
    expect(fs.readdirSync(dir)).toEqual(["reunion_bot-session-1.json"]); // sin .tmp residual
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(BotMeetingDeliverySchema.safeParse(parsed).success).toBe(true);
  });

  it("sanea el nombre de archivo pero conserva el sessionId real dentro del JSON", () => {
    const dir = tmp();
    const file = writeBotMeetingDelivery(dir, { ...baseDelivery, sessionId: "a/b:c" });
    expect(path.basename(file)).toBe("reunion_a_b_c.json");
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).sessionId).toBe("a/b:c");
  });

  it("el servicio del bot escribe el archivo de entrega junto a los demás entregables", async () => {
    stubConnector();
    const bot = new AutonomousMeetingBotService(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      undefined,
      undefined,
      new MeetingSummaryLlmService()
    );
    const sessionId = await bot.startAutonomousMeeting({ meetingUrl: "https://meet.google.com/test-room", headless: true });
    bot.recordUtterance({ speakerName: "David", content: "Vamos a cerrar los bugs de auth.", timestamp: "09:00:00", platform: "GOOGLE_MEET" });
    bot.recordUtterance({ speakerName: "Marta", content: "Yo reviso el PR del backend.", timestamp: "09:00:05", platform: "GOOGLE_MEET" });

    const dir = tmp();
    const record = await bot.finalizeAndGenerateDeliverables(sessionId, "https://meet.google.com/test-room", dir);

    expect(record.deliveryFilePath).toBe(path.join(dir, `reunion_${sessionId}.json`));
    const parsed = JSON.parse(fs.readFileSync(record.deliveryFilePath!, "utf-8"));
    expect(BotMeetingDeliverySchema.safeParse(parsed).success).toBe(true);
    expect(parsed.sessionId).toBe(sessionId);
    expect(parsed.utterances).toHaveLength(2);
    expect(typeof parsed.utterances[0].offsetSec).toBe("number");
    expect(parsed.summary.participants.map((p: { name: string }) => p.name).sort()).toEqual(["David", "Marta"]);
  }, 10000);

  it("descarta intervenciones sin texto y usa 'Participante' si el nombre queda vacío", async () => {
    stubConnector();
    const bot = new AutonomousMeetingBotService(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      undefined,
      undefined,
      new MeetingSummaryLlmService()
    );
    const sessionId = await bot.startAutonomousMeeting({ meetingUrl: "https://meet.google.com/test-room", headless: true });
    bot.recordUtterance({ speakerName: "David", content: "   ", timestamp: "09:00:00", platform: "GOOGLE_MEET" });
    bot.recordUtterance({ speakerName: "  ", content: "Hola a todos.", timestamp: "09:00:05", platform: "GOOGLE_MEET" });

    const dir = tmp();
    const record = await bot.finalizeAndGenerateDeliverables(sessionId, "https://meet.google.com/test-room", dir);

    const parsed = JSON.parse(fs.readFileSync(record.deliveryFilePath!, "utf-8"));
    expect(BotMeetingDeliverySchema.safeParse(parsed).success).toBe(true);
    expect(parsed.utterances).toHaveLength(1);
    expect(parsed.utterances[0]).toMatchObject({ speakerName: "Participante", text: "Hola a todos." });
  }, 10000);

  it("sin intervenciones no escribe archivo de entrega", async () => {
    stubConnector();
    const bot = new AutonomousMeetingBotService(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      undefined,
      undefined,
      new MeetingSummaryLlmService()
    );
    const sessionId = await bot.startAutonomousMeeting({ meetingUrl: "https://meet.google.com/test-room", headless: true });
    const dir = tmp();
    const record = await bot.finalizeAndGenerateDeliverables(sessionId, "https://meet.google.com/test-room", dir);
    expect(record.deliveryFilePath).toBeUndefined();
    expect(fs.readdirSync(dir).some((f) => f.startsWith("reunion_"))).toBe(false);
  }, 10000);
});
