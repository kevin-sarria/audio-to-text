import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { InMemorySecretVault } from "../infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../infrastructure/settings/SettingsStore.js";
import { ModelManager } from "../infrastructure/settings/ModelManager.js";
import { LocalTokenService } from "../infrastructure/security/LocalTokenService.js";
import { createDesktopRoutes } from "../http/desktop.routes.js";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("SecretVault y rutas de claves", () => {
  let app: express.Express;
  let vault: InMemorySecretVault;
  const launchToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(async () => {
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vault-routes-test-"));
    vault = new InMemorySecretVault();
    const settingsStore = new SettingsStore(tempDir);
    const modelManager = new ModelManager(tempDir);
    const tokenService = new LocalTokenService(launchToken);

    app = express();
    app.use(express.json());
    app.use(cookieParser());

    const desktopRoutes = createDesktopRoutes({
      settingsStore,
      secretVault: vault,
      modelManager,
      tokenService,
      whisperBinaryPath: "/bin/whisper",
      resourcesDir: tempDir,
      importBotMeetings: {} as any,
      libraryRepository: {} as any
    });

    app.use("/api/desktop", desktopRoutes);
  });

  it("401 si no se envía la cookie accessToken", async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/desktop/settings`);
      expect(res.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("guarda clave y la respuesta jamás contiene la clave completa en texto plano", async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const fullKey = "gsk_test_api_key_valid_20_chars_min";
      const putRes = await fetch(`http://127.0.0.1:${port}/api/desktop/settings/keys/groq`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${launchToken}`
        },
        body: JSON.stringify({ apiKey: fullKey })
      });

      expect(putRes.status).toBe(200);
      const putJson = (await putRes.json()) as Record<string, any>;
      expect(putJson.success).toBe(true);
      expect(putJson.data.hasKey).toBe(true);
      expect(putJson.data.last4).toBe(fullKey.slice(-4));
      // Jamás eco de la clave
      expect(JSON.stringify(putJson)).not.toContain(fullKey);

      // Verificar en vault
      expect(await vault.get("groq")).toBe(fullKey);

      // GET /settings tampoco revela la clave
      const getRes = await fetch(`http://127.0.0.1:${port}/api/desktop/settings`, {
        headers: { Cookie: `accessToken=${launchToken}` }
      });
      const getJson = (await getRes.json()) as Record<string, any>;
      expect(getJson.data.keys.groq.hasKey).toBe(true);
      expect(getJson.data.keys.groq.last4).toBe(fullKey.slice(-4));
      expect(JSON.stringify(getJson)).not.toContain(fullKey);
    } finally {
      server.close();
    }
  });

  it("validación rechaza proveedor desconocido o clave con espacios", async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // Proveedor inválido
      const res1 = await fetch(`http://127.0.0.1:${port}/api/desktop/settings/keys/proveedor-falso`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${launchToken}`
        },
        body: JSON.stringify({ apiKey: "clave_valida_pero_proveedor_invalido" })
      });
      expect(res1.status).toBeGreaterThanOrEqual(400);

      // Clave con espacios
      const res2 = await fetch(`http://127.0.0.1:${port}/api/desktop/settings/keys/groq`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${launchToken}`
        },
        body: JSON.stringify({ apiKey: "clave con espacios no permitida" })
      });
      expect(res2.status).toBeGreaterThanOrEqual(400);
    } finally {
      server.close();
    }
  });

  it("POST /settings/llm-models devuelve la lista de modelos para google-account y proveedores cloud", async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // 1. google-account
      const resAgy = await fetch(`http://127.0.0.1:${port}/api/desktop/settings/llm-models`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${launchToken}`
        },
        body: JSON.stringify({ provider: "google-account" })
      });
      expect(resAgy.status).toBe(200);
      const jsonAgy = (await resAgy.json()) as any;
      expect(jsonAgy.success).toBe(true);
      expect(jsonAgy.data.provider).toBe("google-account");
      expect(jsonAgy.data.models.some((m: any) => m.id === "gemini-3.8-flash-low")).toBe(true);
      expect(jsonAgy.data.defaultModel).toBe("gemini-3.8-flash-low");

      // 2. gemini (sin clave previa devuelve fallback seguro)
      const resGemini = await fetch(`http://127.0.0.1:${port}/api/desktop/settings/llm-models`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${launchToken}`
        },
        body: JSON.stringify({ provider: "gemini" })
      });
      expect(resGemini.status).toBe(200);
      const jsonGemini = (await resGemini.json()) as any;
      expect(jsonGemini.data.models.some((m: any) => m.id === "gemini-3.8-flash")).toBe(true);
      expect(jsonGemini.data.defaultModel).toBe("gemini-3.8-flash");

      // 3. custom provider deepseek
      const resCustom = await fetch(`http://127.0.0.1:${port}/api/desktop/settings/llm-models`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `accessToken=${launchToken}`
        },
        body: JSON.stringify({
          provider: "custom-deepseek",
          baseUrl: "https://api.deepseek.com"
        })
      });
      expect(resCustom.status).toBe(200);
      const jsonCustom = (await resCustom.json()) as any;
      expect(jsonCustom.data.models.some((m: any) => m.id === "deepseek-flash")).toBe(true);
      expect(jsonCustom.data.defaultModel).toBe("deepseek-flash");
    } finally {
      server.close();
    }
  });
});
