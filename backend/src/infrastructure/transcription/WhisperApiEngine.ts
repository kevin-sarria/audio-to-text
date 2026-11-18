import {
  ITranscriptionEngine,
  TranscriptionOptions,
  TranscriptionResult
} from "../../domain/services/ITranscriptionEngine.js";
import { NotImplementedError } from "../../domain/errors/NotImplementedError.js";

export class WhisperApiEngine implements ITranscriptionEngine {
  constructor(private apiKey?: string) {}

  public async transcribe(
    _wavPath: string,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new NotImplementedError("WhisperApiEngine (falta OPENAI_API_KEY)");
    }

    // Stub documentado para envío a OpenAI Whisper API
    return {
      language: options?.language || "es",
      segments: [
        {
          startMs: 0,
          endMs: 3000,
          text: "Transcripción generada por Whisper API stub.",
          speakerLabel: "Hablante 1",
          confidence: 0.99
        }
      ]
    };
  }
}
