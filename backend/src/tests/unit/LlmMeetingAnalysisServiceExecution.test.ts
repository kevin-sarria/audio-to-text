import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LlmMeetingAnalysisService } from "../../infrastructure/analysis/LlmMeetingAnalysisService.js";
import { InMemorySecretVault } from "../../desktop/infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../../desktop/infrastructure/settings/SettingsStore.js";

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

  it("los prompts del pipeline (Paso 1, Paso 2 y Fallback) estructuran 3 capas y las reglas 1-16", () => {
    const step1Prompt = (service as any).buildStep1Prompt("Contexto DIAMANTE...");
    const step2Prompt = (service as any).buildStep2Prompt("Contexto DIAMANTE...");
    const singleStepPrompt = (service as any).buildSingleStepPrompt("Contexto DIAMANTE...");

    // Capa 1: Reglas universales
    expect(step1Prompt).toContain("[CAPA 1 — REGLAS UNIVERSALES DE GENERACIÓN DE ISSUES (OBLIGATORIAS)]");
    expect(step1Prompt).toContain("== 1. FIDELIDAD A LA TRANSCRIPCIÓN ==");
    expect(step1Prompt).toContain("== 2. RUIDO DE TRANSCRIPCIÓN, NOMBRES, VALORES Y HABLANTES ==");
    expect(step1Prompt).toContain("== 3. PREGUNTAS ABIERTAS ==");
    expect(step1Prompt).toContain("== 4. NO CONSTRUYAS SOBRE LO AMBIGUO ==");
    expect(step1Prompt).toContain("== 5. NO INVENTES ESTRUCTURA NI TECNOLOGÍA ==");
    expect(step1Prompt).toContain("== 6. CLASIFICA ANTES DE CREAR ISSUES ==");
    expect(step1Prompt).toContain("== 7. ENDPOINTS FALTANTES Y DEPENDENCIAS ==");
    expect(step1Prompt).toContain("== 8. SIN ALCANCE EXTRA ==");
    expect(step1Prompt).toContain("== 9. ESTADO REAL ==");
    expect(step1Prompt).toContain("== 10. CONTRADICCIÓN CON EL CONTEXTO ==");
    expect(step1Prompt).toContain("== 11. ESTIMACIÓN CALIBRADA ==");
    expect(step1Prompt).toContain("== 12. FLUJO DE PR");
    expect(step1Prompt).toContain("== 13. PROMPT DE CADA ISSUE");
    expect(step1Prompt).toContain("== 14. FORMATO DE SALIDA ==");
    expect(step1Prompt).toContain("== 15. NO FILTRES LA MECÁNICA INTERNA ==");
    expect(step1Prompt).toContain("== 16. FIDELIDAD EN BUGS ==");
    expect(step1Prompt).toContain("== 17. CAMBIOS DE NOMBRE ==");
    expect(step1Prompt).toContain("== 18. FRASES SUELTAS DE ESTADO ==");
    expect(step1Prompt).toContain("== 19. CRITERIOS DE ACEPTACIÓN ==");

    // Capa 2: Contexto y tabla de referencia
    expect(step1Prompt).toContain("[CAPA 2 — CONTEXTO DEL PROYECTO]");
    expect(step1Prompt).toContain("TABLA DE REFERENCIA DE HORAS");
    expect(step1Prompt).toContain("LISTA EXACTA DE DOCUMENTOS PERMITIDOS");
    expect(step1Prompt).toContain("AI_CONTEXT.md");
    expect(step1Prompt).toContain("BITACORA.md");

    // Capa 3: Glosario
    expect(step1Prompt).toContain("[CAPA 3 — GLOSARIO]");
    expect(step1Prompt).toContain('"Lexus" → "Alexis"');
    expect(step1Prompt).toContain('"RAME"');
    expect(step1Prompt).toContain('"valida de amante"');
    expect(step1Prompt).toContain('"al EC" → "Excel"');

    // Paso 2 y Single Step
    expect(step2Prompt).toContain("[CAPA 1 — REGLAS UNIVERSALES DE GENERACIÓN DE ISSUES (OBLIGATORIAS)]");
    expect(step2Prompt).toContain("ETAPA 2");
    expect(singleStepPrompt).toContain("[CAPA 1 — REGLAS UNIVERSALES DE GENERACIÓN DE ISSUES (OBLIGATORIAS)]");
  });
});
