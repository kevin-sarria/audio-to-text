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

  describe("Manejo de Tiempos de Espera y Cancelaciones (AbortError)", () => {
    it("captura AbortError y lanza un mensaje explicativo y amigable en lugar del críptico 'This operation was aborted'", async () => {
      // Mock global fetch para simular un timeout/abort
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const error = new Error("This operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      try {
        await expect(
          (service as any).callOpenAi("system prompt", "user prompt", "dummy-api-key", "deepseek-flash", "https://api.deepseek.com")
        ).rejects.toThrow(/excedió el tiempo límite de espera/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("captura AbortError en Gemini y lanza un mensaje amigable contextualizado", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        const error = new Error("This operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      try {
        await expect(
          (service as any).callGemini("system prompt", "user prompt", "dummy-api-key", "gemini-2.5-flash")
        ).rejects.toThrow(/excedió el tiempo límite/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("Reglas de Generación de Issues (8 Bloques) y Verificación Aritmética", () => {
    it("parseAndValidateResponse recalcula matemáticamente los totales de horas por repositorio garantizando exactitud aritmética", () => {
      const mockRawJson = JSON.stringify({
        summary: "Resumen de la reunión de sincronización",
        alreadyResolved: ["Corrección del botón de login ya desplegada a staging."],
        inProgress: ["Cristian está ajustando el endpoint de usuarios."],
        keyDecisions: ["Usar .NET 8 y Clean Architecture en backend."],
        topicsDiscussed: ["Autenticación", "Modo offline en app móvil"],
        globalOpenQuestions: [
          "¿A qué se refiere 'pitas ambicientes' en el min 04:12? (Preguntar a Carlos)"
        ],
        issues: [
          {
            id: "BACKEND-1",
            repo: "backend",
            title: "[Backend] Endpoint /api/v1/sync",
            type: "feature",
            priority: "high",
            component: "API",
            description: "Crear endpoint de sincronización.",
            estimation: {
              backendHours: 5,
              panelHours: 0,
              appHours: 0,
              totalHours: 5,
              text: "Backend: 5h | Panel: 0h | App: 0h | Total: 5h"
            },
            openQuestions: ["Ninguna"],
            dependencies: ["Ninguna"],
            prWorkflow: "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan.",
            expectedFiles: ["Archivos sugeridos (verificar en el repo): backend/Controllers/SyncController.cs"],
            acceptanceCriteria: [
              "Responde HTTP 200 con payload válido",
              "[Supuesto] Soporta paginación por cursor"
            ],
            agentPrompt: "Rol y objetivo..."
          },
          {
            id: "APP-1",
            repo: "app",
            title: "[App Móvil] Cola de sincronización SQLite",
            type: "feature",
            priority: "high",
            component: "Sync Engine",
            description: "Soporte modo offline y sincronización diferida.",
            estimation: {
              backendHours: 0,
              panelHours: 0,
              appHours: 8,
              totalHours: 8,
              text: "Backend: 0h | Panel: 0h | App: 8h | Total: 8h"
            },
            openQuestions: ["¿Qué hacer si hay conflicto de versiones? (Preguntar a Juan)"],
            dependencies: ["Depende de BACKEND-1"],
            prWorkflow: "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan.",
            expectedFiles: ["Archivos sugeridos (verificar en el repo): app/services/syncQueue.ts"],
            acceptanceCriteria: [
              "Persiste en SQLite local si no hay red",
              "Soporta pantallas mínimas de 360x640",
              "[Supuesto] Reintentos con backoff exponencial"
            ],
            agentPrompt: "Rol y objetivo..."
          }
        ],
        backlog: ["Mejora de rendimiento en animaciones de la app para fase 2."],
        // Intencionalmente pasamos valores erróneos de la IA para probar la verificación aritmética automática
        repoHoursTotals: {
          backend: 999,
          panel: 999,
          app: 999,
          total: 9999
        }
      });

      const result = (service as any).parseAndValidateResponse(mockRawJson);

      // Verificación de campos obligatorios clasificados
      expect(result.alreadyResolved).toHaveLength(1);
      expect(result.alreadyResolved[0]).toContain("ya desplegada");
      expect(result.inProgress).toHaveLength(1);
      expect(result.inProgress[0]).toContain("Cristian está ajustando");
      expect(result.globalOpenQuestions).toHaveLength(1);
      expect(result.globalOpenQuestions[0]).toContain("pitas ambicientes");
      expect(result.backlog).toHaveLength(1);

      // Verificación de repositorio por issue (1 repo por issue)
      expect(result.issues[0].repo).toBe("backend");
      expect(result.issues[1].repo).toBe("app");
      expect(result.issues[1].dependencies).toContain("Depende de BACKEND-1");

      // Verificación aritmética estricta recalculada
      expect(result.repoHoursTotals.backend).toBe(5);
      expect(result.repoHoursTotals.panel).toBe(0);
      expect(result.repoHoursTotals.app).toBe(8);
      expect(result.repoHoursTotals.total).toBe(13); // 5 + 0 + 8
    });

    it("ejecuta el pipeline de 2 pasos encadenando Paso 1 (clasificación) y Paso 2 (issues)", async () => {
      const mockStep1 = JSON.stringify({
        summary: "Reunión de coordinación de arquitectura.",
        alreadyResolved: ["Fix del bug de tokens"],
        inProgress: ["Andrés con el diseño en Figma"],
        keyDecisions: ["Usar SQLite en desktop"],
        topicsDiscussed: ["Desktop", "Migraciones"],
        globalOpenQuestions: ["¿Cuándo entra la v2?"],
        newItems: [
          {
            id: "ITEM-1",
            title: "Nuevo módulo de exportación",
            repo: "backend",
            description: "Exportar a PDF"
          }
        ],
        backlog: ["Exportación a Excel en el futuro"]
      });

      const mockStep2 = JSON.stringify({
        issues: [
          {
            id: "BACKEND-1",
            repo: "backend",
            title: "[Backend] Exportación a PDF",
            type: "feature",
            priority: "medium",
            component: "Export",
            description: "Servicio de exportación",
            estimation: {
              backendHours: 3,
              panelHours: 0,
              appHours: 0,
              totalHours: 3,
              text: "Backend: 3h | Panel: 0h | App: 0h | Total: 3h"
            },
            openQuestions: ["Ninguna"],
            dependencies: ["Ninguna"],
            prWorkflow: "Rama corta desde dev, PR a dev",
            expectedFiles: ["Archivos sugeridos (verificar en el repo): backend/export.ts"],
            acceptanceCriteria: ["Genera PDF"],
            agentPrompt: "Prompt..."
          }
        ],
        repoHoursTotals: { backend: 3, panel: 0, app: 0, total: 3 }
      });

      const executeSpy = vi
        .spyOn(service as any, "executeLlmCall")
        .mockResolvedValueOnce(mockStep1) // Paso 1
        .mockResolvedValueOnce(mockStep2); // Paso 2

      const result = await service.generateAnalysis("Transcripción de prueba...", "Contexto de prueba...", {
        provider: "google-account"
      });

      expect(executeSpy).toHaveBeenCalledTimes(2);
      expect(result.alreadyResolved).toEqual(["Fix del bug de tokens"]);
      expect(result.inProgress).toEqual(["Andrés con el diseño en Figma"]);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.id).toBe("BACKEND-1");
      expect(result.repoHoursTotals?.backend).toBe(3);
      expect(result.repoHoursTotals?.total).toBe(3);
    });

    it("cleanJsonString extrae el JSON válidamente incluso si el modelo incluye texto conversacional antes y después del bloque", () => {
      const rawWithPreamble = `Claro que sí, a continuación presento el análisis estructurado solicitado:
\`\`\`json
{
  "summary": "Resumen válido",
  "alreadyResolved": [],
  "inProgress": [],
  "keyDecisions": [],
  "topicsDiscussed": [],
  "globalOpenQuestions": [],
  "issues": [],
  "backlog": [],
  "repoHoursTotals": { "backend": 0, "panel": 0, "app": 0, "total": 0 }
}
\`\`\`
Espero que esta información te sea de gran utilidad para el sprint.`;

      const cleaned = (service as any).cleanJsonString(rawWithPreamble);
      expect(cleaned.startsWith("{")).toBe(true);
      expect(cleaned.endsWith("}")).toBe(true);
      const parsed = (service as any).parseAndValidateResponse(rawWithPreamble);
      expect(parsed.summary).toBe("Resumen válido");
    });

    it("cleanJsonString no trunca el JSON cuando hay bloques de código markdown embebidos en descripciones de issues", () => {
      const rawWithEmbeddedCodeBlocks = `\`\`\`json
{
  "summary": "Reunión técnica",
  "alreadyResolved": [],
  "inProgress": [],
  "keyDecisions": [],
  "topicsDiscussed": [],
  "globalOpenQuestions": [],
  "issues": [
    {
      "id": "BACKEND-1",
      "repo": "backend",
      "title": "[Backend] Ejecutar tests de dotnet",
      "type": "feature",
      "priority": "high",
      "component": "API",
      "description": "Debes ejecutar el comando:\\n\`\`\`bash\\ndotnet test --filter FullyQualifiedName\\n\`\`\`\\npara verificar la integración.",
      "estimation": {
        "backendHours": 4,
        "panelHours": 0,
        "appHours": 0,
        "totalHours": 4,
        "text": "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
      },
      "openQuestions": ["Ninguna"],
      "dependencies": ["Ninguna"],
      "prWorkflow": "Rama corta desde dev",
      "expectedFiles": ["backend/test.cs"],
      "acceptanceCriteria": ["Pasan los tests"],
      "agentPrompt": "Ejecuta los tests"
    }
  ],
  "backlog": [],
  "repoHoursTotals": { "backend": 4, "panel": 0, "app": 0, "total": 4 }
}
\`\`\``;

      const cleaned = (service as any).cleanJsonString(rawWithEmbeddedCodeBlocks);
      expect(cleaned).toContain("dotnet test");
      expect(cleaned).toContain('"repoHoursTotals"');
      const parsed = (service as any).parseAndValidateResponse(rawWithEmbeddedCodeBlocks);
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.issues[0]?.description).toContain("dotnet test");
    });

    it("normaliza sin fallar sinónimos y variaciones de enums como enhancement, bugfix, frontend o critical", () => {
      const rawWithSynonyms = JSON.stringify({
        summary: "Resumen con sinónimos de enums",
        alreadyResolved: [],
        inProgress: [],
        keyDecisions: [],
        topicsDiscussed: [],
        globalOpenQuestions: [],
        issues: [
          {
            id: "ISS-1",
            repo: "frontend", // debe normalizarse a panel
            title: "Mejora visual",
            type: "enhancement", // debe normalizarse a feature
            priority: "critical", // debe normalizarse a high
            component: "UI",
            description: "Mejora de interfaz",
            agentPrompt: "Implementar..."
          },
          {
            id: "ISS-2",
            repo: "mobile-app", // debe normalizarse a app
            title: "Corregir bug de sincronización",
            type: "bugfix", // debe normalizarse a bug
            priority: "urgente", // debe normalizarse a high
            component: "Sync",
            description: "Fix de sincronización",
            agentPrompt: "Corregir..."
          }
        ],
        backlog: [],
        repoHoursTotals: { backend: 0, panel: 2, app: 3, total: 5 }
      });

      const parsed = (service as any).parseAndValidateResponse(rawWithSynonyms);
      expect(parsed.issues).toHaveLength(2);
      expect(parsed.issues[0]?.repo).toBe("panel");
      expect(parsed.issues[0]?.type).toBe("feature");
      expect(parsed.issues[0]?.priority).toBe("high");
      expect(parsed.issues[1]?.repo).toBe("app");
      expect(parsed.issues[1]?.type).toBe("bug");
      expect(parsed.issues[1]?.priority).toBe("high");
    });

    it("los prompts del pipeline (Paso 1, Paso 2 y Fallback) incorporan explícitamente las secciones A-I, el glosario del proyecto y la autoverificación", () => {
      const step1Prompt = (service as any).buildStep1Prompt("Contexto DIAMANTE...");
      const step2Prompt = (service as any).buildStep2Prompt("Contexto DIAMANTE...");
      const singleStepPrompt = (service as any).buildSingleStepPrompt("Contexto DIAMANTE...");

      // Regla de oro y Glosario
      expect(step1Prompt).toContain("INSTRUCCIONES DE CALIDAD PARA GENERAR ISSUES DESDE UNA TRANSCRIPCIÓN");
      expect(step1Prompt).toContain("Sigue estas reglas al pie de la letra. Si una regla choca con tu criterio de \"ser útil\", gana la regla.");
      expect(step1Prompt).toContain("GLOSARIO DEL PROYECTO");
      expect(step1Prompt).toContain("valida de amante");
      expect(step1Prompt).toContain("armar el prón");
      expect(step1Prompt).toContain("aislamientos");

      // Sección A: Fuente de verdad
      expect(step1Prompt).toContain("## A. Fuente de verdad");
      expect(step1Prompt).toContain("PROPUESTO (por confirmar)");
      expect(step1Prompt).toContain("[Supuesto]");
      expect(step1Prompt).toContain("[mm:ss]");

      // Sección B: Ruido de la transcripción
      expect(step1Prompt).toContain("## B. Ruido de la transcripción");
      expect(step1Prompt).toContain("[Interpretación: lo transcrito → lo probable]");
      expect(step1Prompt).toContain("aislamientos");

      // Sección C: Clasificar antes de crear issues
      expect(step1Prompt).toContain("## C. Clasificar antes de crear issues");
      expect(step1Prompt).toContain("CERRADO");
      expect(step1Prompt).toContain("EN CURSO");
      expect(step1Prompt).toContain("NUEVO");
      expect(step1Prompt).toContain("BACKLOG");
      expect(step1Prompt).toContain("Si hay pendientes, no lo pongas como cerrado.");

      // Sección D: Preguntas abiertas (Paso 1 y Paso 2)
      expect(step1Prompt).toContain("## D. Preguntas abiertas");
      expect(step1Prompt).toContain("BLOQUEANTE o NO BLOQUEANTE");
      expect(step1Prompt).toContain("Máximo 8 preguntas globales");
      expect(step2Prompt).toContain("BLOQUEADO");

      // Sección E: Alcance y dependencias (Paso 2 y fallback)
      expect(step2Prompt).toContain("## E. Alcance y dependencias");
      expect(step2Prompt).toContain("Controllers/");
      expect(step2Prompt).toContain("Logic/");
      expect(step2Prompt).toContain("db_changes/");
      expect(step2Prompt).toContain("expo-router");
      expect(step2Prompt).toContain("Diamante.API");
      expect(step2Prompt).toContain("xUnit");
      expect(step2Prompt).toContain("Playwright");
      expect(step2Prompt).toContain("borrado masivo, exportación, reprogramación");
      expect(step2Prompt).toContain("/api/mobile/...");
      expect(step2Prompt).toContain("[Derivado de ISSUE-N]");

      // Sección F: Estimación y verificación aritmética
      expect(step2Prompt).toContain("## F. Estimación");
      expect(step2Prompt).toContain("Backend: Xh | Panel: Yh | App: Zh | Total: Th");
      expect(step2Prompt).toContain("revisión de Juan");

      // Sección G: Prompt de cada issue (para el agente de código)
      expect(step2Prompt).toContain("## G. Prompt de cada issue");
      expect(step2Prompt).toContain("Rol y Objetivo");
      expect(step2Prompt).toContain("docs/REGLAS_DE_NEGOCIO.md");
      expect(step2Prompt).toContain("Si esta parte no está resuelta en este issue, detente");

      // Sección H: Formato de salida
      expect(step1Prompt).toContain("## H. Formato de salida");
      expect(step2Prompt).toContain("## H. Formato de salida");
      expect(singleStepPrompt).toContain("## H. Formato de salida");

      // Sección I: Autoverificación antes de responder
      expect(step1Prompt).toContain("## I. Autoverificación antes de responder");
      expect(step1Prompt).toContain("¿Cada requerimiento tiene una marca de tiempo [mm:ss] que lo respalda?");
      expect(step2Prompt).toContain("## I. Autoverificación antes de responder");
      expect(step2Prompt).toContain("¿Los totales de horas coinciden con la suma issue por issue?");
      expect(singleStepPrompt).toContain("## I. Autoverificación antes de responder");
    });
  });
});
