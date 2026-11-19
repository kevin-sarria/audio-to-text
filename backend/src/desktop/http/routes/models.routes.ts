import { Router, Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { DesktopRoutesDeps } from "../desktop.routes.js";
import { AllowedModelName } from "../../infrastructure/settings/ModelManager.js";

export function createModelsRoutes(deps: DesktopRoutesDeps): Router {
  const router = Router();

  // 6. Modelos: GET /models
  router.get("/models", (_req: Request, res: Response) => {
    const list = deps.modelManager.listModels();
    res.json({ success: true, data: list });
  });

  // 7. POST /models/:name/download
  router.post("/models/:name/download", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = String(req.params["name"]);
      deps.modelManager.downloadModel(name).catch((err) => {
        console.error(`Error en descarga en segundo plano de modelo '${name}':`, err);
      });

      res.status(202).json({
        success: true,
        message: `Descarga iniciada para el modelo '${name}'.`
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. POST /models/:name/cancel
  router.post("/models/:name/cancel", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = String(req.params["name"]);
      await deps.modelManager.cancelDownload(name);
      res.json({ success: true, message: `Descarga cancelada para '${name}'.` });
    } catch (err) {
      next(err);
    }
  });

  // 9. DELETE /models/:name
  router.delete("/models/:name", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = String(req.params["name"]);
      await deps.modelManager.deleteModel(name);
      res.json({ success: true, message: `Modelo '${name}' eliminado.` });
    } catch (err) {
      next(err);
    }
  });

  // 10. GET /models/progress
  router.get("/models/progress", (_req: Request, res: Response) => {
    const progress = deps.modelManager.getProgress();
    res.json({ success: true, data: progress });
  });

  // 11. GET /recommendations
  router.get("/recommendations", (_req: Request, res: Response, next: NextFunction) => {
    try {
      let recPath = path.join(deps.resourcesDir, "recommendations.json");
      if (!fs.existsSync(recPath)) {
        recPath = path.join(
          import.meta.dirname,
          "../../infrastructure/settings/recommendations.json"
        );
      }
      const raw = fs.readFileSync(recPath, "utf-8");
      res.json({ success: true, data: JSON.parse(raw) });
    } catch (err) {
      next(err);
    }
  });

  // 12. GET /status
  router.get("/status", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = deps.settingsStore.getSettings();
      const whisperBinary = fs.existsSync(deps.whisperBinaryPath);
      const ffmpegExists = deps.ffmpegBinaryPath ? fs.existsSync(deps.ffmpegBinaryPath) : true;
      const modelInstalled = fs.existsSync(
        deps.modelManager.getModelPath((settings.whisperModel || "small") as AllowedModelName)
      );

      const problems: string[] = [];

      if (!whisperBinary && settings.engine === "whisper-local") {
        problems.push(
          `Binario whisper.cpp no encontrado en '${deps.whisperBinaryPath}'.`
        );
      }
      if (!modelInstalled && settings.engine === "whisper-local") {
        problems.push(
          `El modelo local '${settings.whisperModel}' no está instalado. Descárgalo en Configuración.`
        );
      }
      if (settings.engine === "groq") {
        const hasGroqKey = await deps.secretVault.has("groq");
        if (!hasGroqKey) {
          problems.push("Falta configurar la clave de API de Groq en Configuración.");
        }
      }
      if (settings.engine === "gemini") {
        const hasGeminiKey = await deps.secretVault.has("gemini");
        if (!hasGeminiKey) {
          problems.push("Falta configurar la clave de API de Google Gemini en Configuración.");
        }
      }

      const binDir = path.dirname(deps.whisperBinaryPath);
      const gpuBackendBundled =
        fs.existsSync(path.join(binDir, "ggml-vulkan.dll")) ||
        fs.existsSync(path.join(binDir, "libggml-vulkan.so"));

      const readyToTranscribe = problems.length === 0;

      res.json({
        success: true,
        data: {
          whisperBinary,
          ffmpeg: ffmpegExists,
          activeEngine: settings.engine,
          gpuBackendBundled,
          useGpu: settings.useGpu,
          modelInstalled,
          readyToTranscribe,
          problems
        }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
