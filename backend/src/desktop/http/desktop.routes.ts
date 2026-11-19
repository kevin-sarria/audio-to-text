import { Router, Request, Response, NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SettingsStore, SettingsSchema } from "../infrastructure/settings/SettingsStore.js";
import { ISecretVault } from "../infrastructure/settings/ISecretVault.js";
import { ModelManager, AllowedModelName } from "../infrastructure/settings/ModelManager.js";
import { ITokenService } from "../../domain/services/ITokenService.js";
import { createAuthenticateMiddleware } from "../../interfaces/http/middlewares/authenticate.js";

export interface DesktopRoutesDeps {
  settingsStore: SettingsStore;
  secretVault: ISecretVault;
  modelManager: ModelManager;
  tokenService: ITokenService;
  whisperBinaryPath: string;
  ffmpegBinaryPath?: string;
  resourcesDir: string;
}

const ProviderParamSchema = z.string().min(1).max(100);
const ApiKeyBodySchema = z.object({
  apiKey: z
    .string()
    .min(1, "La clave no puede estar vacía")
    .max(300, "La clave no puede exceder 300 caracteres")
    .regex(/^\S+$/, "La clave de API no puede contener espacios")
});

const BUILTIN_PROVIDERS = ["groq", "gemini", "openai"];

function isKnownProvider(provider: string, deps: DesktopRoutesDeps): boolean {
  if (BUILTIN_PROVIDERS.includes(provider)) return true;
  const settings = deps.settingsStore.getSettings();
  return (settings.customProviders || []).some((cp) => cp.id === provider);
}

const UpdateSettingsSchema = SettingsSchema.partial().strict();

