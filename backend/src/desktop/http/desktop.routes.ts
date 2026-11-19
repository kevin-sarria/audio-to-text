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
          let detail = "";
          try {
            const errJson = (await testRes.json()) as any;
            detail = errJson?.error?.message || errJson?.message || "";
          } catch {
            detail = await testRes.text().catch(() => "");
          }
          const suffix = detail ? `: "${detail}"` : ". Verifica que tu clave de API sea válida y esté activa.";
          res.json({
            success: true,
            ok: false,
            message: `El proveedor rechazó la autenticación (HTTP ${testRes.status})${suffix}`
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

  // 5c. POST /settings/llm-models (Descubrimiento dinámico de modelos de IA vía API pública)
  router.post("/settings/llm-models", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider, apiKey, baseUrl } = req.body || {};
      const targetProvider = String(provider || "google-account").trim();

      const settings = deps.settingsStore.getSettings();
      let key = typeof apiKey === "string" ? apiKey.trim() : "";
      if (!key && deps.secretVault) {
        key = (await deps.secretVault.get(targetProvider)) || "";
      }

      // 1. Google Account (Antigravity CLI)
      if (targetProvider === "google-account") {
        res.json({
          success: true,
          data: {
            provider: "google-account",
            models: [
              { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (Alta velocidad - Recomendado)" },
              { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Equilibrado)" },
              { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Económico)" },
              { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Capacidad analítica)" },
              { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Razonamiento profundo)" },
              { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Open-Weights)" }
            ],
            defaultModel: "gemini-3.8-flash-high",
            isLiveDiscovered: false
          }
        });
        return;
      }

      // 2. Google Gemini (AI Studio)
      if (targetProvider === "gemini") {
        if (!key) {
          key = (await deps.secretVault?.get("gemini")) || process.env["GEMINI_API_KEY"] || "";
        }

        const fallbackGemini = [
          { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Recomendado, rápido y gratuito)" },
          { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Razonamiento avanzado)" },
          { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
          { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Contexto masivo 2M)" },
          { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B (Ultra ligero)" }
        ];

        if (key) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
              { signal: controller.signal }
            );
            clearTimeout(timeout);

            if (geminiRes.ok) {
              const geminiData = (await geminiRes.json()) as any;
              const modelsList = (geminiData.models || [])
                .filter(
                  (m: any) =>
                    Array.isArray(m.supportedGenerationMethods) &&
                    m.supportedGenerationMethods.includes("generateContent") &&
                    !String(m.name).includes("embedding")
                )
                .map((m: any) => {
                  const cleanId = String(m.name).replace(/^models\//, "");
                  return {
                    id: cleanId,
                    name: m.displayName ? `${m.displayName} (${cleanId})` : cleanId,
                    description: m.description
                  };
                });
              if (modelsList.length > 0) {
                res.json({
                  success: true,
                  data: {
                    provider: "gemini",
                    models: modelsList,
                    defaultModel: "gemini-2.5-flash",
                    isLiveDiscovered: true
                  }
                });
                return;
              }
            }
          } catch {}
        }

        res.json({
          success: true,
          data: {
            provider: "gemini",
            models: fallbackGemini,
            defaultModel: "gemini-2.5-flash",
            isLiveDiscovered: false
          }
        });
        return;
      }

      // 3. Groq Cloud
      if (targetProvider === "groq") {
        if (!key) {
          key = (await deps.secretVault?.get("groq")) || process.env["GROQ_API_KEY"] || "";
        }

        const fallbackGroq = [
          { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile (Recomendado)" },
          { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant (Ultra veloz)" },
          { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B (32k ventana)" },
          { id: "gemma2-9b-it", name: "Gemma 2 9B IT" },
          { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill Llama 70B (Razonamiento)" }
        ];

        if (key) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const groqRes = await fetch("https://api.groq.com/openai/v1/models", {
              headers: { Authorization: `Bearer ${key}` },
              signal: controller.signal
            });
            clearTimeout(timeout);

            if (groqRes.ok) {
              const groqData = (await groqRes.json()) as any;
              const modelsList = (groqData.data || [])
                .filter(
                  (m: any) =>
                    !String(m.id).toLowerCase().includes("whisper") &&
                    !String(m.id).toLowerCase().includes("embedding")
                )
                .map((m: any) => ({
                  id: String(m.id),
                  name: String(m.id)
                }));
              if (modelsList.length > 0) {
                res.json({
                  success: true,
                  data: {
                    provider: "groq",
                    models: modelsList,
                    defaultModel: "llama-3.3-70b-versatile",
                    isLiveDiscovered: true
                  }
                });
                return;
              }
            }
          } catch {}
        }

        res.json({
          success: true,
          data: {
            provider: "groq",
            models: fallbackGroq,
            defaultModel: "llama-3.3-70b-versatile",
            isLiveDiscovered: false
          }
        });
        return;
      }

      // 4. OpenAI
      if (targetProvider === "openai") {
        if (!key) {
          key = (await deps.secretVault?.get("openai")) || process.env["OPENAI_API_KEY"] || "";
        }

        const fallbackOpenAi = [
          { id: "gpt-4o-mini", name: "GPT-4o Mini (Recomendado, ágil y económico)" },
          { id: "gpt-4o", name: "GPT-4o (Insignia multimodal)" },
          { id: "o1-mini", name: "o1-mini (Razonamiento STEM y código)" },
          { id: "o3-mini", name: "o3-mini (Razonamiento rápido)" },
          { id: "gpt-4-turbo", name: "GPT-4 Turbo" }
        ];

        if (key) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const oaiRes = await fetch("https://api.openai.com/v1/models", {
              headers: { Authorization: `Bearer ${key}` },
              signal: controller.signal
            });
            clearTimeout(timeout);

            if (oaiRes.ok) {
              const oaiData = (await oaiRes.json()) as any;
              const modelsList = (oaiData.data || [])
                .filter((m: any) => {
                  const id = String(m.id).toLowerCase();
                  return id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("chatgpt");
                })
                .map((m: any) => ({ id: String(m.id), name: String(m.id) }));
              if (modelsList.length > 0) {
                res.json({
                  success: true,
                  data: {
                    provider: "openai",
                    models: modelsList,
                    defaultModel: "gpt-4o-mini",
                    isLiveDiscovered: true
                  }
                });
                return;
              }
            }
          } catch {}
        }

        res.json({
          success: true,
          data: {
            provider: "openai",
            models: fallbackOpenAi,
            defaultModel: "gpt-4o-mini",
            isLiveDiscovered: false
          }
        });
        return;
      }

      // 5. Proveedores Personalizados (DeepSeek, Ollama, OpenRouter, etc.)
      const customConfig = settings.customProviders?.find(
        (p) => p.id === targetProvider || p.name.toLowerCase() === targetProvider.toLowerCase()
      );
      const effectiveBase = String(baseUrl || customConfig?.baseUrl || "").trim().replace(/\/+$/, "");
      const effectiveKey = key || customConfig?.apiKey || "";

      let fallbackModels = [
        { id: customConfig?.defaultModel || "default", name: customConfig?.defaultModel || "default" }
      ];

      if (effectiveBase.includes("deepseek") || customConfig?.name.toLowerCase().includes("deepseek")) {
        fallbackModels = [
          { id: "deepseek-flash", name: "DeepSeek-V4.1-Flash (Recomendado, 1M tokens, multimodal)" },
          { id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro (Razonamiento complejo)" },
          { id: "deepseek-chat", name: "DeepSeek-Chat" }
        ];
      } else if (effectiveBase.includes("openrouter.ai")) {
        fallbackModels = [
          { id: "deepseek/deepseek-chat", name: "DeepSeek Chat (OpenRouter)" },
          { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (OpenRouter)" },
          { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash (OpenRouter)" }
        ];
      }

      if (effectiveBase) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);
          const headers: Record<string, string> = {};
          if (effectiveKey) headers["Authorization"] = `Bearer ${effectiveKey}`;

          let testRes = await fetch(`${effectiveBase}/models`, { headers, signal: controller.signal });
          if (testRes.status === 404 && !effectiveBase.endsWith("/v1")) {
            testRes = await fetch(`${effectiveBase}/v1/models`, { headers, signal: controller.signal });
          }
          clearTimeout(timeout);

          if (testRes.ok) {
            const data = (await testRes.json()) as any;
            const rawList = Array.isArray(data) ? data : data.data || [];
            if (Array.isArray(rawList) && rawList.length > 0) {
              const modelsList = rawList.map((m: any) => ({
                id: m.id || m.name || String(m),
                name: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id || String(m),
                contextWindow: m.context_window
              }));
              res.json({
                success: true,
                data: {
                  provider: targetProvider,
                  models: modelsList,
                  defaultModel: customConfig?.defaultModel || modelsList[0]?.id || "default",
                  isLiveDiscovered: true
                }
              });
              return;
            }
          }
        } catch {}
      }

      res.json({
        success: true,
        data: {
          provider: targetProvider,
          models: fallbackModels,
          defaultModel: customConfig?.defaultModel || fallbackModels[0]?.id || "default",
          isLiveDiscovered: false
        }
      });
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
