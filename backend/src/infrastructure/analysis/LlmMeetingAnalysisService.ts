import { execSync } from "node:child_process";
import fs from "node:fs";
import {
  IMeetingAnalysisService,
  GenerateAnalysisOptions,
  GeneratedMeetingData
} from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto, MeetingAnalysisProvider } from "@audio-to-text/shared";
import { ISecretVault } from "../../desktop/infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../../desktop/infrastructure/settings/SettingsStore.js";
import { MeetingAnalysisPrompts } from "./MeetingAnalysisPrompts.js";
import { MeetingAnalysisResponseParser } from "./MeetingAnalysisResponseParser.js";
import { RepoContextScanner } from "./RepoContextScanner.js";
import { LlmProviderClients } from "./LlmProviderClients.js";

export interface LlmMeetingAnalysisServiceDeps {
  secretVault?: ISecretVault;
  settingsStore?: SettingsStore;
}

export class LlmMeetingAnalysisService implements IMeetingAnalysisService {
  constructor(private deps?: LlmMeetingAnalysisServiceDeps) {}

  public async generateAnalysis(
    transcript: string,
    projectContext?: string,
    options?: GenerateAnalysisOptions
  ): Promise<GeneratedMeetingData> {
    const { provider, apiKey, model, baseUrl } = await this.resolveProviderAndKey(options);

    const step1SystemPrompt = this.buildStep1Prompt(projectContext);
    const step1UserPrompt = `A continuación se presenta la transcripción completa de la reunión de desarrollo:\n\n${transcript}\n\nPor favor, extrae el resumen ejecutivo, identifica las decisiones clave, formula las preguntas abiertas globales (máximo 8, clasificadas en BLOQUEANTE o NO BLOQUEANTE, sin incluir ruido evidente) y clasifica rigurosamente cada punto tratado en la estructura de puntos JSON (clase: cerrado, en_curso, nuevo, backlog) con su marca [mm:ss], siguiendo estrictamente las REGLAS DE GENERACIÓN DE ISSUES.`;

    try {
      // ETAPA 1: Extracción, clasificación y detección de ambigüedades
      const rawStep1 = await this.executeLlmCall(step1SystemPrompt, step1UserPrompt, provider, apiKey, model, baseUrl);
      const step1Clean = this.cleanJsonString(rawStep1);
      const step1Data = JSON.parse(step1Clean);

      // ETAPA 2: Redacción estructurada de issues únicamente a partir de la extracción previa
      const step2SystemPrompt = this.buildStep2Prompt(projectContext);
      const step2UserPrompt = `A continuación se presentan los puntos extraídos y clasificados en la Etapa 1 de la reunión:\n\n${JSON.stringify(
        {
          puntos: step1Data?.puntos || step1Data?.newItems || [],
          alreadyResolved: step1Data?.alreadyResolved || [],
          inProgress: step1Data?.inProgress || [],
          globalOpenQuestions: step1Data?.globalOpenQuestions || []
        },
        null,
        2
      )}\n\nGenera los issues de programación organizados por repositorio afectado para los requerimientos NUEVOS ÚNICAMENTE a partir de estos puntos extraídos (sin inventar tecnologías ni detalles no presentes en la lista). Aplica estrictamente las REGLAS DE GENERACIÓN DE ISSUES (un issue por repo, sin filtrar 'Paso 1' o mecánicas internas, calculando horas exactas conforme a la tabla de referencia y redactando agentPrompt con las 6 secciones requeridas).`;

      const rawStep2 = await this.executeLlmCall(step2SystemPrompt, step2UserPrompt, provider, apiKey, model, baseUrl);
      const step2Clean = this.cleanJsonString(rawStep2);
      const step2Data = JSON.parse(step2Clean);

      let step2Issues: any[] = [];
      let step2Hours: any = null;
      if (Array.isArray(step2Data)) {
        step2Issues = step2Data;
      } else if (step2Data && Array.isArray(step2Data.issues)) {
        step2Issues = step2Data.issues;
        step2Hours = step2Data.repoHoursTotals;
      }

      // Ensamblar ambas etapas
      const merged = {
        summary: step1Data?.summary || "Resumen de la reunión",
        alreadyResolved: Array.isArray(step1Data?.alreadyResolved) ? step1Data.alreadyResolved : [],
        inProgress: Array.isArray(step1Data?.inProgress) ? step1Data.inProgress : [],
        keyDecisions: Array.isArray(step1Data?.keyDecisions) ? step1Data.keyDecisions : [],
        topicsDiscussed: Array.isArray(step1Data?.topicsDiscussed) ? step1Data.topicsDiscussed : [],
        globalOpenQuestions: Array.isArray(step1Data?.globalOpenQuestions) ? step1Data.globalOpenQuestions : [],
        issues: step2Issues,
        backlog: Array.isArray(step1Data?.backlog) ? step1Data.backlog : [],
        repoHoursTotals: step2Hours || step2Data?.repoHoursTotals || { backend: 0, panel: 0, app: 0, total: 0 }
      };

      return this.parseAndValidateResponse(JSON.stringify(merged), transcript);
    } catch (stepErr: any) {
      console.warn("[LlmMeetingAnalysisService] Fallback a análisis de paso único debido a:", stepErr.message);
      const fallbackPrompt = this.buildSingleStepPrompt(projectContext);
      const rawFallback = await this.executeLlmCall(fallbackPrompt, step1UserPrompt, provider, apiKey, model, baseUrl);
      return this.parseAndValidateResponse(rawFallback, transcript);
    }
  }

