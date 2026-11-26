import path from "node:path";
import { AutonomousMeetingBotService } from "../../algorithm-manager-bot/src/application/AutonomousMeetingBotService.js";
import { MeetingClassifierLlmService } from "../../algorithm-manager-bot/src/infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "../../algorithm-manager-bot/src/infrastructure/ai/CommercialProposalLlmService.js";
import { MeetingSummaryLlmService } from "../../algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryLlmService.js";
import { LlmClientFactory } from "../../algorithm-manager-bot/src/infrastructure/ai/LlmClientFactory.js";
import type { BotEngine, BotEngineStartInput } from "../../backend/src/desktop/bot/BotSessionService.js";
import type { ISecretVault } from "../../backend/src/desktop/infrastructure/settings/ISecretVault.js";

/** Crea el caller del LLM con las claves de la bóveda (Gemini primero, luego OpenAI) o las variables de entorno. */
async function createLlmCaller(vault: ISecretVault) {
  const gemini = await vault.get("gemini");
  if (gemini) return LlmClientFactory.createCaller({ provider: "gemini", apiKey: gemini });
  const openai = await vault.get("openai");
  if (openai) return LlmClientFactory.createCaller({ provider: "openai", apiKey: openai });
  return LlmClientFactory.createCaller();
}

export function createBotEngine(vault: ISecretVault): BotEngine {
  let service: AutonomousMeetingBotService | null = null;
  // Cada start() toma una época; abort() la invalida, así un start cancelado en vuelo
  // cierra lo suyo en vez de dejar un navegador huérfano dentro de la reunión.
  let epoch = 0;
  const CANCELLED = "La entrada del bot fue cancelada.";

  return {
    async start(input: BotEngineStartInput): Promise<string> {
      const myEpoch = ++epoch;
      const callLlm = await createLlmCaller(vault);
      if (myEpoch !== epoch) throw new Error(CANCELLED);

      const mine = new AutonomousMeetingBotService(
        new MeetingClassifierLlmService(callLlm),
        new CommercialProposalLlmService(callLlm),
        undefined,
        undefined,
        new MeetingSummaryLlmService(callLlm)
      );
      service = mine;
      const id = await mine.startAutonomousMeeting({
        meetingUrl: input.meetingUrl,
        headless: input.headless,
        settings: { botDisplayName: input.botDisplayName, autoRecord: input.autoRecord },
        profileDir: input.profileDir,
        chromePath: input.browserPath,
        onStatus: input.onStatus,
        onEnded: input.onEnded
      });
      if (myEpoch !== epoch) {
        await mine.abort().catch(() => {});
        throw new Error(CANCELLED);
      }
      return id;
    },

    async finalize(sessionId, meetingUrl, outputDir) {
      if (!service) throw new Error("No hay una sesión de bot activa.");
      const record = await service.finalizeAndGenerateDeliverables(sessionId, meetingUrl, path.resolve(outputDir));
      service = null;
      return { utterances: record.utterancesCount, deliveryFile: record.deliveryFilePath ?? null };
    },

    async abort() {
      epoch++;
      const current = service;
      service = null;
      await current?.abort();
    }
  };
}
