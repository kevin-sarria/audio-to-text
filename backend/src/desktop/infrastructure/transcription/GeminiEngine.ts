import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import ffmpeg from "fluent-ffmpeg";
import { z } from "zod";
import {
  ITranscriptionEngine,
  TranscriptionOptions,
  TranscriptionResult,
  RawTranscriptionSegment
} from "../../../domain/services/ITranscriptionEngine.js";

export interface GeminiEngineConfig {
  apiKey: string;
  model: string;
}

const GeminiSegmentSchema = z.object({
  speaker: z.string().default("Hablante 1"),
  start: z.string(),
  end: z.string(),
  text: z.string()
});

export function sanitizeGeminiModelName(rawModel?: string): string {
  if (!rawModel || !rawModel.trim()) return "gemini-3.5-flash-lite";
  let cleaned = rawModel.trim();
  const parenMatch = cleaned.match(/\((gemini-[a-zA-Z0-9.-]+)\)/i);
  if (parenMatch && parenMatch[1]) {
    cleaned = parenMatch[1];
  } else {
    cleaned = cleaned.replace(/^models\//i, "");
    const tokenMatch = cleaned.match(/(gemini-[a-zA-Z0-9.-]+)/i);
    if (tokenMatch && tokenMatch[1]) {
      cleaned = tokenMatch[1];
    } else {
      cleaned = cleaned.replace(/\s+/g, "");
    }
  }
  if (cleaned === "gemini-2.5-flash" || cleaned === "gemini-2.0-flash" || cleaned === "gemini-1.5-flash") {
    return "gemini-3.5-flash-lite";
  }
  return cleaned;
}

export function parseTimeToMs(str: string): number | null {
  if (!str) return null;
  const parts = str.trim().split(":").map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) return null;

  if (parts.length === 2) {
    return Math.round(((parts[0] ?? 0) * 60 + (parts[1] ?? 0)) * 1000);
  }
  if (parts.length === 3) {
    return Math.round(((parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) * 1000);
  }
  if (parts.length === 1) {
    return Math.round((parts[0] ?? 0) * 1000);
  }
  return null;
}

export function cleanJsonString(raw: string): string {
  let clean = raw.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*\n?/i, "");
    clean = clean.replace(/\n?\s*```\s*$/i, "");
  }
  const firstBracket = clean.indexOf("[");
  const lastBracket = clean.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
    clean = clean.slice(firstBracket, lastBracket + 1);
  }
  return clean;
}

export class GeminiEngine implements ITranscriptionEngine {
  constructor(private config: GeminiEngineConfig) {
    if (!config.apiKey) {
      throw new Error("Clave de API de Gemini no configurada.");
    }
    this.config.model = sanitizeGeminiModelName(this.config.model);
  }

  public async transcribe(
    wavPath: string,
    options?: TranscriptionOptions
  ): Promise<TranscriptionResult> {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "gemini-transcribe-"));
    const language = options?.language || "es";

    try {
      // 1. Convertir a MP3 mono 16kHz a 32kbps
      const mp3Path = path.join(tempDir, "audio.mp3");
      await new Promise<void>((resolve, reject) => {
        ffmpeg(wavPath)
          .noVideo()
          .audioChannels(1)
          .audioFrequency(16000)
          .audioBitrate("32k")
          .output(mp3Path)
          .on("end", () => resolve())
          .on("error", (err) => reject(new Error(`Error al comprimir audio para Gemini: ${err.message}`)))
          .run();
      });

      const stat = await fsp.stat(mp3Path);
      const chunks: { path: string; offsetSec: number }[] = [];

      // A 32kbps mono, 1 segundo ocupa ~4KB. 3 minutos (180s) son ~720KB.
      // Troceamos en tramos de 3 minutos para máxima rapidez, evitar timeouts
      // y actualizar progresivamente el avance en la interfaz.
      const CHUNK_DURATION_SEC = 180;
      if (stat.size > 750 * 1024) {
        const chunkPattern = path.join(tempDir, "chunk_%03d.mp3");
        await new Promise<void>((resolve, reject) => {
          ffmpeg(mp3Path)
            .outputOptions(["-f segment", `-segment_time ${CHUNK_DURATION_SEC}`, "-c copy"])
            .output(chunkPattern)
            .on("end", () => resolve())
            .on("error", (err) => reject(new Error(`Error al segmentar audio para Gemini: ${err.message}`)))
            .run();
        });

        const files = (await fsp.readdir(tempDir))
          .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
          .sort();

        files.forEach((f, idx) => {
          chunks.push({
            path: path.join(tempDir, f),
            offsetSec: idx * CHUNK_DURATION_SEC
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

      // Ordenar cronológicamente garantizando orden ascendente
      allSegments.sort((a, b) => a.startMs - b.startMs);

      return {
        language,
        segments: allSegments
      };
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async transcribeChunk(
    chunkPath: string,
    offsetSec: number,
    language: string
  ): Promise<RawTranscriptionSegment[]> {
    const fileBytes = await fsp.readFile(chunkPath);
    const size = fileBytes.length;

    let fileUri: string | null = null;
    let inlineData: { mimeType: string; data: string } | null = null;

    if (size < 18 * 1024 * 1024) {
      inlineData = {
        mimeType: "audio/mp3",
        data: fileBytes.toString("base64")
      };
    } else {
      // Usar Files API para fragmentos que superen 18MB
      fileUri = await this.uploadToFilesApi(chunkPath, "audio/mp3");
    }

    try {
      let model = sanitizeGeminiModelName(this.config.model);
      const isAsr = model.includes("transcribe");

      const prompt = isAsr
        ? `Transcribe literalmente el audio en idioma '${language}'. No resumas ni omitas palabras.`
        : `Transcribe literalmente el audio en idioma '${language}'.
No resumas ni omitas partes.
Identifica los diferentes participantes y clasifícalos como 'Hablante 1', 'Hablante 2', etc.
Devuelve un JSON estrictamente estructurado como un array de objetos con las propiedades:
- 'speaker': nombre del hablante (ej. 'Hablante 1')
- 'start': tiempo de inicio en formato 'mm:ss' (aproximado dentro de este tramo)
- 'end': tiempo de fin en formato 'mm:ss' (aproximado dentro de este tramo)
- 'text': transcripción literal de lo dicho`;

      const contentsPart: any[] = [];
      if (inlineData) {
        contentsPart.push({ inline_data: inlineData });
      } else if (fileUri) {
        contentsPart.push({ file_data: { mime_type: "audio/mp3", file_uri: fileUri } });
      }
      contentsPart.push({ text: prompt });

      const requestBody: any = {
        contents: [{ parts: contentsPart }],
        generationConfig: {
          temperature: 0.1
        }
      };
      if (!isAsr) {
        requestBody.generationConfig.responseMimeType = "application/json";
      }

      let response: Response | null = null;
      let lastErrText = "";

      for (let attempt = 1; attempt <= 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
          response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.config.apiKey
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
        } catch (fetchErr: any) {
          lastErrText = fetchErr.message;
        } finally {
          clearTimeout(timeout);
        }

        if (response && response.ok) {
          break;
        }

        if (response) {
          lastErrText = await response.text().catch(() => "");
          if (response.status === 404 && lastErrText.includes("no longer available")) {
            model = "gemini-3.5-flash-lite";
            continue;
          }
          if ((response.status === 503 || response.status === 429) && attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 2000));
            if (model === "gemini-3.8-flash" && attempt === 2) {
              model = "gemini-3.5-flash-lite";
            }
            continue;
          }
        }
      }

      if (!response || !response.ok) {
        let detailedMsg = response ? `Error HTTP ${response.status}` : "Error de conexión con Gemini";
        try {
          const errObj = JSON.parse(lastErrText);
          if (errObj?.error?.message) {
            detailedMsg = errObj.error.message;
          }
        } catch {
          detailedMsg = lastErrText.slice(0, 300) || detailedMsg;
        }
        throw new Error(`Gemini API falló: ${detailedMsg}`);
      }

      const json = (await response.json()) as any;
      const textResponse = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        return [];
      }

      if (isAsr) {
        const cleanText = textResponse.trim();
        if (!cleanText) return [];
        const rawSentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
        const sentences = rawSentences.map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        const total = sentences.length || 1;
        const chunkSpanMs = 180 * 1000;
        return sentences.map((sentence: string, idx: number) => ({
          startMs: offsetSec * 1000 + Math.round((idx / total) * chunkSpanMs),
          endMs: offsetSec * 1000 + Math.round(((idx + 1) / total) * chunkSpanMs),
          text: sentence,
          speakerLabel: "Hablante 1"
        }));
      }

      let parsed: unknown;
      try {
        const cleaned = cleanJsonString(textResponse);
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("Gemini no devolvió un JSON válido en la transcripción");
      }

      if (!Array.isArray(parsed)) {
        return [];
      }

      const segments: RawTranscriptionSegment[] = [];
      let lastEndMs = offsetSec * 1000;

      for (const item of parsed) {
        const valResult = GeminiSegmentSchema.safeParse(item);
        if (!valResult.success) continue;

        const { speaker, start, end, text } = valResult.data;
        if (!text.trim()) continue;

        let startMs = parseTimeToMs(start);
        let endMs = parseTimeToMs(end);

        if (startMs === null || endMs === null) continue;

        startMs += offsetSec * 1000;
        endMs += offsetSec * 1000;

        // Asegurar endMs > startMs
        if (endMs <= startMs) {
          endMs = startMs + 1000;
        }

        // Evitar que el inicio sea anterior al final anterior si el modelo desfasó tiempos
        if (startMs < lastEndMs) {
          startMs = lastEndMs;
        }
        if (endMs <= startMs) {
          endMs = startMs + 500;
        }

        lastEndMs = endMs;

        segments.push({
          startMs,
          endMs,
          text: text.trim(),
          speakerLabel: speaker || "Hablante 1"
        });
      }

      return segments;
    } finally {
      if (fileUri) {
        await this.deleteFromFilesApi(fileUri).catch(() => {});
      }
    }
  }

  private async uploadToFilesApi(filePath: string, mimeType: string): Promise<string> {
    const fileBytes = await fsp.readFile(filePath);
    const numBytes = fileBytes.length;

    const initRes = await fetch(
      "https://generativelanguage.googleapis.com/upload/v1beta/files",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.config.apiKey,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(numBytes),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ file: { display_name: "audio_transcription" } })
      }
    );

    if (!initRes.ok) {
      throw new Error(`Fallo iniciando subida a Gemini Files API: ${initRes.status}`);
    }

    const uploadUrl = initRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new Error("No se recibió x-goog-upload-url de Gemini");
    }

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(numBytes),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize"
      },
      body: fileBytes
    });

    if (!uploadRes.ok) {
      throw new Error(`Fallo subiendo archivo a Gemini Files API: ${uploadRes.status}`);
    }

    const data = (await uploadRes.json()) as any;
    return data.file.uri;
  }

  private async deleteFromFilesApi(fileUri: string): Promise<void> {
    const match = fileUri.match(/files\/([a-zA-Z0-9]+)/);
    if (!match || !match[1]) return;
    const name = match[1];

    await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${name}`, {
      method: "DELETE",
      headers: {
        "x-goog-api-key": this.config.apiKey
      }
    });
  }
}
