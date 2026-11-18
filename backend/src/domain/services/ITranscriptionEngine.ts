export interface RawTranscriptionSegment {
  startMs: number;
  endMs: number;
  text: string;
  speakerLabel?: string;
  confidence?: number;
}

export interface TranscriptionResult {
  language: string;
  segments: RawTranscriptionSegment[];
}

export interface TranscriptionOptions {
  language?: string;
  /** Porcentaje 0-100 de avance; se invoca solo cuando el valor cambia. */
  onProgress?: (percent: number) => void;
}

export interface ITranscriptionEngine {
  transcribe(wavPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult>;
}
