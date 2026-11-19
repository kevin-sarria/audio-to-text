import { Router, Request, Response, NextFunction } from "express";
import { DesktopRoutesDeps } from "../desktop.routes.js";

export function createCustomProvidersRoutes(_deps: DesktopRoutesDeps): Router {
  const router = Router();

  // POST /settings/custom-providers/test (Proxy para probar conexión evitando problemas de CORS en navegador)
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
          } catch {
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

  return router;
}
