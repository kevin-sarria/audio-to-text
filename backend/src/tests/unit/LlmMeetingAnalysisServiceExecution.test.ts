import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LlmMeetingAnalysisService } from "../../infrastructure/analysis/LlmMeetingAnalysisService.js";
import { InMemorySecretVault } from "../../desktop/infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../../desktop/infrastructure/settings/SettingsStore.js";
import { DIAMANTE_PROFILE } from "../../infrastructure/analysis/profiles/diamanteProfile.js";

describe("LlmMeetingAnalysisService - Ejecución de Pipeline y Prompts", () => {
  let tempDir: string;
  let vault: InMemorySecretVault;
  let settingsStore: SettingsStore;
  let service: LlmMeetingAnalysisService;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "llm-service-exec-test-"));
    vault = new InMemorySecretVault();
    settingsStore = new SettingsStore(tempDir);
    service = new LlmMeetingAnalysisService({ secretVault: vault, settingsStore });
  });

  afterEach(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("ejecuta el pipeline de 2 pasos encadenando Etapa 1 (extracción) y Etapa 2 (issues)", async () => {
    const mockStep1 = JSON.stringify({
      summary: "Reunión de coordinación de arquitectura.",
      puntos: [
        {
          id: "P1",
          cita: "Necesitamos exportar a PDF",
          timestamp: "04:20",
          clase: "nuevo",
          repo: "backend"
        }
      ],
      alreadyResolved: ["Fix del bug de tokens [01:00]"],
      inProgress: ["Andrés con el diseño en Figma [02:30]"],
      keyDecisions: ["Usar SQLite en desktop [03:15]"],
      topicsDiscussed: ["Desktop", "Migraciones"],
      globalOpenQuestions: ["¿Cuándo entra la v2?"],
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
          description: "Servicio de exportación según [04:20]",
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
          expectedFiles: ["Archivos sugeridos (verificar en el repo): backend/export.ts", "AI_CONTEXT.md"],
          acceptanceCriteria: ["Genera PDF [04:20]"],
          agentPrompt: "### Rol y Objetivo\nDev\n\n### Contexto\nContexto [04:20]\n\n### Pasos numerados\n1. Leer AI_CONTEXT.md\n\n### Restricciones\nNinguna\n\n### Criterios de Aceptación\n- [ ] Genera PDF\n\n### Verificación\nxUnit"
        }
      ],
      repoHoursTotals: { backend: 3, panel: 0, app: 0, total: 3 }
    });

    // La prueba no debe depender de que el CLI 'agy' esté instalado en la máquina.
    vi.spyOn(service as any, "resolveAgyPath").mockReturnValue("agy");
    const executeSpy = vi
      .spyOn(service as any, "executeLlmCall")
      .mockResolvedValueOnce(mockStep1)
      .mockResolvedValueOnce(mockStep2);

    const result = await service.generateAnalysis(
      "Transcripción de prueba en el minuto [04:20] acordamos exportar...",
      "Contexto de prueba...",
      {
        provider: "google-account"
      }
    );

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(result.alreadyResolved).toEqual(["Fix del bug de tokens [01:00]"]);
    expect(result.inProgress).toEqual(["Andrés con el diseño en Figma [02:30]"]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.id).toBe("BACKEND-1");
    expect(result.repoHoursTotals?.backend).toBe(3);
    expect(result.repoHoursTotals?.total).toBe(3);
  });

  it("cleanJsonString extrae el JSON válidamente incluso si el modelo incluye texto conversacional antes y después", () => {
    const rawWithPreamble = `A continuación el análisis estructurado:
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
Fin de respuesta.`;

    const cleaned = (service as any).cleanJsonString(rawWithPreamble);
    expect(cleaned.startsWith("{")).toBe(true);
    expect(cleaned.endsWith("}")).toBe(true);
    const parsed = (service as any).parseAndValidateResponse(rawWithPreamble);
    expect(parsed.summary).toBe("Resumen válido");
  });

  it("cleanJsonString no trunca el JSON cuando hay bloques de código markdown embebidos en descripciones", () => {
    const rawWithEmbeddedCode = `\`\`\`json
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
      "description": "Comando:\\n\`\`\`bash\\ndotnet test\\n\`\`\`",
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
      "expectedFiles": ["backend/test.cs", "AI_CONTEXT.md"],
      "acceptanceCriteria": ["Pasan los tests"],
      "agentPrompt": "### Rol y Objetivo\\nDev\\n\\n### Contexto\\nContexto\\n\\n### Pasos numerados\\n1. Leer AI_CONTEXT.md\\n\\n### Restricciones\\nNinguna\\n\\n### Criterios de Aceptación\\n- [ ] Ok\\n\\n### Verificación\\nxUnit"
    }
  ],
  "backlog": [],
  "repoHoursTotals": { "backend": 4, "panel": 0, "app": 0, "total": 4 }
}
\`\`\``;

    const parsed = (service as any).parseAndValidateResponse(rawWithEmbeddedCode);
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues[0]?.description).toContain("dotnet test");
  });

  it("los prompts del pipeline (etapa 1, etapa 2 y respaldo) se arman con Parte A + perfil + contexto de la carpeta", () => {
    const step1Prompt = (service as any).buildStep1Prompt("Contexto DIAMANTE...", DIAMANTE_PROFILE);
    const step2Prompt = (service as any).buildStep2Prompt("Contexto DIAMANTE...", DIAMANTE_PROFILE);
    const singleStepPrompt = (service as any).buildSingleStepPrompt("Contexto DIAMANTE...", DIAMANTE_PROFILE);

    for (const prompt of [step1Prompt, step2Prompt, singleStepPrompt]) {
      // Parte A: reglas generales A1–A15
      for (let n = 1; n <= 15; n++) expect(prompt).toContain(`== A${n}. `);
      // Parte B: perfil DIAMANTE (documentos, horas, glosario)
      expect(prompt).toContain("PERFIL DE PROYECTO: DIAMANTE");
      expect(prompt).toContain("== B6. TABLA DE REFERENCIA DE HORAS ==");
      expect(prompt).toContain("AI_CONTEXT.md");
      expect(prompt).toContain("BITACORA.md");
      expect(prompt).toContain('"Lexus" → "Alexis"');
      expect(prompt).toContain('"al EC" → "Excel"');
      // Orden de capas: A → B → contexto de la carpeta
      const a = prompt.indexOf("[PARTE A — REGLAS GENERALES]");
      const b = prompt.indexOf("[PARTE B — PERFIL DEL PROYECTO]");
      const c = prompt.indexOf("[CONTEXTO TÉCNICO DE LA CARPETA]");
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
      expect(prompt).toContain("Contexto DIAMANTE...");
    }
    expect(step2Prompt).toContain("ETAPA 2");
  });

  it("normaliza la extracción antes de la etapa 2 y reintenta si la etapa 2 no devuelve JSON válido", async () => {
    const transcript = [
      "[00:10] Hablante 1: Digámosle a Lady que nos traiga los activos y los pendientes.",
      "[00:30] Hablante 1: Se requiere exportar al Excel las solicitudes con filtros.",
      "[00:50] Hablante 2: Listo."
    ].join("\n");
    const step1 = JSON.stringify({
      summary: "Reunión corta.",
      puntos: [
        { id: "P1", cita: "Digámosle a Lady que nos traiga los activos y los pendientes", timestamp: "00:10", clase: "nuevo", accion: "codigo", repo: "backend" },
        { id: "P2", cita: "exportar al Excel las solicitudes con filtros", timestamp: "00:30", clase: "nuevo", accion: "codigo", repo: "backend" }
      ],
      alreadyResolved: [],
      inProgress: [],
      keyDecisions: [],
      globalOpenQuestions: [],
      backlog: []
    });
    const step2 = JSON.stringify({
      issues: [
        {
          id: "BACKEND-1",
          repo: "backend",
          title: "[Backend] Exportar al Excel las solicitudes",
          type: "feature",
          priority: "high",
          component: "Controllers / Logic",
          description: "Exportar al Excel las solicitudes con filtros [00:30].",
          estimation: { backendHours: 8, panelHours: 0, appHours: 0, totalHours: 8, text: "Backend: 8h | Panel: 0h | App: 0h | Total: 8h" },
          openQuestions: ["Ninguna"],
          dependencies: ["Ninguna"],
          prWorkflow: "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan.",
          expectedFiles: ["Controllers/ (verificar en el repo)", "docs/REGLAS_DE_NEGOCIO.md"],
          acceptanceCriteria: ["Exportar [00:30]"],
          agentPrompt: "### Rol y Objetivo\nActúa como Dev\n\n### Contexto\nContexto [00:30]\n\n### Pasos numerados\n1. Leer AI_CONTEXT.md y docs/REGLAS_DE_NEGOCIO.md\n\n### Restricciones\nNinguna\n\n### Criterios de Aceptación\n- [ ] Ok\n\n### Verificación\nxUnit"
        }
      ],
      repoHoursTotals: { backend: 8, panel: 0, app: 0, total: 8 }
    });

    vi.spyOn(service as any, "resolveAgyPath").mockReturnValue("agy");
    const executeSpy = vi
      .spyOn(service as any, "executeLlmCall")
      .mockResolvedValueOnce(step1)
      .mockResolvedValueOnce("esto no es JSON")
      .mockResolvedValueOnce(step2);

    const result = await service.generateAnalysis(transcript, undefined, { provider: "google-account", profileId: "diamante" });

    expect(executeSpy).toHaveBeenCalledTimes(3);
    const firstStep2Prompt = String(executeSpy.mock.calls[1]?.[1] ?? "");
    expect(firstStep2Prompt).toContain("exportar al Excel");
    expect(firstStep2Prompt).not.toContain(`"id": "P1"`);
    const retryPrompt = String(executeSpy.mock.calls[2]?.[1] ?? "");
    expect(retryPrompt).toContain("no era JSON válido");
    expect((result.inProgress ?? []).some((i) => i.includes("Lady") && i.includes("gestión externa"))).toBe(true);
  });

  it("reintenta la etapa 1 cuando se omiten ítems de la matriz de la transcripción y preserva el resultado completo (v9)", async () => {
    const transcript = [
      "[30:29] Hablante 1: Eh se requiere implementar una funcionalidad o botón que permita reprogramar actividades.",
      "[31:00] Hablante 1: Continuando con la revisión de la matriz.",
      "[31:50] Hablante 1: Y lo último se requiere habilitar una funcionalidad que permita exportar al Excel las solicitudes con filtros."
    ].join("\n");

    const step1Omission = JSON.stringify({
      summary: "Reunión de requerimientos.",
      puntos: [
        {
          id: "P1",
          cita: "reprogramar actividades",
          timestamp: "30:29",
          clase: "nuevo",
          accion: "codigo",
          repo: "panel"
        }
      ],
      alreadyResolved: [],
      inProgress: [],
      keyDecisions: [],
      globalOpenQuestions: [],
      backlog: []
    });

    const step1Complete = JSON.stringify({
      summary: "Reunión de requerimientos completa.",
      puntos: [
        {
          id: "P1",
          cita: "reprogramar actividades",
          timestamp: "30:29",
          clase: "nuevo",
          accion: "codigo",
          repo: "panel"
        },
        {
          id: "P2",
          cita: "exportar al Excel las solicitudes con filtros",
          timestamp: "31:50",
          clase: "nuevo",
          accion: "codigo",
          repo: "backend"
        }
      ],
      alreadyResolved: [],
      inProgress: [],
      keyDecisions: [],
      globalOpenQuestions: [],
      backlog: []
    });

    const step2Response = JSON.stringify({
      issues: [
        {
          id: "PANEL-1",
          repo: "panel",
          title: "[Panel] Reprogramar actividades",
          type: "feature",
          priority: "high",
          component: "Rutinas",
          description: "Reprogramar actividades [30:29].",
          estimation: { backendHours: 0, panelHours: 8, appHours: 0, totalHours: 8, text: "Backend: 0h | Panel: 8h | App: 0h | Total: 8h" },
          openQuestions: ["Ninguna"],
          dependencies: ["Ninguna"],
          prWorkflow: "Rama corta desde dev, PR a dev",
          expectedFiles: ["Logic/ (verificar en el repo)", "docs/REGLAS_DE_NEGOCIO.md"],
          acceptanceCriteria: ["Reprogramar [30:29]"],
          agentPrompt: "### Rol y Objetivo\nDev\n\n### Contexto\nContexto [30:29]\n\n### Pasos numerados\n1. Leer AI_CONTEXT.md\n\n### Restricciones\nNinguna\n\n### Criterios de Aceptación\n- [ ] Ok\n\n### Verificación\nPruebas"
        },
        {
          id: "BACKEND-1",
          repo: "backend",
          title: "[Backend] Exportar solicitudes al Excel",
          type: "feature",
          priority: "high",
          component: "Export",
          description: "Exportar al Excel con filtros [31:50].",
          estimation: { backendHours: 8, panelHours: 0, appHours: 0, totalHours: 8, text: "Backend: 8h | Panel: 0h | App: 0h | Total: 8h" },
          openQuestions: ["Ninguna"],
          dependencies: ["Ninguna"],
          prWorkflow: "Rama corta desde dev, PR a dev",
          expectedFiles: ["Controllers/ (verificar en el repo)", "docs/REGLAS_DE_NEGOCIO.md"],
          acceptanceCriteria: ["Exportar [31:50]"],
          agentPrompt: "### Rol y Objetivo\nDev\n\n### Contexto\nContexto [31:50]\n\n### Pasos numerados\n1. Leer AI_CONTEXT.md\n\n### Restricciones\nNinguna\n\n### Criterios de Aceptación\n- [ ] Ok\n\n### Verificación\nxUnit"
        }
      ],
      repoHoursTotals: { backend: 8, panel: 8, app: 0, total: 16 }
    });

    vi.spyOn(service as any, "resolveAgyPath").mockReturnValue("agy");
    const executeSpy = vi
      .spyOn(service as any, "executeLlmCall")
      .mockResolvedValueOnce(step1Omission)
      .mockResolvedValueOnce(step1Complete)
      .mockResolvedValueOnce(step2Response);

    const result = await service.generateAnalysis(transcript, undefined, { provider: "google-account" });

    expect(executeSpy).toHaveBeenCalledTimes(3);
    const retryStep1Prompt = String(executeSpy.mock.calls[1]?.[1] ?? "");
    expect(retryStep1Prompt).toContain("[ÍTEMS OMITIDOS EN TU EXTRACCIÓN PREVIA - INCLÚYELOS]:");
    expect(retryStep1Prompt).toContain("31:50");
    expect(result.issues).toHaveLength(2);
    expect(result.issues.some((i) => i.id === "BACKEND-1")).toBe(true);
  });
  describe("metadatos de generación (v10)", () => {
    const step1 = JSON.stringify({
      summary: "Reunión corta.",
      puntos: [{ id: "P1", cita: "Necesitamos exportar a PDF", timestamp: "04:20", clase: "nuevo", accion: "codigo", repo: "backend" }],
      alreadyResolved: [],
      inProgress: [],
      keyDecisions: [],
      topicsDiscussed: [],
      globalOpenQuestions: [],
      backlog: []
    });
    const step2 = JSON.stringify({
      issues: [
        {
          id: "BACKEND-1",
          repo: "backend",
          title: "[Backend] Exportación a PDF",
          type: "feature",
          priority: "medium",
          component: "Export",
          description: "Exportación según [04:20]",
          estimation: { backendHours: 3, panelHours: 0, appHours: 0, totalHours: 3, text: "" },
          openQuestions: ["Ninguna"],
          dependencies: ["Ninguna"],
          acceptanceCriteria: ["Genera PDF [04:20]"],
          agentPrompt: ["### Rol y Objetivo", "Dev", "### Contexto", "Contexto [04:20]", "### Pasos numerados", "1. Leer AI_CONTEXT.md", "### Restricciones", "Ninguna", "### Criterios de Aceptación", "- [ ] Genera PDF", "### Verificación", "Pruebas en verde."].join("\n")
        }
      ],
      repoHoursTotals: { backend: 3, panel: 0, app: 0, total: 3 }
    });
    const transcript = "[04:20] Hablante 1: Necesitamos exportar a PDF.";

    it("devuelve proveedor, modelo, perfil, intentos y avisos, y el perfil llega al prompt", async () => {
      vi.spyOn(service as any, "resolveAgyPath").mockReturnValue("agy");
      const executeSpy = vi.spyOn(service as any, "executeLlmCall").mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

      const result = await service.generateAnalysis(transcript, "Contexto", {
        provider: "google-account",
        model: "gemini-3-pro",
        profileId: "diamante"
      });

      const meta = result.generationMeta!;
      expect(meta.provider).toBe("google-account");
      expect(meta.providerLabel).toBe("Cuenta de Google (Antigravity)");
      expect(meta.model).toBe("gemini-3-pro");
      expect(meta.profileId).toBe("diamante");
      expect(meta.profileName).toContain("DIAMANTE");
      expect(meta.attempts).toBeGreaterThanOrEqual(1);
      expect(meta.usedFallback).toBe(false);
      expect(Array.isArray(meta.validationWarnings)).toBe(true);
      expect(Array.isArray(meta.validationErrors)).toBe(true);
      expect(meta.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(Date.parse(meta.generatedAt))).toBe(false);

      const firstSystemPrompt = executeSpy.mock.calls[0]?.[0] as string;
      expect(firstSystemPrompt).toContain("PERFIL DE PROYECTO: DIAMANTE");
    });

    it("sin profileId usa el perfil genérico y el prompt no contiene DIAMANTE", async () => {
      vi.spyOn(service as any, "resolveAgyPath").mockReturnValue("agy");
      const executeSpy = vi.spyOn(service as any, "executeLlmCall").mockResolvedValueOnce(step1).mockResolvedValueOnce(step2);

      const result = await service.generateAnalysis(transcript, "Contexto", { provider: "google-account" });
      expect(result.generationMeta?.profileId).toBe("generic");
      expect(executeSpy.mock.calls[0]?.[0] as string).not.toMatch(/diamante/i);
    });

    it("marca usedFallback cuando cae al análisis de paso único", async () => {
      vi.spyOn(service as any, "resolveAgyPath").mockReturnValue("agy");
      const fallback = JSON.stringify({
        summary: "Respaldo",
        alreadyResolved: [],
        inProgress: [],
        keyDecisions: [],
        topicsDiscussed: [],
        globalOpenQuestions: [],
        issues: [],
        backlog: [],
        repoHoursTotals: { backend: 0, panel: 0, app: 0, total: 0 }
      });
      vi.spyOn(service as any, "executeLlmCall").mockRejectedValueOnce(new Error("fallo de red")).mockResolvedValueOnce(fallback);

      const result = await service.generateAnalysis(transcript, undefined, { provider: "google-account", profileId: "diamante" });
      expect(result.summary).toBe("Respaldo");
      expect(result.generationMeta?.usedFallback).toBe(true);
      expect(result.generationMeta?.profileId).toBe("diamante");
    });
  });
});
