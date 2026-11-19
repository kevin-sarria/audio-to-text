import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LlmMeetingAnalysisService } from "../../infrastructure/analysis/LlmMeetingAnalysisService.js";
import { InMemorySecretVault } from "../../desktop/infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../../desktop/infrastructure/settings/SettingsStore.js";

describe("LlmMeetingAnalysisService - Resolución de Proveedores y Modelos", () => {
  let tempDir: string;
  let vault: InMemorySecretVault;
  let settingsStore: SettingsStore;
  let service: LlmMeetingAnalysisService;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "llm-service-test-"));
    vault = new InMemorySecretVault();
    settingsStore = new SettingsStore(tempDir);
    service = new LlmMeetingAnalysisService({ secretVault: vault, settingsStore });
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("Resolución de Proveedores Personalizados", () => {
    it("recupera la clave real del almacén cifrado usando el ID específico del proveedor y NUNCA dummy-key", async () => {
      const customId = "custom-deepseek-5876";
      const realKey = "sk-deepseek-super-secret-valid-token-123456789";

      await settingsStore.updateSettings({
        customProviders: [
          {
            id: customId,
            name: "DeepSeek",
            baseUrl: "https://api.deepseek.com",
            defaultModel: "deepseek-flash"
          }
        ]
      });

      await vault.set(customId, realKey);

      const resolved = await (service as any).resolveProviderAndKey({
        provider: customId
      });

      expect(resolved.provider).toBe("custom");
      expect(resolved.apiKey).toBe(realKey);
      expect(resolved.apiKey).not.toContain("dummy-key");
      expect(resolved.model).toBe("deepseek-flash");
      expect(resolved.baseUrl).toBe("https://api.deepseek.com");
    });

    it("protege contra cruce de modelos incompatibles (ej. evita enviar gemini-2.5-pro a DeepSeek)", async () => {
      const customId = "custom-deepseek-9999";
      await settingsStore.updateSettings({
        customProviders: [
          {
            id: customId,
            name: "DeepSeek",
            baseUrl: "https://api.deepseek.com",
            defaultModel: "deepseek-flash"
          }
        ]
      });
      await vault.set(customId, "sk-deepseek-valid-key");

      const resolved = await (service as any).resolveProviderAndKey({
        provider: customId,
        model: "gemini-2.5-pro"
      });

      expect(resolved.model).toBe("deepseek-flash");
      expect(resolved.model).not.toBe("gemini-2.5-pro");
    });

    it("lanza un error descriptivo si el proveedor cloud no tiene clave configurada", async () => {
      const customId = "custom-deepseek-sin-key";
      await settingsStore.updateSettings({
        customProviders: [
          {
            id: customId,
            name: "DeepSeek Cloud",
            baseUrl: "https://api.deepseek.com",
            defaultModel: "deepseek-chat"
          }
        ]
      });

      await expect(
        (service as any).resolveProviderAndKey({ provider: customId })
      ).rejects.toThrow(/No se encontró clave de API para el proveedor 'DeepSeek Cloud'/);
    });

    it("permite proveedores locales (localhost o 127.0.0.1) como Ollama sin requerir API Key", async () => {
      const customId = "custom-ollama-local";
      await settingsStore.updateSettings({
        customProviders: [
          {
            id: customId,
            name: "Ollama Local",
            baseUrl: "http://127.0.0.1:11434/v1",
            defaultModel: "llama3"
          }
        ]
      });

      const resolved = await (service as any).resolveProviderAndKey({
        provider: customId
      });

      expect(resolved.provider).toBe("custom");
      expect(resolved.apiKey).toBe("");
      expect(resolved.model).toBe("llama3");
      expect(resolved.baseUrl).toBe("http://127.0.0.1:11434/v1");
    });

    it("resuelve google-account si Antigravity CLI está instalado en el sistema", async () => {
      vi.spyOn(service as any, "resolveAgyPath").mockReturnValue("C:\\Users\\Mock\\bin\\agy.exe");

      const resolved = await (service as any).resolveProviderAndKey({
        provider: "google-account",
        model: "gemini-3.8-flash-low"
      });

      expect(resolved.provider).toBe("google-account");
      expect(resolved.apiKey).toBe("");
      expect(resolved.model).toBe("gemini-3.8-flash-low");
    });

    it("falla con mensaje amigable si se elige google-account y no está agy en el sistema", async () => {
      vi.spyOn(service as any, "resolveAgyPath").mockReturnValue(null);

      await expect(
        (service as any).resolveProviderAndKey({ provider: "google-account" })
      ).rejects.toThrow(/No se encontró Antigravity CLI/);
    });
  });

  describe("Parseo de Issues y Verificación Estricta", () => {
    it("parsea y valida con éxito el JSON estructurado", async () => {
      const mockRawJson = JSON.stringify({
        summary: "Resumen de la reunión.",
        alreadyResolved: ["Despliegue previo en producción [01:10]"],
        inProgress: ["Cristian ajustando validaciones [05:20]"],
        keyDecisions: ["Usar .NET 8 en backend [03:00]"],
        topicsDiscussed: ["Backend", "Panel"],
        globalOpenQuestions: ["[BLOQUEANTE] Ambigüedad de corte [12:30]"],
        issues: [
          {
            id: "BACKEND-1",
            repo: "backend",
            title: "[Backend] Endpoint de marcas",
            type: "feature",
            priority: "high",
            component: "Controllers",
            description: "Crear endpoint según [04:15]",
            estimation: {
              backendHours: 5,
              panelHours: 0,
              appHours: 0,
              totalHours: 5,
              text: "Backend: 5h | Panel: 0h | App: 0h | Total: 5h"
            },
            openQuestions: ["Ninguna"],
            dependencies: ["Ninguna"],
            prWorkflow: "Rama corta desde dev, PR a dev, skill /revisar-entrega",
            expectedFiles: ["Controllers/ (verificar en el repo)", "AI_CONTEXT.md"],
            acceptanceCriteria: ["Responde 200 OK [04:15]"],
            agentPrompt: "### Rol y Objetivo\nActúa como dev\n\n### Contexto\nContexto [04:15]\n\n### Pasos numerados\n1. Leer AI_CONTEXT.md\n\n### Restricciones\nNinguna\n\n### Criterios de Aceptación\n- [ ] Responde 200\n\n### Verificación\nxUnit"
          },
          {
            id: "APP-1",
            repo: "app",
            title: "[App] Consumo de endpoint",
            type: "feature",
            priority: "medium",
            component: "UI",
            description: "Consumir backend [08:30]",
            estimation: {
              backendHours: 0,
              panelHours: 0,
              appHours: 8,
              totalHours: 8,
              text: "Backend: 0h | Panel: 0h | App: 8h | Total: 8h"
            },
            openQuestions: ["Ninguna"],
            dependencies: ["Depende de BACKEND-1"],
            prWorkflow: "Rama corta desde dev",
            expectedFiles: ["app/ (verificar en el repo)", "AI_CONTEXT.md"],
            acceptanceCriteria: ["Sincroniza marcas [08:30]"],
            agentPrompt: "### Rol y Objetivo\nActúa como dev\n\n### Contexto\nContexto [08:30]\n\n### Pasos numerados\n1. Leer AI_CONTEXT.md\n\n### Restricciones\nNinguna\n\n### Criterios de Aceptación\n- [ ] Sincroniza\n\n### Verificación\nJest"
          }
        ],
        backlog: ["Soporte de temas oscuros"],
        repoHoursTotals: {
          backend: 999,
          panel: 999,
          app: 999,
          total: 9999
        }
      });

      const result = (service as any).parseAndValidateResponse(mockRawJson);

      expect(result.alreadyResolved).toHaveLength(1);
      expect(result.alreadyResolved[0]).toContain("Despliegue previo");
      expect(result.inProgress).toHaveLength(1);
      expect(result.inProgress[0]).toContain("Cristian ajustando");
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].repo).toBe("backend");
      expect(result.issues[1].repo).toBe("app");
      expect(result.issues[1].dependencies).toContain("Depende de BACKEND-1");

      // Verificación aritmética estricta recalculada
      expect(result.repoHoursTotals.backend).toBe(5);
      expect(result.repoHoursTotals.panel).toBe(0);
      expect(result.repoHoursTotals.app).toBe(8);
      expect(result.repoHoursTotals.total).toBe(13);
    });
  });
});