  public async generateContextFromRepo(
    repoPath: string,
    options?: GenerateAnalysisOptions
  ): Promise<string> {
    if (!fs.existsSync(repoPath)) {
      throw new Error(`La ruta de la carpeta no existe: ${repoPath}`);
    }
    const stat = fs.statSync(repoPath);
    if (!stat.isDirectory()) {
      throw new Error(`La ruta especificada no es una carpeta válida: ${repoPath}`);
    }

    const scanSummary = this.scanRepositoryStructure(repoPath);

    const systemPrompt = `Eres un arquitecto de software de élite y experto en IA. Tu tarea es analizar los archivos, documentación y estructura de un repositorio de código para redactar un "Contexto Técnico del Proyecto" completo, conciso y profesional.
Este contexto servirá como arnés de contexto técnico para que agentes de IA de desarrollo (Cursor, Claude Code, Antigravity, GitHub Copilot) entiendan perfectamente las tecnologías, arquitectura y reglas del proyecto al convertir reuniones de equipo en issues y tareas de desarrollo.`;

    const userPrompt = `A continuación se presenta la estructura de directorios y los archivos clave (README, manifiestos de paquetes, configuraciones y documentación) del repositorio:\n\nRuta del repositorio: ${repoPath}\n\n${scanSummary}\n\nPor favor, genera el Contexto Técnico del Proyecto estructurado en formato Markdown con las siguientes 4 secciones:\n1. 📌 PROYECTO & OBJETIVO (Nombre, qué hace y qué problema soluciona)\n2. 💻 STACK TECNOLÓGICO Y VERSIONES (Lenguajes, frameworks backend/frontend, bases de datos, ORMs y herramientas clave)\n3. 🏗️ ARQUITECTURA Y MÓDULOS (Patrones arquitectónicos como Clean Architecture, Monorepo o Microservicios, directorios clave y responsabilidades)\n4. 📋 CONVENCIONES Y REGLAS DE NEGOCIO (Estándares de codificación, nombrado, testing, flujo de datos y reglas de dominio deducidas)\n\nDevuelve exclusivamente el texto en Markdown listo para ser usado como contexto.`;

    const { provider, apiKey, model, baseUrl } = await this.resolveProviderAndKey(options);

    const rawResponse = await this.executeLlmCall(systemPrompt, userPrompt, provider, apiKey, model, baseUrl);

    let clean = rawResponse.trim();
    if (clean.startsWith("```markdown")) {
      clean = clean.replace(/^```markdown\s*/, "").replace(/\s*```$/, "");
    } else if (clean.startsWith("```md")) {
      clean = clean.replace(/^```md\s*/, "").replace(/\s*```$/, "");
    }
    return clean;
  }

