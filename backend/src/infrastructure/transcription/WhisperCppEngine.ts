import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import {
  ITranscriptionEngine,
  TranscriptionOptions,
  TranscriptionResult,
  RawTranscriptionSegment
} from "../../domain/services/ITranscriptionEngine.js";

export interface WhisperCppConfig {
  binaryPath: string;
  modelPath: string;
  threads: number;
  /** Modelo VAD (Silero). Si existe, whisper.cpp salta silencios y ruido: más rápido y sin alucinaciones. */
  vadModelPath?: string;
  /**
   * Usar la GPU (Vulkan) si el binario la soporta. Por defecto true: si el binario no tiene backend
   * de GPU, whisper.cpp usa la CPU por su cuenta. Con false se fuerza CPU (-ng).
   */
  useGpu?: boolean;
}

/** El binario arrancó pero terminó con error (p. ej. fallo del driver de la GPU). Distinto de "no se pudo ejecutar". */
class WhisperProcessError extends Error {}

/**
 * Anotaciones de sonido que Whisper inventa en pasajes sin voz: "(Ruido de la puerta)", "[Susurro]",
 * "[Música]", "[BLANK_AUDIO]"... No son habla, así que no deben llegar a la transcripción.
 */
const NON_SPEECH_ANNOTATION = /^[\[(][^\])]{0,80}[\])]$/;
/** Máximo de repeticiones consecutivas idénticas que se conservan (guarda contra bucles de alucinación). */
const MAX_CONSECUTIVE_REPEATS = 2;

export function cleanSegments(segments: RawTranscriptionSegment[]): RawTranscriptionSegment[] {
  const kept: RawTranscriptionSegment[] = [];
  let repeats = 0;
  let previous = "";
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text || NON_SPEECH_ANNOTATION.test(text)) continue;
    const normalized = text.toLowerCase();
    repeats = normalized === previous ? repeats + 1 : 1;
    previous = normalized;
    if (repeats > MAX_CONSECUTIVE_REPEATS) continue;
    kept.push(seg);
  }
  return kept;
}

export function buildWhisperArgs(
  config: WhisperCppConfig,
  wavPath: string,
  lang: string,
  outputBase: string
): string[] {
  const args = [
    "-m", config.modelPath,
    "-f", wavPath,
    "-l", lang,
    "-t", String(config.threads),
    // Sin contexto previo: evita que una alucinación se propague a todo el archivo (bucle de etiquetas)
    "-mc", "0",
    // No generar etiquetas de sonido ("(música)", "[ruido]")
    "-sns",
    "-pp",
    "-oj",
    "-of", outputBase
  ];
  if (config.vadModelPath) {
    args.push("--vad", "-vm", config.vadModelPath);
  }
  if (config.useGpu === false) {
    args.push("-ng");
  }
  return args;
}

export class WhisperCppEngine implements ITranscriptionEngine {
  constructor(private config: WhisperCppConfig) {}

  public async transcribe(
    wavPath: string,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const lang = options?.language || "es";
    const outputBase = wavPath.replace(/\.wav$/, "");
    const outputJsonPath = `${outputBase}.json`;

    try {
      await this.run(buildWhisperArgs(this.config, wavPath, lang, outputBase), options);
    } catch (err) {
      // Si la GPU falla a mitad de camino (driver, memoria de video), se reintenta una vez solo con CPU
      if (this.config.useGpu === false || !(err instanceof WhisperProcessError)) throw err;
      console.warn(`[WhisperCpp] Falló con GPU, reintentando con CPU: ${err.message.slice(0, 300)}`);
      await this.run(buildWhisperArgs({ ...this.config, useGpu: false }, wavPath, lang, outputBase), options);
    }

    try {
      const parsed = JSON.parse(await fs.readFile(outputJsonPath, "utf-8"));

      // `offsets` viene en milisegundos en la salida -oj de whisper.cpp
      const segments: RawTranscriptionSegment[] = (parsed.transcription || [])
        .map((seg: { offsets?: { from?: number; to?: number }; text?: string }) => ({
          startMs: Math.round(seg.offsets?.from ?? 0),
          endMs: Math.round(seg.offsets?.to ?? 0),
          text: (seg.text || "").trim(),
          speakerLabel: "Hablante 1"
        }))
        .filter((seg: RawTranscriptionSegment) => seg.text.length > 0 && seg.endMs > seg.startMs);

      return { language: parsed.result?.language || lang, segments: cleanSegments(segments) };
    } finally {
      await fs.unlink(outputJsonPath).catch(() => {});
    }
  }

  private run(args: string[], options?: TranscriptionOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const proc = spawn(this.config.binaryPath, args, { stdio: ["ignore", "ignore", "pipe"] });

      let stderr = "";
      let lastPercent = -1;
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderr = (stderr + text).slice(-2000);
        for (const match of text.matchAll(/progress =\s*(\d+)%/g)) {
          const percent = Number(match[1]);
          if (percent !== lastPercent) {
            lastPercent = percent;
            options?.onProgress?.(percent);
          }
        }
      });
      proc.on("error", (err) =>
        reject(new Error(`No se pudo ejecutar whisper.cpp en '${this.config.binaryPath}': ${err.message}`))
      );
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new WhisperProcessError(`whisper.cpp terminó con código ${code}: ${stderr}`));
      });
    });
  }
}
