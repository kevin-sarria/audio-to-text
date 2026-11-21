import { execSync } from "node:child_process";
import fs from "node:fs";
import {
  IMeetingAnalysisService,
  GenerateAnalysisOptions,
  GeneratedMeetingData
} from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto, MeetingAnalysisProvider, AnalysisGenerationMetaDto, ProjectContextScanResultDto } from "@audio-to-text/shared";
import { ISecretVault } from "../../desktop/infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../../desktop/infrastructure/settings/SettingsStore.js";
import { MeetingAnalysisPrompts } from "./MeetingAnalysisPrompts.js";
import {
  MeetingAnalysisResponseParser,
  ExtractionPointDto,
  Step1ExtractionDto
} from "./MeetingAnalysisResponseParser.js";
import { MeetingAnalysisValidators } from "./MeetingAnalysisValidators.js";
import { TranscriptSanitizer } from "./TranscriptSanitizer.js";
import { TranscriptCoverageDetector } from "./TranscriptCoverageDetector.js";
import { runContextScan } from "./contextScan/ContextScanOrchestrator.js";
import { resolveScanBudget } from "./contextScan/ScanBudget.js";
import { ExtractionPointNormalizer } from "./ExtractionPointNormalizer.js";
import { LlmProviderClients } from "./LlmProviderClients.js";
import { detectMatrixItems, MatrixItem } from "./validators/MeetingAnalysisV9Validators.js";
import { ProjectProfile } from "./profiles/ProjectProfile.js";
import { ProfileRegistry } from "./profiles/ProfileRegistry.js";
import { DIAMANTE_PROFILE } from "./profiles/diamanteProfile.js";

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
    const startTime = Date.now();
    const sanitizedTranscript = TranscriptSanitizer.sanitize(transcript);
    const profile = ProfileRegistry.getProfile(options?.profileId);

    // Validador de cobertura v7 (el código decide, no el modelo): si la cobertura es < 90%, no se generan issues
    const coverage = TranscriptCoverageDetector.analyze(sanitizedTranscript);
    if (coverage.coveragePct < 90 && coverage.gaps.length > 0) {
      const gapsStr = coverage.gaps.map((g) => g.label).join(", ");
      const durationMs = Date.now() - startTime;

      let provId = options?.provider || "google-account";
      let provLabel = "Cuenta de Google (Antigravity)";
      let effModel = options?.model || "";

      try {
        const resolved = await this.resolveProviderAndKey(options);
        provId = resolved.providerId;
        provLabel = resolved.providerLabel;
        effModel = resolved.model;
      } catch {
        if (options?.provider === "gemini") provLabel = "Google Gemini API";
        else if (options?.provider === "groq") provLabel = "Groq";
        else if (options?.provider === "openai") provLabel = "OpenAI";
      }

      const generationMeta: AnalysisGenerationMetaDto = {
        provider: provId,
        providerLabel: provLabel,
        model: effModel,
        profileId: profile.id,
        profileName: profile.name,
        generatedAt: new Date().toISOString(),
        durationMs,
        attempts: 0,
        usedFallback: false,
        partialAnalysis: true,
        validationErrors: [],
        validationWarnings: []
      };

      return {
        summary: `Análisis parcial: transcripción incompleta, reintentar. Faltan [${gapsStr}] (~${coverage.missingPct}% de la reunión sin audio). Cobertura del ${coverage.coveragePct}% es inferior al 90% requerido.`,
        alreadyResolved: [],
        inProgress: [],
        keyDecisions: [],
        topicsDiscussed: ["Cobertura insuficiente de audio"],
        globalOpenQuestions: [
          `[NO BLOQUEANTE] Se requiere retranscribir los tramos sin audio [${gapsStr}] para procesar los requerimientos de la reunión.`
        ],
        issues: [],
        backlog: [],
        repoHoursTotals: { backend: 0, panel: 0, app: 0, total: 0 },
        generationMeta
      };
    }

    const { provider, providerId, providerLabel, apiKey, model, baseUrl } = await this.resolveProviderAndKey(options);

    const step1SystemPrompt = this.buildStep1Prompt(projectContext, profile);
    const step1UserPrompt = `A continuación se presenta la transcripción completa de la reunión de desarrollo:\n\n${sanitizedTranscript}\n\nPor favor, extrae el resumen ejecutivo, identifica las decisiones clave, formula las preguntas abiertas globales (máximo 8, clasificadas en BLOQUEANTE o NO BLOQUEANTE, sin incluir ruido evidente) y clasifica rigurosamente cada punto tratado en la estructura de puntos JSON con su clase ('cerrado' | 'en_curso' | 'nuevo' | 'backlog') y su acción ('codigo' | 'gestion_externa' | 'decision' | 'seguimiento') con su marca [mm:ss], siguiendo estrictamente las REGLAS DE GENERACIÓN DE ISSUES.`;

    let attemptsCount = 0;

    try {
      // ETAPA 1: Extracción estructurada y clasificación rigurosa
      let rawStep1 = await this.executeLlmCall(step1SystemPrompt, step1UserPrompt, provider, apiKey, model, baseUrl);
      let step1Data = MeetingAnalysisResponseParser.parseStep1Extraction(rawStep1);

      // Reglas aplicadas por código antes de redactar
      let normalization = ExtractionPointNormalizer.normalize(step1Data.puntos || [], sanitizedTranscript, profile);
      step1Data.puntos = normalization.points;

      // Reintento de etapa 1 por cobertura (v9)
      const matrixItemsOnlyTranscript = detectMatrixItems(sanitizedTranscript, undefined, profile);
      const isItemCovered = (item: MatrixItem, points: ExtractionPointDto[]) =>
        points.some((p) => {
          const sec = TranscriptCoverageDetector.parseSeconds(p.timestamp || "");
          return sec >= item.startSec && sec <= item.endSec;
        });

      const missingMatrixItems = matrixItemsOnlyTranscript.filter(
        (item) => !isItemCovered(item, step1Data.puntos || [])
      );

      if (missingMatrixItems.length > 0) {
        const retryStep1UserPrompt = `${step1UserPrompt}\n\n[ÍTEMS OMITIDOS EN TU EXTRACCIÓN PREVIA - INCLÚYELOS]:\n${missingMatrixItems
          .map((m) => `- [${m.timestamp}] ${m.text}`)
          .join("\n")}`;

        try {
          const rawStep1Retry = await this.executeLlmCall(
            step1SystemPrompt,
            retryStep1UserPrompt,
            provider,
            apiKey,
            model,
            baseUrl
          );
          const retryStep1Data = MeetingAnalysisResponseParser.parseStep1Extraction(rawStep1Retry);
          const retryNormalization = ExtractionPointNormalizer.normalize(
            retryStep1Data.puntos || [],
            sanitizedTranscript,
            profile
          );
          retryStep1Data.puntos = retryNormalization.points;

          const stillMissing = matrixItemsOnlyTranscript.filter(
            (item) => !isItemCovered(item, retryStep1Data.puntos || [])
          );

          if (
            stillMissing.length < missingMatrixItems.length ||
            (stillMissing.length === missingMatrixItems.length &&
              (retryStep1Data.puntos || []).length >= (step1Data.puntos || []).length)
          ) {
            step1Data = retryStep1Data;
            normalization = retryNormalization;
            if (stillMissing.length > 0) {
              console.warn(
                "[LlmMeetingAnalysisService] Etapa 1 reintentada sigue omitiendo ítems de la matriz:",
                stillMissing.map((m) => m.timestamp)
              );
            }
          } else {
            console.warn(
              "[LlmMeetingAnalysisService] Etapa 1 reintentada no mejoró la cobertura; manteniendo resultado previo."
            );
          }
        } catch (retryErr: any) {
          console.warn("[LlmMeetingAnalysisService] Falló el reintento de Etapa 1 por cobertura:", retryErr.message);
        }
      }

      if (normalization.changes.length > 0) {
        console.info("[LlmMeetingAnalysisService] Normalización determinista de la extracción:", normalization.changes);
        this.syncSectionsWithPoints(step1Data, normalization.changes.map((c) => c.pointId));
      }

      // Filtrar únicamente los puntos que son nuevos y requieren código
      const validCodePoints = (step1Data.puntos || []).filter(
        (p) => p.clase === "nuevo" && p.accion === "codigo"
      );

      // ETAPA 2: Redacción estructurada de issues ÚNICAMENTE a partir de los puntos nuevo/codigo
      const step2SystemPrompt = this.buildStep2Prompt(projectContext, profile);
      let step2UserPrompt = `A continuación se presentan ÚNICAMENTE los puntos con clase = nuevo y accion = codigo extraídos de la reunión:\n\n${JSON.stringify(
        {
          puntosNuevoCodigo: validCodePoints,
          alreadyResolved: step1Data.alreadyResolved || [],
          inProgress: step1Data.inProgress || [],
          keyDecisions: step1Data.keyDecisions || [],
          globalOpenQuestions: step1Data.globalOpenQuestions || []
        },
        null,
        2
      )}\n\nGenera los issues de programación organizados por repositorio afectado para estos requerimientos NUEVOS ÚNICAMENTE (sin inventar detalles ni tecnologías no presentes en la lista). Cumple estrictamente las REGLAS DE GENERACIÓN DE ISSUES (un issue por repo afectado, estimación numérica exacta según tabla de referencia, sin filtrar mecánicas internas 'Paso 1' o 'Paso 2', y agentPrompt completo con las 6 secciones requeridas).`;

      let step2Issues: DevIssueDto[] = [];
      let step2Hours: any = null;

      // Ejecución de Etapa 2 con hasta 2 auto-reintentos si hay errores de validación
      const maxRetries = 2;
      let finalMergedData: GeneratedMeetingData | null = null;
      let lastValidationErrors: string[] = [];
      let lastValidationWarnings: string[] = [];

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        attemptsCount = attempt + 1;
        const rawStep2 = await this.executeLlmCall(step2SystemPrompt, step2UserPrompt, provider, apiKey, model, baseUrl);
        const step2Clean = this.cleanJsonString(rawStep2);
        let parsedStep2: any;
        try {
          parsedStep2 = JSON.parse(step2Clean);
        } catch (parseErr: any) {
          if (attempt < maxRetries && validCodePoints.length > 0) {
            console.info(`[LlmMeetingAnalysisService] JSON inválido en Etapa 2 (intento ${attempt + 1}); reintentando.`);
            step2UserPrompt += `\n\n[ERROR CRÍTICO EN TU RESPUESTA PREVIA]: no era JSON válido (${parseErr.message}). Devuelve exclusivamente el objeto JSON con "issues" y "repoHoursTotals".`;
            continue;
          }
          parsedStep2 = { issues: [] };
        }

        if (Array.isArray(parsedStep2)) {
          step2Issues = parsedStep2;
        } else if (parsedStep2 && Array.isArray(parsedStep2.issues)) {
          step2Issues = parsedStep2.issues;
          step2Hours = parsedStep2.repoHoursTotals;
        }

        const candidateMerged: GeneratedMeetingData = {
          summary: step1Data.summary || "Resumen de la reunión",
          alreadyResolved: step1Data.alreadyResolved || [],
          inProgress: step1Data.inProgress || [],
          keyDecisions: step1Data.keyDecisions || [],
          topicsDiscussed: step1Data.topicsDiscussed || [],
          globalOpenQuestions: step1Data.globalOpenQuestions || [],
          issues: step2Issues,
          backlog: step1Data.backlog || [],
          repoHoursTotals: step2Hours || { backend: 0, panel: 0, app: 0, total: 0 }
        };

        const sanitized = MeetingAnalysisValidators.sanitizeAndAutocorrect(candidateMerged, sanitizedTranscript, profile);
        const validation = MeetingAnalysisValidators.validate(sanitized, sanitizedTranscript, step1Data.puntos, profile);

        finalMergedData = sanitized;
        lastValidationErrors = validation.errors;
        lastValidationWarnings = validation.warnings;

        if (validation.isValid || attempt === maxRetries) {
          if (!validation.isValid) {
            console.warn(`[LlmMeetingAnalysisService] Validaciones tras reintento final ${attempt}:`, validation.errors);
          }
          break;
        }

        console.info(`[LlmMeetingAnalysisService] Reintentando Etapa 2 (intento ${attempt + 1}/${maxRetries}) por errores:`, validation.errors);
        step2UserPrompt += `\n\n[ERRORES CRÍTICOS DETECTADOS EN TU RESPUESTA PREVIA - CORREGIR DE FORMA OBLIGATORIA]:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`;
      }

      const durationMs = Date.now() - startTime;
      finalMergedData!.generationMeta = {
        provider: providerId,
        providerLabel,
        model,
        profileId: profile.id,
        profileName: profile.name,
        generatedAt: new Date().toISOString(),
        durationMs,
        attempts: attemptsCount,
        usedFallback: false,
        partialAnalysis: coverage.isPartial,
        validationErrors: lastValidationErrors,
        validationWarnings: lastValidationWarnings
      };

      return finalMergedData!;
    } catch (stepErr: any) {
      console.warn("[LlmMeetingAnalysisService] Fallback a análisis de paso único debido a:", stepErr.message);
      const fallbackPrompt = this.buildSingleStepPrompt(projectContext, profile);
      const rawFallback = await this.executeLlmCall(fallbackPrompt, step1UserPrompt, provider, apiKey, model, baseUrl);
      const fallbackData = this.parseAndValidateResponse(rawFallback, sanitizedTranscript, profile);

      const durationMs = Date.now() - startTime;
      const fallbackVal = MeetingAnalysisValidators.validate(fallbackData, sanitizedTranscript, undefined, profile);

      fallbackData.generationMeta = {
        provider: providerId,
        providerLabel,
        model,
        profileId: profile.id,
        profileName: profile.name,
        generatedAt: new Date().toISOString(),
        durationMs,
        attempts: attemptsCount || 1,
        usedFallback: true,
        partialAnalysis: coverage.isPartial,
        validationErrors: fallbackVal.errors,
        validationWarnings: fallbackVal.warnings
      };

      return fallbackData;
    }
  }

  public async generateContextFromRepo(
    repoPath: string,
    options?: GenerateAnalysisOptions
  ): Promise<ProjectContextScanResultDto> {
    if (!fs.existsSync(repoPath)) {
      throw new Error(`La ruta de la carpeta no existe: ${repoPath}`);
    }
    const stat = fs.statSync(repoPath);
    if (!stat.isDirectory()) {
      throw new Error(`La ruta especificada no es una carpeta válida: ${repoPath}`);
    }

    const { provider, apiKey, model, baseUrl, providerLabel } = await this.resolveProviderAndKey(options);

    const userSettings = this.deps?.settingsStore?.getSettings();
    const budget = resolveScanBudget(
      model,
      userSettings?.contextScanModelLimits,
      userSettings?.contextScanMaxSummaryCalls
    );

    const llm = (s: string, u: string) => this.executeLlmCall(s, u, provider, apiKey, model, baseUrl);

    return runContextScan(repoPath, llm, {
      budget,
      providerLabel,
      model
    });
  }

  private async resolveProviderAndKey(options?: GenerateAnalysisOptions): Promise<{
    provider: MeetingAnalysisProvider;
    providerId: string;
    providerLabel: string;
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
        providerId: "google-account",
        providerLabel: "Cuenta de Google (Antigravity)",
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
        providerId: customConfig.id,
        providerLabel: customConfig.name,
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
      const label =
        provider === "gemini"
          ? "Google Gemini API"
          : provider === "groq"
          ? "Groq"
          : provider === "openai"
          ? "OpenAI"
          : provider;
      return {
        provider,
        providerId: provider,
        providerLabel: label,
        apiKey: options.apiKey || "",
        model,
        baseUrl: options.baseUrl
      };
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
          providerId: "google-account",
          providerLabel: "Cuenta de Google (Antigravity)",
          apiKey: "",
          model: ""
        };
      }

      if (!key && provider !== "custom") {
        throw new Error(
          `No se encontró clave de API para el proveedor '${provider}'. Por favor configúrala en Ajustes o selecciona 'Cuenta de Google (Sin API Key)'.`
        );
      }
      const label =
        provider === "gemini"
          ? "Google Gemini API"
          : provider === "groq"
          ? "Groq"
          : provider === "openai"
          ? "OpenAI"
          : provider;
      return {
        provider,
        providerId: provider,
        providerLabel: label,
        apiKey: key || "dummy-key",
        model: options?.model || this.getDefaultModel(provider),
        baseUrl: options?.baseUrl
      };
    }

    let geminiKey = this.deps?.secretVault ? await this.deps.secretVault.get("gemini") : null;
    if (!geminiKey) geminiKey = process.env["GEMINI_API_KEY"] || null;
    if (geminiKey) {
      return {
        provider: "gemini",
        providerId: "gemini",
        providerLabel: "Google Gemini API",
        apiKey: geminiKey,
        model: options?.model || "gemini-2.5-flash"
      };
    }

    let groqKey = this.deps?.secretVault ? await this.deps.secretVault.get("groq") : null;
    if (!groqKey) groqKey = process.env["GROQ_API_KEY"] || null;
    if (groqKey) {
      return {
        provider: "groq",
        providerId: "groq",
        providerLabel: "Groq",
        apiKey: groqKey,
        model: options?.model || "llama-3.3-70b-versatile"
      };
    }

    const openaiKey = process.env["OPENAI_API_KEY"] || null;
    if (openaiKey) {
      return {
        provider: "openai",
        providerId: "openai",
        providerLabel: "OpenAI",
        apiKey: openaiKey,
        model: options?.model || "gpt-4o-mini"
      };
    }

    if (this.resolveAgyPath()) {
      return {
        provider: "google-account",
        providerId: "google-account",
        providerLabel: "Cuenta de Google (Antigravity)",
        apiKey: "",
        model: options?.model || ""
      };
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
        return "gemini-3.8-flash";
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

  private syncSectionsWithPoints(step1Data: Step1ExtractionDto, changedIds: string[]): void {
    const changed = new Set(changedIds);
    const cites = (list: string[], ts: string) => list.some((item) => ts && item.includes(ts));
    for (const p of step1Data.puntos || []) {
      if (!changed.has(p.id)) continue;
      const label = `${(p.cita || "").slice(0, 140)} [${p.timestamp}]`;
      if (p.clase === "cerrado" && !cites(step1Data.alreadyResolved, p.timestamp)) {
        step1Data.alreadyResolved.push(label);
      } else if (p.accion === "gestion_externa" && !cites(step1Data.inProgress, p.timestamp)) {
        step1Data.inProgress.push(`${label} (gestión externa)`);
      }
    }
  }

  private buildStep1Prompt(projectContext?: string, profile?: ProjectProfile): string {
    return MeetingAnalysisPrompts.buildStep1Prompt(projectContext, profile);
  }

  private buildStep2Prompt(projectContext?: string, profile?: ProjectProfile): string {
    return MeetingAnalysisPrompts.buildStep2Prompt(projectContext, profile);
  }

  private buildSingleStepPrompt(projectContext?: string, profile?: ProjectProfile): string {
    return MeetingAnalysisPrompts.buildSingleStepPrompt(projectContext, profile);
  }

  private cleanJsonString(raw: string): string {
    return MeetingAnalysisResponseParser.cleanJsonString(raw);
  }

  private parseAndValidateResponse(rawJson: string, transcript?: string, profile?: ProjectProfile): GeneratedMeetingData {
    return MeetingAnalysisResponseParser.parseAndValidate(rawJson, transcript, undefined, profile);
  }
}