  private scanRepositoryStructure(repoPath: string): string {
    return RepoContextScanner.scanRepositoryStructure(repoPath);
  }

  private async resolveProviderAndKey(options?: GenerateAnalysisOptions): Promise<{
    provider: MeetingAnalysisProvider;
    apiKey: string;
    model: string;
    baseUrl?: string;
  }> {
    const userSettings = this.deps?.settingsStore?.getSettings();
    const targetProvider = options?.provider || userSettings?.issuesDefaultProvider || "google-account";

    if (targetProvider === "google-account") {
      const agyPath = this.resolveAgyPath();
      if (!agyPath) {
        throw new Error(
          "No se encontró Antigravity CLI ('agy') instalado en el sistema para conectar con tu cuenta de Google. Puedes instalarlo o ingresar una API Key gratuita de Google AI Studio."
        );
      }
      return {
        provider: "google-account",
        apiKey: "",
        model: options?.model || userSettings?.issuesDefaultModel || ""
      };
    }

    const customConfig = userSettings?.customProviders?.find(
      (p) =>
        p.id === targetProvider ||
        p.name.toLowerCase() === targetProvider.toLowerCase() ||
        (options?.baseUrl && p.baseUrl.replace(/\/+$/, "") === options.baseUrl.replace(/\/+$/, "")) ||
        (targetProvider === "custom" && userSettings.customProviders && userSettings.customProviders.length === 1)
    );
    if (customConfig) {
      let savedKey: string | null = null;
      if (this.deps?.secretVault) {
        savedKey = await this.deps.secretVault.get(customConfig.id);
      }
      const apiKey = options?.apiKey || savedKey || customConfig.apiKey || "";

      const isLocalHost = (customConfig.baseUrl || "").includes("localhost") || (customConfig.baseUrl || "").includes("127.0.0.1");
      if (!apiKey && !isLocalHost) {
        throw new Error(
          `No se encontró clave de API para el proveedor '${customConfig.name}'. Por favor configúrala en Ajustes o ingresa una clave temporal.`
        );
      }

      let chosenModel = customConfig.defaultModel || "default";
      if (options?.model && options.model.trim()) {
        const m = options.model.trim();
        if (!m.startsWith("gemini-") || customConfig.name.toLowerCase().includes("gemini")) {
          chosenModel = m;
        }
      }

      return {
        provider: "custom",
        apiKey,
        model: chosenModel,
        baseUrl: options?.baseUrl || customConfig.baseUrl
      };
    }

    if (options?.apiKey || options?.baseUrl) {
      const provider =
        options.provider && options.provider !== "google-account"
          ? options.provider
          : options.baseUrl
          ? "custom"
          : "gemini";
      const model = options.model || this.getDefaultModel(provider);
      return { provider, apiKey: options.apiKey || "", model, baseUrl: options.baseUrl };
    }

    if (targetProvider) {
      const provider = targetProvider as MeetingAnalysisProvider;
      let key: string | null = null;
      if (this.deps?.secretVault) {
        key = await this.deps.secretVault.get(provider);
      }
      if (!key) {
        key = this.getEnvKeyForProvider(provider);
      }

      if (!key && provider === "gemini" && this.resolveAgyPath()) {
        return {
          provider: "google-account",
          apiKey: "",
          model: ""
        };
      }

      if (!key && provider !== "custom") {
        throw new Error(
          `No se encontró clave de API para el proveedor '${provider}'. Por favor configúrala en Ajustes o selecciona 'Cuenta de Google (Sin API Key)'.`
        );
      }
      return {
        provider,
        apiKey: key || "dummy-key",
        model: options?.model || this.getDefaultModel(provider),
        baseUrl: options?.baseUrl
      };
    }

    let geminiKey = this.deps?.secretVault ? await this.deps.secretVault.get("gemini") : null;
    if (!geminiKey) geminiKey = process.env["GEMINI_API_KEY"] || null;
    if (geminiKey) {
      return { provider: "gemini", apiKey: geminiKey, model: options?.model || "gemini-2.5-flash" };
    }

    let groqKey = this.deps?.secretVault ? await this.deps.secretVault.get("groq") : null;
    if (!groqKey) groqKey = process.env["GROQ_API_KEY"] || null;
    if (groqKey) {
      return { provider: "groq", apiKey: groqKey, model: options?.model || "llama-3.3-70b-versatile" };
    }

    const openaiKey = process.env["OPENAI_API_KEY"] || null;
    if (openaiKey) {
      return { provider: "openai", apiKey: openaiKey, model: options?.model || "gpt-4o-mini" };
    }

    if (this.resolveAgyPath()) {
      return { provider: "google-account", apiKey: "", model: options?.model || "" };
    }

    throw new Error(
      "No se encontró ninguna clave de API configurada ni sesión de Google. Puedes: 1) Seleccionar 'Google Gemini Pro (Cuenta de Google - Sin API Key)', o 2) Crear una API Key gratuita en https://aistudio.google.com/ e ingresarla en Ajustes o en el formulario."
    );
  }

