import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export interface ModelInfo {
  name: string;
  installed: boolean;
  sizeBytes: number;
  filePath: string;
  isDownloading: boolean;
  progress?: {
    bytes: number;
    total: number;
    percent: number;
  };
}

export interface DownloadProgress {
  modelName: string;
  bytes: number;
  total: number;
  percent: number;
}

// Lista blanca (también evita path traversal en nombres). Los sufijos q5_x son versiones cuantizadas:
// pesan ~1/3, corren más rápido y pierden muy poca calidad.
export const ALLOWED_MODELS = [
  "base",
  "base-q5_1",
  "small",
  "small-q5_1",
  "large-v3-turbo-q5_0"
] as const;
export type AllowedModelName = (typeof ALLOWED_MODELS)[number];

const MODEL_APPROX_SIZES: Record<AllowedModelName, number> = {
  base: 147951465,
  "base-q5_1": 59707625,
  small: 487601967,
  "small-q5_1": 190085487,
  "large-v3-turbo-q5_0": 574041195
};

export class ModelManager {
  private modelsDir: string;
  private activeDownload: {
    modelName: AllowedModelName;
    abortController: AbortController;
    bytes: number;
    total: number;
    percent: number;
  } | null = null;

  constructor(userDataDir: string) {
    this.modelsDir = path.join(userDataDir, "models");
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  public isModelAllowed(name: string): name is AllowedModelName {
    return ALLOWED_MODELS.includes(name as any);
  }

  public getModelPath(name: AllowedModelName): string {
    return path.join(this.modelsDir, `ggml-${name}.bin`);
  }

  public listModels(): ModelInfo[] {
    return ALLOWED_MODELS.map((name) => {
      const filePath = this.getModelPath(name);
      const installed = fs.existsSync(filePath);
      let sizeBytes = 0;
      if (installed) {
        try {
          sizeBytes = fs.statSync(filePath).size;
        } catch {
          sizeBytes = MODEL_APPROX_SIZES[name];
        }
      } else {
        sizeBytes = MODEL_APPROX_SIZES[name];
      }

      const isDownloading = this.activeDownload?.modelName === name;
      return {
        name,
        installed,
        sizeBytes,
        filePath,
        isDownloading,
        progress: isDownloading
          ? {
              bytes: this.activeDownload!.bytes,
              total: this.activeDownload!.total,
              percent: this.activeDownload!.percent
            }
          : undefined
      };
    });
  }

  public getProgress(): DownloadProgress | null {
    if (!this.activeDownload) return null;
    return {
      modelName: this.activeDownload.modelName,
      bytes: this.activeDownload.bytes,
      total: this.activeDownload.total,
      percent: this.activeDownload.percent
    };
  }

  public async downloadModel(
    name: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    if (!this.isModelAllowed(name)) {
      throw new Error(`Modelo no permitido: ${name}. Opciones válidas: ${ALLOWED_MODELS.join(", ")}`);
    }

    if (this.activeDownload) {
      throw new Error(
        `Ya hay una descarga activa para el modelo '${this.activeDownload.modelName}'. Solo se permite una a la vez.`
      );
    }

    const destPath = this.getModelPath(name);
    const partPath = `${destPath}.part`;
    const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;

    const abortController = new AbortController();
    this.activeDownload = {
      modelName: name,
      abortController,
      bytes: 0,
      total: MODEL_APPROX_SIZES[name],
      percent: 0
    };

    let fileHandle: fsp.FileHandle | null = null;
    try {
      const response = await fetch(url, {
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(
          `Fallo al descargar modelo desde HuggingFace (${response.status} ${response.statusText})`
        );
      }

      const contentLengthHeader = response.headers.get("content-length");
      const totalBytes = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : MODEL_APPROX_SIZES[name];
      this.activeDownload.total = totalBytes;

      if (!response.body) {
        throw new Error("Respuesta de descarga sin cuerpo");
      }

      // Limpiar archivo .part previo si existía
      if (fs.existsSync(partPath)) {
        await fsp.unlink(partPath).catch(() => {});
      }

      fileHandle = await fsp.open(partPath, "w");
      let downloadedBytes = 0;

      // Lectura por chunks en streaming
      // response.body es un ReadableStream de Node (iterable asíncrono)
      for await (const chunk of response.body) {
        if (abortController.signal.aborted) {
          throw new Error("Descarga cancelada por el usuario");
        }
        await fileHandle.write(chunk);
        downloadedBytes += chunk.length;

        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        this.activeDownload.bytes = downloadedBytes;
        this.activeDownload.percent = percent;

        if (onProgress) {
          onProgress({
            modelName: name,
            bytes: downloadedBytes,
            total: totalBytes,
            percent
          });
        }
      }

      await fileHandle.close();
      fileHandle = null;

      // Validar longitud si Content-Length estaba presente
      if (contentLengthHeader && downloadedBytes !== totalBytes) {
        throw new Error(
          `Tamaño de archivo inconsistente: esperado ${totalBytes} bytes, descargado ${downloadedBytes} bytes`
        );
      }

      // Renombrar atómicamente .part -> destino final
      await fsp.rename(partPath, destPath);
    } catch (err: any) {
      if (fileHandle) {
        await fileHandle.close().catch(() => {});
      }
      // Limpiar archivo temporal al fallar o cancelarse
      if (fs.existsSync(partPath)) {
        await fsp.unlink(partPath).catch(() => {});
      }
      throw err;
    } finally {
      this.activeDownload = null;
    }
  }

  public async cancelDownload(name: string): Promise<void> {
    if (this.activeDownload && this.activeDownload.modelName === name) {
      this.activeDownload.abortController.abort();
      this.activeDownload = null;
    }
    const partPath = `${this.getModelPath(name as AllowedModelName)}.part`;
    if (fs.existsSync(partPath)) {
      await fsp.unlink(partPath).catch(() => {});
    }
  }

  public async deleteModel(name: string): Promise<void> {
    if (!this.isModelAllowed(name)) {
      throw new Error(`Modelo no permitido: ${name}`);
    }

    await this.cancelDownload(name);
    const destPath = this.getModelPath(name);
    if (fs.existsSync(destPath)) {
      await fsp.unlink(destPath);
    }
  }
}
