import { ITranscriptionEngine } from "../../domain/services/ITranscriptionEngine.js";
import { WhisperCppEngine } from "./WhisperCppEngine.js";
import { WhisperApiEngine } from "./WhisperApiEngine.js";
import { env } from "../config/env.js";

export function createTranscriptionEngine(): ITranscriptionEngine {
  if (env.TRANSCRIPTION_ENGINE === "whisper-api") {
    return new WhisperApiEngine(env.OPENAI_API_KEY);
  }

  return new WhisperCppEngine({
    binaryPath: env.WHISPER_CPP_PATH,
    modelPath: env.WHISPER_MODEL_PATH,
    threads: env.WHISPER_THREADS,
    vadModelPath: env.WHISPER_VAD_MODEL_PATH,
    useGpu: env.WHISPER_USE_GPU === "true"
  });
}