  private resolveAgyPath(): string | null {
    try {
      const isWin = process.platform === "win32";
      const out = execSync(isWin ? "where.exe agy.exe" : "which agy", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true
      }).trim();
      const firstLine = out.split(/\r?\n/)[0]?.trim();
      return firstLine || null;
    } catch {
      return null;
    }
  }

  private getEnvKeyForProvider(provider: MeetingAnalysisProvider): string | null {
    if (provider === "gemini") return process.env["GEMINI_API_KEY"] || null;
    if (provider === "groq") return process.env["GROQ_API_KEY"] || null;
    if (provider === "openai" || provider === "custom") return process.env["OPENAI_API_KEY"] || null;
    return null;
  }

  private getDefaultModel(provider: MeetingAnalysisProvider): string {
    switch (provider) {
      case "google-account":
        return "";
      case "gemini":
        return "gemini-2.5-flash";
      case "groq":
        return "llama-3.3-70b-versatile";
      case "openai":
        return "gpt-4o-mini";
      case "custom":
        return "deepseek-chat";
      default:
        return "default";
    }
  }

  private async executeLlmCall(
    systemPrompt: string,
    userPrompt: string,
    provider: string,
    apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<string> {
    if (provider === "google-account") {
      const agyPath = this.resolveAgyPath() || (process.platform === "win32" ? "agy.exe" : "agy");
      return LlmProviderClients.callGoogleAccount(agyPath, systemPrompt, userPrompt, model);
    } else if (provider === "gemini") {
      return LlmProviderClients.callGemini(systemPrompt, userPrompt, apiKey, model);
    } else if (provider === "groq") {
      return LlmProviderClients.callGroq(systemPrompt, userPrompt, apiKey, model);
    } else {
      return LlmProviderClients.callOpenAi(systemPrompt, userPrompt, apiKey, model, baseUrl);
    }
  }

  // Delegaciones para compatibilidad y Clean Architecture
  private buildStep1Prompt(projectContext?: string): string {
    return MeetingAnalysisPrompts.buildStep1Prompt(projectContext);
  }

  private buildStep2Prompt(projectContext?: string): string {
    return MeetingAnalysisPrompts.buildStep2Prompt(projectContext);
  }

  private buildSingleStepPrompt(projectContext?: string): string {
    return MeetingAnalysisPrompts.buildSingleStepPrompt(projectContext);
  }

  private cleanJsonString(raw: string): string {
    return MeetingAnalysisResponseParser.cleanJsonString(raw);
  }

  private parseAndValidateResponse(rawJson: string, transcript?: string): GeneratedMeetingData {
    return MeetingAnalysisResponseParser.parseAndValidate(rawJson, transcript);
  }
}
