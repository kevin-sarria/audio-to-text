import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { DesktopRoutesDeps } from "../desktop.routes.js";
import { SettingsSchema } from "../../infrastructure/settings/SettingsStore.js";

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

export function createSettingsRoutes(deps: DesktopRoutesDeps): Router {
  const router = Router();

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

  // 3. PUT & POST /settings/keys/:provider
  const handleSaveKey = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = ProviderParamSchema.parse(req.params["provider"]);
      if (!isKnownProvider(provider, deps)) {
        res.status(400).json({
          success: false,
          error: {
            code: "INVALID_PROVIDER",
            message: `El proveedor '${provider}' no es soportado.`
          }
        });
        return;
      }

      const body = ApiKeyBodySchema.parse(req.body);
      await deps.secretVault.set(provider, body.apiKey);

      res.json({
        success: true,
        message: `Clave guardada de forma segura para '${provider}'.`,
        data: {
          hasKey: true,
          last4: body.apiKey.slice(-4)
        }
      });
    } catch (err) {
      next(err);
    }
  };

  router.put("/settings/keys/:provider", handleSaveKey);
  router.post("/settings/keys/:provider", handleSaveKey);

  // 4. DELETE /settings/keys/:provider
  router.delete(
    "/settings/keys/:provider",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = ProviderParamSchema.parse(req.params["provider"]);
        if (!isKnownProvider(provider, deps)) {
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_PROVIDER",
              message: `El proveedor '${provider}' no es soportado.`
            }
          });
          return;
        }

        await deps.secretVault.delete(provider);

        res.json({
          success: true,
          message: `Clave eliminada para '${provider}'.`
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // 5. POST /settings/keys/:provider/test
  router.post("/settings/keys/:provider/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const provider = ProviderParamSchema.parse(req.params["provider"]);
      let key = await deps.secretVault.get(provider);

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

  return router;
}
