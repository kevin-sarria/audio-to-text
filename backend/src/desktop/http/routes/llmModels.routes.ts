import { Router, Request, Response, NextFunction } from "express";
import { DesktopRoutesDeps } from "../desktop.routes.js";

export function createLlmModelsRoutes(deps: DesktopRoutesDeps): Router {
  const router = Router();

  // POST /settings/llm-models (Descubrimiento dinámico de modelos de IA vía API pública)
  router.post("/settings/llm-models", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider, apiKey, baseUrl, purpose } = req.body || {};
      const targetProvider = String(provider || "google-account").trim();
      const isTranscription = String(purpose || "").trim().toLowerCase() === "transcription";

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
              { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Respuesta ultrarrápida - Recomendado)" },
              { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Equilibrado)" },
              { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Capacidad analítica)" },
              { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Razonamiento profundo)" },
              { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Open-Weights)" }
            ],
            defaultModel: "gemini-3.8-flash-low",
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

        const fallbackGemini = isTranscription
          ? [
              { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash (Recomendado - Multimodal y rápido)" },
              { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro (Máxima precisión para audios complejos)" },
              { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Baja latencia)" },
              { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
              { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Contexto masivo)" }
            ]
          : [
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
                    !String(m.name).includes("embedding") &&
                    (!isTranscription || String(m.name).startsWith("models/gemini"))
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

        const fallbackGroq = isTranscription
          ? [
              { id: "whisper-large-v3-turbo", name: "Whisper Large V3 Turbo (Recomendado - Ultrarrápido)" },
              { id: "whisper-large-v3", name: "Whisper Large V3 (Máxima precisión para audio)" },
              { id: "distil-whisper-large-v3-en", name: "Distil Whisper Large V3 (Optimizado en inglés)" }
            ]
          : [
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
              const filterCondition = (m: any) => {
                const id = String(m.id).toLowerCase();
                if (id.includes("embedding")) return false;
                if (isTranscription) {
                  return id.includes("whisper");
                }
                return !id.includes("whisper");
              };

              const modelsList = (groqData.data || [])
                .filter(filterCondition)
                .map((m: any) => {
                  const id = String(m.id);
                  let name = id;
                  if (id === "whisper-large-v3-turbo") name = "Whisper Large V3 Turbo (Recomendado)";
                  else if (id === "whisper-large-v3") name = "Whisper Large V3 (Precisión alta)";
                  return { id, name };
                });

              if (modelsList.length > 0) {
                res.json({
                  success: true,
                  data: {
                    provider: "groq",
                    models: modelsList,
                    defaultModel: isTranscription ? "whisper-large-v3-turbo" : "llama-3.3-70b-versatile",
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
            defaultModel: isTranscription ? "whisper-large-v3-turbo" : "llama-3.3-70b-versatile",
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

  return router;
}