export function createDesktopRoutes(deps: DesktopRoutesDeps): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(deps.tokenService);

  // Todas las rutas de escritorio requieren autenticación local mediante cookie accessToken
  router.use(authenticate);

  // 1. GET /settings
  router.get("/settings", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = deps.settingsStore.getSettings();
      const groqKey = await deps.secretVault.get("groq");
      const geminiKey = await deps.secretVault.get("gemini");
      const openaiKey = await deps.secretVault.get("openai");

      const customKeys: Record<string, { hasKey: boolean; last4: string }> = {};
      for (const cp of settings.customProviders || []) {
        const cKey = (await deps.secretVault.get(cp.id)) || cp.apiKey;
        customKeys[cp.id] = {
          hasKey: !!cKey,
          last4: cKey ? cKey.slice(-4) : ""
        };
      }

      res.json({
        success: true,
        data: {
          settings,
          keys: {
            groq: {
              hasKey: !!groqKey,
              last4: groqKey ? groqKey.slice(-4) : ""
            },
            gemini: {
              hasKey: !!geminiKey,
              last4: geminiKey ? geminiKey.slice(-4) : ""
            },
            openai: {
              hasKey: !!openaiKey,
              last4: openaiKey ? openaiKey.slice(-4) : ""
            },
            ...customKeys
          }
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. PUT /settings
  router.put("/settings", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateSettingsSchema.parse(req.body);
      const updated = await deps.settingsStore.updateSettings(parsed);

      res.json({
        success: true,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. PUT /settings/keys/:provider
  router.put("/settings/keys/:provider", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = ProviderParamSchema.parse(req.params["provider"]);
      if (!isKnownProvider(provider, deps)) {
        res.status(400).json({ success: false, error: `Proveedor desconocido: ${provider}` });
        return;
      }
      const { apiKey } = ApiKeyBodySchema.parse(req.body);

      await deps.secretVault.set(provider, apiKey);

      res.json({
        success: true,
        data: {
          provider,
          hasKey: true,
          last4: apiKey.slice(-4)
        }
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. DELETE /settings/keys/:provider
  router.delete("/settings/keys/:provider", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = ProviderParamSchema.parse(req.params["provider"]);
      if (!isKnownProvider(provider, deps)) {
        res.status(400).json({ success: false, error: `Proveedor desconocido: ${provider}` });
        return;
      }
      await deps.secretVault.delete(provider);

      res.json({
        success: true,
        message: `Clave de API para ${provider} eliminada.`
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. POST /settings/keys/:provider/test
  router.post("/settings/keys/:provider/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = ProviderParamSchema.parse(req.params["provider"]);
      let key = await deps.secretVault.get(provider);

      // Si no está en vault, revisar si está en customProviders
      const settings = deps.settingsStore.getSettings();
      const customP = settings.customProviders?.find((p) => p.id === provider);
      if (!key && customP?.apiKey) {
        key = customP.apiKey;
      }

      if (!key && provider !== "google-account") {
        res.status(400).json({
          success: false,
          error: `No hay clave guardada para ${provider}.`
        });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        if (provider === "groq") {
          const testRes = await fetch("https://api.groq.com/openai/v1/models", {
            method: "GET",
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (testRes.ok) {
            res.json({ success: true, ok: true, message: "Conexión con Groq exitosa." });
          } else {
            res.json({
              success: true,
              ok: false,
              message: `Groq rechazó la clave (HTTP ${testRes.status}).`
            });
          }
        } else if (provider === "gemini") {
          const testRes = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models",
            {
              method: "GET",
              headers: { "x-goog-api-key": key! },
              signal: controller.signal
            }
          );
          clearTimeout(timeout);

          if (testRes.ok) {
            res.json({ success: true, ok: true, message: "Conexión con Gemini exitosa." });
          } else {
            res.json({
              success: true,
              ok: false,
              message: `Gemini rechazó la clave (HTTP ${testRes.status}).`
            });
          }
        } else if (provider === "openai") {
          const testRes = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: { Authorization: `Bearer ${key}` },
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (testRes.ok) {
            res.json({ success: true, ok: true, message: "Conexión con OpenAI exitosa." });
          } else {
            res.json({
              success: true,
              ok: false,
              message: `OpenAI rechazó la clave (HTTP ${testRes.status}).`
            });
          }
        } else if (customP) {
          const url = customP.baseUrl.replace(/\/+$/, "") + "/models";
          const headers: Record<string, string> = {};
          if (key) {
            headers["Authorization"] = `Bearer ${key}`;
          }
          let testRes = await fetch(url, {
            method: "GET",
            headers,
            signal: controller.signal
          });
          if (testRes.status === 404 && !customP.baseUrl.endsWith("/v1")) {
            testRes = await fetch(`${customP.baseUrl.replace(/\/+$/, "")}/v1/models`, {
              method: "GET",
              headers,
              signal: controller.signal
            });
          }
          clearTimeout(timeout);

          if (testRes.ok) {
            res.json({ success: true, ok: true, message: `Conexión con ${customP.name} exitosa.` });
          } else {
            res.json({
              success: true,
              ok: false,
              message: `${customP.name} devolvió HTTP ${testRes.status}.`
            });
          }
        } else {
          clearTimeout(timeout);
          res.json({ success: true, ok: true, message: `Proveedor ${provider} configurado.` });
        }
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        res.json({
          success: true,
          ok: false,
          message: `Error al probar conexión: ${fetchErr.message}`
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // 5b. POST /settings/custom-providers/test (Proxy para probar conexión evitando problemas de CORS en navegador)
  router.post("/settings/custom-providers/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { baseUrl, apiKey, defaultModel } = req.body || {};
      if (!baseUrl || typeof baseUrl !== "string") {
        res.status(400).json({ success: false, error: "La URL base es requerida." });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const cleanBase = baseUrl.trim().replace(/\/+$/, "");
        const headers: Record<string, string> = {};
        if (apiKey && apiKey.trim()) {
          headers["Authorization"] = `Bearer ${apiKey.trim()}`;
        }

        // 1. Intentar endpoint /models
        let testRes = await fetch(`${cleanBase}/models`, {
          method: "GET",
          headers,
          signal: controller.signal
        });

        // Si da 404, intentar con /v1/models
        if (testRes.status === 404 && !cleanBase.endsWith("/v1")) {
          testRes = await fetch(`${cleanBase}/v1/models`, {
            method: "GET",
            headers,
            signal: controller.signal
          });
        }

        clearTimeout(timeout);

        if (testRes.ok) {
          res.json({
            success: true,
            ok: true,
            message: "¡Conexión exitosa con el proveedor de IA!"
          });
          return;
        }

        if (testRes.status === 401 || testRes.status === 403) {
          res.json({
            success: true,
            ok: false,
            message: `El proveedor rechazó la autenticación (HTTP ${testRes.status}). Verifica tu clave de API / Bearer token.`
          });
          return;
        }

        // Si /models no está implementado (404/405), probar un ping a /chat/completions
        if (testRes.status === 404 || testRes.status === 405) {
          const chatUrl = cleanBase.endsWith("/chat/completions")
            ? cleanBase
            : cleanBase.endsWith("/v1")
            ? `${cleanBase}/chat/completions`
            : `${cleanBase}/chat/completions`;

          const pingController = new AbortController();
          const pingTimeout = setTimeout(() => pingController.abort(), 8000);
          try {
            const pingRes = await fetch(chatUrl, {
              method: "POST",
              headers: {
                ...headers,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: defaultModel || "default",
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 1
              }),
              signal: pingController.signal
            });
            clearTimeout(pingTimeout);

            if (pingRes.ok || pingRes.status === 400) {
              res.json({
                success: true,
                ok: true,
                message: "¡Conexión exitosa con el proveedor de IA!"
              });
              return;
            } else if (pingRes.status === 401 || pingRes.status === 403) {
              res.json({
                success: true,
                ok: false,
                message: `El proveedor rechazó la autenticación (HTTP ${pingRes.status}). Verifica tu clave de API.`
              });
              return;
            }
          } catch (pingErr) {
            clearTimeout(pingTimeout);
          }
        }

        res.json({
          success: true,
          ok: false,
          message: `El servidor devolvió HTTP ${testRes.status}: ${testRes.statusText}`
        });
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        res.json({
          success: true,
          ok: false,
          message: `No se pudo conectar al host '${baseUrl}': ${fetchErr.message}`
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // 6. Modelos: GET /models
  router.get("/models", (_req: Request, res: Response) => {
    const list = deps.modelManager.listModels();
    res.json({ success: true, data: list });
  });

  // 7. POST /models/:name/download
  router.post("/models/:name/download", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const name = String(req.params["name"]);
      // Iniciar descarga asíncrona en segundo plano
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
          "../infrastructure/settings/recommendations.json"
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

      // Hay soporte de GPU si el binario trae el módulo Vulkan junto a whisper-cli
      const binDir = path.dirname(deps.whisperBinaryPath);
      const gpuBackendBundled = fs.existsSync(path.join(binDir, "ggml-vulkan.dll")) || fs.existsSync(path.join(binDir, "libggml-vulkan.so"));

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
