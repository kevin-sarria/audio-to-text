import fs from "node:fs";
import path from "node:path";
import {
  ITranscriptionEngine,
  TranscriptionOptions,
  TranscriptionResult
} from "../../../domain/services/ITranscriptionEngine.js";
import { WhisperCppEngine } from "../../../infrastructure/transcription/WhisperCppEngine.js";
import { SettingsStore } from "../settings/SettingsStore.js";
import { ISecretVault } from "../settings/ISecretVault.js";
import { ModelManager, AllowedModelName } from "../settings/ModelManager.js";
import { GroqEngine } from "./GroqEngine.js";
import { GeminiEngine } from "./GeminiEngine.js";

export interface ProviderRouterDeps {
  settingsStore: SettingsStore;
  secretVault: ISecretVault;
  modelManager: ModelManager;
  whisperBinaryPath: string;
}

export class ProviderEngineRouter implements ITranscriptionEngine {
  constructor(private deps: ProviderRouterDeps) {}

  public async transcribe(
    wavPath: string,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const settings = this.deps.settingsStore.getSettings();
    const engineType = settings.engine;

    if (engineType === "groq") {
      const apiKey = await this.deps.secretVault.get("groq");
      if (!apiKey) {
        throw new Error(
          "No se ha configurado la clave de API para Groq. Ve a Configuración y agrégala."
        );
      }
      const engine = new GroqEngine({
        apiKey,
        model: settings.groqModel || "whisper-large-v3-turbo"
      });
      return await engine.transcribe(wavPath, options);
    }

    if (engineType === "gemini") {
      const apiKey = await this.deps.secretVault.get("gemini");
      if (!apiKey) {
        throw new Error(
          "No se ha configurado la clave de API para Google Gemini. Ve a Configuración y agrégala."
        );
      }
      const engine = new GeminiEngine({
        apiKey,
        model: settings.geminiModel || "gemini-2.5-flash"
      });
      return await engine.transcribe(wavPath, options);
    }

    // Por defecto: whisper-local
    const modelName = (settings.whisperModel || "small") as AllowedModelName;
    const modelPath = this.deps.modelManager.getModelPath(modelName);

    if (!fs.existsSync(modelPath)) {
      throw new Error(
        `El modelo de Whisper local '${modelName}' no está instalado. Ve a Configuración y descárgalo antes de transcribir.`
      );
    }

    if (!fs.existsSync(this.deps.whisperBinaryPath)) {
      throw new Error(
        `El binario de whisper.cpp no se encuentra en: ${this.deps.whisperBinaryPath}. Verifica la instalación.`
      );
    }

    const localEngine = new WhisperCppEngine({
      binaryPath: this.deps.whisperBinaryPath,
      modelPath,
      threads: settings.whisperThreads || 4,
      vadModelPath: this.resolveVadModelPath(),
      useGpu: settings.useGpu
    });

    return await localEngine.transcribe(wavPath, options);
  }

  /** El modelo VAD (Silero) se empaqueta junto a whisper-cli. Sin él se transcribe igual, sin VAD. */
  private resolveVadModelPath(): string | undefined {
    const candidate = path.join(path.dirname(this.deps.whisperBinaryPath), "ggml-silero-v5.1.2.bin");
    return fs.existsSync(candidate) ? candidate : undefined;
  }
}
