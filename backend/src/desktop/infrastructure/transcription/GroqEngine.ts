import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import ffmpeg from "fluent-ffmpeg";
import {
  ITranscriptionEngine,
  TranscriptionOptions,
  TranscriptionResult,
  RawTranscriptionSegment
} from "../../../domain/services/ITranscriptionEngine.js";

export interface GroqEngineConfig {
  apiKey: string;
  model: string;
}

export function sanitizeGroqModelName(rawModel?: string): string {
  if (!rawModel || !rawModel.trim()) return "whisper-large-v3-turbo";
  let cleaned = rawModel.trim();
  const parenMatch = cleaned.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    return parenMatch[1].trim();
  }
  const tokenMatch = cleaned.match(/(whisper-[a-zA-Z0-9.-]+)/i);
  if (tokenMatch && tokenMatch[1]) {
    return tokenMatch[1];
  }
  return cleaned.replace(/\s+/g, "");
}

export class GroqEngine implements ITranscriptionEngine {
  constructor(private config: GroqEngineConfig) {
    if (!config.apiKey) {
      throw new Error("Clave de API de Groq no configurada.");
    }
    this.config.model = sanitizeGroqModelName(this.config.model);
  }

  public async transcribe(
    wavPath: string,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "groq-transcribe-"));
    const language = options?.language || "es";

    try {
      // 1. Convertir a MP3 mono 16kHz 32kbps
      const mp3Path = path.join(tempDir, "audio.mp3");
      await new Promise<void>((resolve, reject) => {
        ffmpeg(wavPath)
          .noVideo()
          .audioChannels(1)
          .audioFrequency(16000)
          .audioBitrate("32k")
          .output(mp3Path)
          .on("end", () => resolve())
          .on("error", (err) => reject(new Error(`Error al comprimir audio para Groq: ${err.message}`)))
          .run();
      });

      const stat = await fsp.stat(mp3Path);
      const chunks: { path: string; offsetSec: number }[] = [];

      if (stat.size > 24 * 1024 * 1024) {
        // Partir en trozos de 20 min (1200 seg)
        const chunkPattern = path.join(tempDir, "chunk_%03d.mp3");
        await new Promise<void>((resolve, reject) => {
          ffmpeg(mp3Path)
            .outputOptions(["-f segment", "-segment_time 1200", "-c copy"])
            .output(chunkPattern)
            .on("end", () => resolve())
            .on("error", (err) => reject(new Error(`Error al segmentar audio para Groq: ${err.message}`)))
            .run();
        });

        const files = (await fsp.readdir(tempDir))
          .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
          .sort();

        files.forEach((f, idx) => {
          chunks.push({
            path: path.join(tempDir, f),
            offsetSec: idx * 1200
          });
        });
      } else {
        chunks.push({ path: mp3Path, offsetSec: 0 });
      }

      const allSegments: RawTranscriptionSegment[] = [];
      const totalChunks = chunks.length;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i]!;
        const chunkSegments = await this.transcribeChunk(chunk.path, chunk.offsetSec, language);
        allSegments.push(...chunkSegments);

        if (options?.onProgress) {
          const progress = Math.min(100, Math.round(((i + 1) / totalChunks) * 100));
          options.onProgress(progress);
        }
      }

      return {
        language,
        segments: allSegments
      };
    } finally {
      // Limpiar archivos temporales
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async transcribeChunk(
    chunkPath: string,
    offsetSec: number,
    language: string
  ): Promise<RawTranscriptionSegment[]> {
    const fileBytes = await fsp.readFile(chunkPath);
    const blob = new Blob([fileBytes], { type: "audio/mp3" });

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      const formData = new FormData();
      formData.append("file", blob, "audio.mp3");
      formData.append("model", sanitizeGroqModelName(this.config.model));
      formData.append("response_format", "verbose_json");
      formData.append("language", language);
      formData.append("timestamp_granularities[]", "segment");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      try {
        const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`
          },
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
          const json = (await response.json()) as any;
          const rawSegments = (json.segments || []) as Array<{
            start: number;
            end: number;
            text: string;
          }>;

          return rawSegments.map((seg) => ({
            startMs: Math.round((offsetSec + seg.start) * 1000),
            endMs: Math.round((offsetSec + seg.end) * 1000),
            text: seg.text.trim(),
            speakerLabel: "Hablante 1"
          }));
        }

        if (response.status === 429 || response.status >= 500) {
          const retryAfterSec = parseInt(response.headers.get("retry-after") || "2", 10) || 2;
          if (attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
            continue;
          }
        }

        const errText = await response.text().catch(() => "");
        throw new Error(
          `Groq API devolvió error ${response.status}: ${errText.slice(0, 200) || response.statusText}`
        );
      } catch (err: any) {
        clearTimeout(timeout);
        if (attempts >= maxAttempts) {
          throw new Error(`Error en llamada a Groq: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 2000 * attempts));
      }
    }

    return [];
  }
}
