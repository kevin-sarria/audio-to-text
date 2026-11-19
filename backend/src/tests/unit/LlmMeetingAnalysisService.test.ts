import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LlmMeetingAnalysisService } from "../../infrastructure/analysis/LlmMeetingAnalysisService.js";
import { InMemorySecretVault } from "../../desktop/infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../../desktop/infrastructure/settings/SettingsStore.js";

describe("LlmMeetingAnalysisService - Robustez de Proveedores y Escaneo", () => {
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

      // 1. Guardar proveedor en settings
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

      // 2. Guardar clave real en el vault
      await vault.set(customId, realKey);

      // 3. Probar resolución llamando con el ID del proveedor
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

      // El usuario tenía seleccionado gemini-2.5-pro en ajustes por defecto
      const resolved = await (service as any).resolveProviderAndKey({
        provider: customId,
        model: "gemini-2.5-pro"
      });

      // Debe descartar el modelo gemini-* y aplicar el modelo por defecto de DeepSeek
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

    it("permite proveedores locales (Ollama/LM Studio) sin clave de API obligatoria", async () => {
      const customId = "custom-ollama-local";
      await settingsStore.updateSettings({
        customProviders: [
          {
            id: customId,
            name: "Ollama Local",
            baseUrl: "http://localhost:11434/v1",
            defaultModel: "llama3.3"
          }
        ]
      });

      const resolved = await (service as any).resolveProviderAndKey({ provider: customId });
      expect(resolved.provider).toBe("custom");
      expect(resolved.baseUrl).toBe("http://localhost:11434/v1");
      expect(resolved.model).toBe("llama3.3");
    });
  });

  describe("Escaneo de Repositorio para Generar Contexto Técnico", () => {
    it("escanea archivos de manifiesto y documentación, e ignora estrictamente secretos y .env", async () => {
      const repoDir = path.join(tempDir, "mock-repo");
      await fsp.mkdir(repoDir, { recursive: true });

      // Crear archivos válidos
      await fsp.writeFile(
        path.join(repoDir, "package.json"),
        JSON.stringify({ name: "app-test", dependencies: { express: "^4.19.0", prisma: "^5.0.0" } }),
        "utf-8"
      );
      await fsp.writeFile(
        path.join(repoDir, "README.md"),
        "# Proyecto Test\nArquitectura limpia con microservicios.",
        "utf-8"
      );

      // Crear archivos sensibles que DEBEN ser ignorados
      await fsp.writeFile(
        path.join(repoDir, ".env"),
        "SECRET_DATABASE_PASSWORD=super_secret_never_leak_this\nAPI_KEY=12345",
        "utf-8"
      );
      await fsp.writeFile(
        path.join(repoDir, "id_rsa.key"),
        "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6...",
        "utf-8"
      );

      const summary = (service as any).scanRepositoryStructure(repoDir);

      // Debe incluir package.json y README.md
      expect(summary).toContain("package.json");
      expect(summary).toContain("README.md");
      expect(summary).toContain("Arquitectura limpia con microservicios");

      // JAMÁS debe incluir el contenido del .env o de llaves privadas
      expect(summary).not.toContain("super_secret_never_leak_this");
      expect(summary).not.toContain("BEGIN PRIVATE KEY");
    });
  });
});
