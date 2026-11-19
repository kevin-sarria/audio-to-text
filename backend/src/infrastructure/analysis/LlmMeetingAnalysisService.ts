import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  IMeetingAnalysisService,
  GenerateAnalysisOptions,
  GeneratedMeetingData
} from "../../domain/services/IMeetingAnalysisService.js";
import { DevIssueDto, MeetingAnalysisProvider } from "@audio-to-text/shared";
import { ISecretVault } from "../../desktop/infrastructure/settings/ISecretVault.js";
import { SettingsStore } from "../../desktop/infrastructure/settings/SettingsStore.js";

const DevIssueSchema = z.object({
  id: z.string().default(() => `ISSUE-${Math.floor(Math.random() * 900 + 100)}`),
  repo: z.preprocess((val) => {
    if (typeof val !== "string") return "backend";
    const v = val.toLowerCase().trim();
    if (v.includes("back") || v.includes("api") || v.includes("server")) return "backend";
    if (v.includes("panel") || v.includes("front") || v.includes("web")) return "panel";
    if (v.includes("app") || v.includes("mobile") || v.includes("movil")) return "app";
    return "otro";
  }, z.enum(["backend", "panel", "app", "otro"]).default("backend")),
  title: z.string().default("Tarea técnica"),
  type: z.preprocess((val) => {
    if (typeof val !== "string") return "feature";
    const v = val.toLowerCase().trim();
    if (v.includes("bug") || v.includes("fix") || v.includes("error") || v.includes("defecto")) return "bug";
    if (v.includes("refactor") || v.includes("clean") || v.includes("mejora")) return "refactor";
    if (v.includes("chore") || v.includes("tarea") || v.includes("config")) return "chore";
    if (v.includes("spike") || v.includes("investig")) return "spike";
    return "feature";
  }, z.enum(["feature", "bug", "refactor", "chore", "spike"]).default("feature")),
  priority: z.preprocess((val) => {
    if (typeof val !== "string") return "medium";
    const v = val.toLowerCase().trim();
    if (v.includes("high") || v.includes("alta") || v.includes("crit") || v.includes("urg")) return "high";
    if (v.includes("low") || v.includes("baja")) return "low";
    return "medium";
  }, z.enum(["high", "medium", "low"]).default("medium")),
  component: z.string().default("General"),
  description: z.string().default(""),
  estimation: z
    .preprocess((val) => {
      if (!val || typeof val !== "object") {
        return { backendHours: 0, panelHours: 0, appHours: 0, totalHours: 0, text: "" };
      }
      const obj = val as Record<string, any>;
      const b = Number(obj.backendHours) || 0;
      const p = Number(obj.panelHours) || 0;
      const a = Number(obj.appHours) || 0;
      const t = Number(obj.totalHours) || (b + p + a);
      const text = typeof obj.text === "string" ? obj.text : `Backend: ${b}h | Panel: ${p}h | App: ${a}h | Total: ${t}h`;
      return { backendHours: b, panelHours: p, appHours: a, totalHours: t, text };
    }, z.object({
      backendHours: z.number().default(0),
      panelHours: z.number().default(0),
      appHours: z.number().default(0),
      totalHours: z.number().default(0),
      text: z.string().default("")
    }))
    .default({ backendHours: 0, panelHours: 0, appHours: 0, totalHours: 0, text: "" }),
  openQuestions: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return ["Ninguna"];
  }, z.array(z.string())).default(["Ninguna"]),
  dependencies: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return ["Ninguna"];
  }, z.array(z.string())).default(["Ninguna"]),
  prWorkflow: z
    .string()
    .default("Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan."),
  expectedFiles: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return [];
  }, z.array(z.string())).default([]),
  acceptanceCriteria: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string") return [val];
    return [];
  }, z.array(z.string())).default([]),
  agentPrompt: z.string().default("")
});

const RepoHoursTotalsSchema = z.preprocess((val) => {
  if (!val || typeof val !== "object") {
    return { backend: 0, panel: 0, app: 0, total: 0 };
  }
  const obj = val as Record<string, any>;
  const b = Number(obj.backend) || 0;
  const p = Number(obj.panel) || 0;
  const a = Number(obj.app) || 0;
  const t = Number(obj.total) || (b + p + a);
  return { backend: b, panel: p, app: a, total: t };
}, z.object({
  backend: z.number().default(0),
  panel: z.number().default(0),
  app: z.number().default(0),
  total: z.number().default(0)
})).default({ backend: 0, panel: 0, app: 0, total: 0 });

const MeetingAnalysisJsonSchema = z.object({
  summary: z.string().default("Resumen de la reunión"),
  alreadyResolved: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  inProgress: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  keyDecisions: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  topicsDiscussed: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  globalOpenQuestions: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  issues: z.array(DevIssueSchema).default([]),
  backlog: z.preprocess((val) => (Array.isArray(val) ? val.map(String) : []), z.array(z.string())).default([]),
  repoHoursTotals: RepoHoursTotalsSchema
});

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

    // Ejecutar pipeline en 2 pasos para máxima fidelidad anti-invención
    const step1SystemPrompt = this.buildStep1Prompt(projectContext);
    const step1UserPrompt = `A continuación se presenta la transcripción completa de la reunión de desarrollo:\n\n${transcript}\n\nPor favor, extrae el resumen ejecutivo, identifica las decisiones clave, formula las preguntas abiertas globales (máximo 8, clasificadas en BLOQUEANTE o NO BLOQUEANTE, sin incluir ruido evidente) y clasifica rigurosamente cada punto tratado en: CERRADO / YA HECHO (alreadyResolved), EN CURSO (inProgress), NUEVO (newItems con marca [mm:ss]) y PARA BACKLOG (backlog), siguiendo estrictamente las REGLAS DE GENERACIÓN DE ISSUES y el formato JSON especificado.`;

    try {
      // PASO 1: Extracción, clasificación y detección de ambigüedades
      const rawStep1 = await this.executeLlmCall(step1SystemPrompt, step1UserPrompt, provider, apiKey, model, baseUrl);
      const step1Clean = this.cleanJsonString(rawStep1);
      const step1Data = JSON.parse(step1Clean);

      // PASO 2: Generación de issues técnicas por repo a partir de los puntos del Paso 1
      const step2SystemPrompt = this.buildStep2Prompt(projectContext);
      const step2UserPrompt = `A continuación se presentan los resultados de la extracción y clasificación previa (Paso 1) de la reunión:\n\n${JSON.stringify(step1Data, null, 2)}\n\nGenera los issues de programación organizados por repositorio afectado para los requerimientos NUEVOS y tareas de integración ÚNICAMENTE a partir de esta lista (sin inventar tecnologías ni detalles no presentes en el Paso 1 ni en el contexto). Aplica estrictamente las REGLAS DE GENERACIÓN DE ISSUES (crear un issue por repo, si falta endpoint de backend para panel o app créalo como PROPUESTO, si hay pregunta BLOQUEANTE marca el issue como BLOQUEADO, calcula estimaciones en horas exactas y redacta agentPrompt con las 6 secciones obligatorias) en formato JSON estricto.`;

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

      // Ensamblar ambos pasos
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

      return this.parseAndValidateResponse(JSON.stringify(merged));
    } catch (stepErr: any) {
      console.warn("[LlmMeetingAnalysisService] Fallback a análisis de paso único debido a:", stepErr.message);
      const fallbackPrompt = this.buildSingleStepPrompt(projectContext);
      const rawFallback = await this.executeLlmCall(fallbackPrompt, step1UserPrompt, provider, apiKey, model, baseUrl);
      return this.parseAndValidateResponse(rawFallback);
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

    let rawResponse = "";
    if (provider === "google-account") {
      rawResponse = await this.callGoogleAccount(systemPrompt, userPrompt, model);
    } else if (provider === "gemini") {
      rawResponse = await this.callGemini(systemPrompt, userPrompt, apiKey, model);
    } else if (provider === "groq") {
      rawResponse = await this.callGroq(systemPrompt, userPrompt, apiKey, model);
    } else {
      rawResponse = await this.callOpenAi(systemPrompt, userPrompt, apiKey, model, baseUrl);
    }

    let clean = rawResponse.trim();
    if (clean.startsWith("```markdown")) {
      clean = clean.replace(/^```markdown\s*/, "").replace(/\s*```$/, "");
    } else if (clean.startsWith("```md")) {
      clean = clean.replace(/^```md\s*/, "").replace(/\s*```$/, "");
    }
    return clean;
  }

  private scanRepositoryStructure(repoPath: string): string {
    const ignoredDirs = new Set([
      "node_modules", ".git", "dist", "build", "release", "bin", "obj",
      ".idea", ".vscode", "vendor", "target", "__pycache__", "coverage",
      ".next", ".nuxt", "out", ".turbo", "temp", "tmp"
    ]);

    const ignoredFilePatterns = [
      /\.env(\..+)?$/i,
      /\.(key|pem|pfx|p12|bin|exe|dll|so|wasm|iso|db|sqlite|sqlite3|wav|mp3|m4a|png|jpg|jpeg|gif|ico|svg|zip|tar|gz)$/i,
      /secret/i,
      /password/i
    ];

    const treeLines: string[] = [];
    const keyFileContents: { path: string; content: string }[] = [];
    let totalCharsCollected = 0;
    const MAX_TOTAL_CHARS = 35000;
    const MAX_FILE_CHARS = 5000;

    const keyFileNames = new Set([
      "readme.md", "readme", "readme.txt",
      "package.json", "tsconfig.json", "tsconfig.base.json",
      "docker-compose.yml", "docker-compose.yaml", "dockerfile",
      "pom.xml", "build.gradle", "settings.gradle",
      "requirements.txt", "pyproject.toml", "cargo.toml", "go.mod",
      "architecture.md", "contributing.md", "claude.md", "agents.md",
      ".cursorrules", ".windsurfrules"
    ]);

    const walk = (currentDir: string, currentDepth: number) => {
      if (currentDepth > 4) return;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (ignoredDirs.has(entry.name.toLowerCase())) continue;
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(repoPath, fullPath);
          if (treeLines.length < 80) {
            treeLines.push(`[DIR]  ${relPath}`);
          }
          walk(fullPath, currentDepth + 1);
        } else if (entry.isFile()) {
          const lowerName = entry.name.toLowerCase();
          if (ignoredFilePatterns.some((pattern) => pattern.test(lowerName))) continue;

          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.relative(repoPath, fullPath);
          if (treeLines.length < 80) {
            treeLines.push(`[FILE] ${relPath}`);
          }

          const isKeyManifest = keyFileNames.has(lowerName) || lowerName.endsWith(".csproj") || lowerName.endsWith(".sln");
          const isDocFile = (relPath.toLowerCase().startsWith("docs" + path.sep) || relPath.toLowerCase().startsWith("doc" + path.sep)) && lowerName.endsWith(".md");

          if ((isKeyManifest || isDocFile) && totalCharsCollected < MAX_TOTAL_CHARS) {
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              const truncated = content.slice(0, MAX_FILE_CHARS);
              keyFileContents.push({ path: relPath, content: truncated });
              totalCharsCollected += truncated.length;
            } catch {}
          }
        }
      }
    };

    walk(repoPath, 0);

    let output = "=== ÁRBOL DE DIRECTORIOS Y ARCHIVOS ===\n" + treeLines.join("\n") + "\n\n";
    output += "=== CONTENIDO DE ARCHIVOS CLAVE DE CONFIGURACIÓN Y DOCUMENTACIÓN ===\n";
    for (const file of keyFileContents) {
      output += `--- ARCHIVO: ${file.path} ---\n${file.content}\n\n`;
    }

    return output;
  }

  private async resolveProviderAndKey(options?: GenerateAnalysisOptions): Promise<{
    provider: MeetingAnalysisProvider;
    apiKey: string;
    model: string;
    baseUrl?: string;
  }> {
    const userSettings = this.deps?.settingsStore?.getSettings();
    const targetProvider = options?.provider || userSettings?.issuesDefaultProvider || "google-account";

    // 0. Si se solicita cuenta de Google (sin API Key)
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

    // 1. Si es un proveedor personalizado guardado en Settings
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
        // Evitar cruces accidentales de modelos (ej. pasar gemini-2.5-pro a deepseek)
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

    // 2. Si el usuario envía la apiKey o baseUrl directamente en options
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

    // 3. Si el usuario solicita un provider predeterminado (gemini, groq, openai)
    if (targetProvider) {
      const provider = targetProvider as MeetingAnalysisProvider;
      let key: string | null = null;
      if (this.deps?.secretVault) {
        key = await this.deps.secretVault.get(provider);
      }
      if (!key) {
        key = this.getEnvKeyForProvider(provider);
      }

      // Si es gemini y no tiene key, pero agy está en el sistema, conectar transparentemente con la cuenta de Google
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

    // 3. Detección automática: si agy CLI está instalado y autenticado, usarlo de forma preferente o fallback
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

    // Si no hay keys pero agy está en el sistema, usar la cuenta de Google automáticamente
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
        stdio: ["pipe", "pipe", "ignore"]
      }).trim();
      const firstLine = out.split(/\r?\n/)[0]?.trim();
      return firstLine || null;
    } catch {
      return null;
    }
  }

  private async callGoogleAccount(
    systemPrompt: string,
    userPrompt: string,
    model?: string
  ): Promise<string> {
    const agyPath = this.resolveAgyPath() || (process.platform === "win32" ? "agy.exe" : "agy");
    const promptText = `${systemPrompt}\n\n${userPrompt}`;

    return new Promise<string>((resolve, reject) => {
      const args = [
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--print-timeout",
        "180s"
      ];
      const knownAgyModels = [
        "gemini-3.8-flash-high",
        "gemini-3.8-flash-medium",
        "gemini-3.8-flash-low",
        "claude-sonnet-4-6",
        "claude-opus-4-6-thinking",
        "gpt-oss-120b-medium"
      ];
      if (model && knownAgyModels.includes(model.trim()) && model.trim() !== "gemini-3.8-flash-high") {
        args.push("--model", model.trim());
      } else {
        // Por defecto usar gemini-3.8-flash-low: respuesta en segundos evitando que el modelo consuma todo el presupuesto en bucles de thinking
        args.push("--model", "gemini-3.8-flash-low");
      }
      args.push("-p=");

      const child = spawn(agyPath, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: false
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf-8");
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf-8");
      });

      child.on("error", (err) => {
        reject(
          new Error(
            `Error al invocar Antigravity CLI para conectar con tu cuenta de Google: ${err.message}`
          )
        );
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Antigravity CLI terminó con código ${code}: ${stderr.trim() || stdout.trim() || "Error de sesión con Google"}`
            )
          );
          return;
        }

        let responseText = "";
        for (const line of stdout.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("{")) continue;
          try {
            const ev = JSON.parse(trimmed);
            if (ev.event === "result" && ev.result) {
              if (ev.result.error) {
                reject(new Error(`Antigravity CLI devolvió error: ${ev.result.error}`));
                return;
              }
              responseText = ev.result.response || "";
              break;
            }
          } catch {}
        }

        if (!responseText) {
          responseText = stdout;
        }

        resolve(responseText);
      });

      // Escribir el prompt en formato stream-json
      const message = JSON.stringify({
        event: "user",
        message: { content: promptText }
      });
      child.stdin.write(message + "\n");
      child.stdin.end();
    });
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
      return this.callGoogleAccount(systemPrompt, userPrompt, model);
    } else if (provider === "gemini") {
      return this.callGemini(systemPrompt, userPrompt, apiKey, model);
    } else if (provider === "groq") {
      return this.callGroq(systemPrompt, userPrompt, apiKey, model);
    } else {
      return this.callOpenAi(systemPrompt, userPrompt, apiKey, model, baseUrl);
    }
  }

  private cleanJsonString(raw: string): string {
    let clean = raw.trim();
    // 1. Si el texto completo viene envuelto en un bloque markdown ```json ... ``` retirarlo sin romper bloques internos
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*\n?/i, "");
      clean = clean.replace(/\n?\s*```\s*$/i, "");
    }
    // 2. Extraer desde la primera llave { hasta la última llave } para descartar texto conversacional previo o posterior
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
    return clean;
  }

  private getProjectGlossary(): string {
    return `### GLOSARIO DEL PROYECTO (vocabulario y errores típicos de reconocimiento de voz):
- "valida de amante" / "diamante" → Sistema DIAMANTE (Limpieza Inteligente).
- "armar el prón" / "el prón" → Prompt de IA para el agente de desarrollo.
- "aislamientos" → Término ambiguo de la transcripción (NO interpretar como "N/A" ni asumir reglas inventadas; registrar como PREGUNTA ABIERTA citando fragmento y [mm:ss]).`;
  }

  private buildStep1Prompt(projectContext?: string): string {
    const contextSection = projectContext
      ? `### CONTEXTO DEL PROYECTO:\n${projectContext}`
      : `### CONTEXTO DEL PROYECTO:\nSi no se especificó contexto adicional, infiere la tecnología y arquitectura a partir de lo discutido en la reunión.`;

    const glossarySection = this.getProjectGlossary();

    return `Eres un Principal Software Architect de élite especializado en extraer información fiel y estructurada de reuniones de desarrollo de software.

${glossarySection}

${contextSection}

INSTRUCCIONES DE CALIDAD PARA GENERAR ISSUES DESDE UNA TRANSCRIPCIÓN (Fase 1: Extracción y Clasificación)

Sigue estas reglas al pie de la letra. Si una regla choca con tu criterio de "ser útil", gana la regla.

## A. Fuente de verdad
1. Solo afirmes como hecho lo que aparece en la transcripción o en el contexto del proyecto.
2. Cita la marca de tiempo [mm:ss] que respalda cada requerimiento. Si no puedes citarla, no es un hecho: es [Supuesto] o una pregunta.
3. No inventes nombres de campos, tablas, rutas de endpoints, archivos, proyectos, librerías, estados, roles, transiciones, reglas de validación ni valores. Si necesitas uno que no existe en la fuente, escríbelo como "PROPUESTO (por confirmar)".
4. Todo criterio de aceptación que deduzcas tú se marca [Supuesto].
5. No uses tecnologías ni herramientas que no estén en el contexto del proyecto, salvo como "verificar en el repo".
6. No atribuyas una afirmación a una persona a menos que su nombre se diga en esa misma frase. La transcripción puede no distinguir hablantes.

## B. Ruido de la transcripción
7. La transcripción es automática y puede contener palabras mal reconocidas.
8. Si la corrección es evidente por contexto o por el glosario, escribe [Interpretación: lo transcrito → lo probable] y continúa.
9. Si la palabra o la frase admite varias lecturas que cambian el alcance, no elijas: lístalas y conviértela en pregunta abierta.
10. Si una cifra o dato puede referirse a cosas distintas, lista las interpretaciones.
- Si un término suena raro o no encaja con el vocabulario del dominio (ej.: "aislamientos"), NO lo interpretes (por ejemplo, NO asumas que obliga a escribir "N/A" ni asumas reglas): créalo como PREGUNTA ABIERTA citando el fragmento y la marca de tiempo [mm:ss].

## C. Clasificar antes de crear issues
Clasifica cada punto tratado en la reunión:
- CERRADO: solo si se dijo explícitamente que está cerrado o listo. No crees issue; va a "Ya resuelto" (alreadyResolved).
- EN CURSO: alguien ya lo trabaja o quedan pasos pendientes para cerrarlo (ej.: "Cristian está ajustando", "me falta revisar las notas para cerrar"). No dupliques: crea solo la parte faltante o una tarea de validación, e indica el responsable si se nombró (inProgress).
- NUEVO: crea el requerimiento nuevo indicando repos afectados ("backend", "panel", "app") y citando [mm:ss] (newItems).
- BACKLOG: se dijo que no es bloqueante o que va a una etapa posterior o de mejoras. Solo entrada de backlog, sin prompt de implementación (backlog).
Si hay pendientes, no lo pongas como cerrado.

## D. Preguntas abiertas
11. Úsalas solo cuando falta información que cambia el alcance, una regla de negocio o una decisión (horarios, nomenclatura, fuente de datos). No las uses para ruido evidente ni para cosas que el agente puede verificar leyendo el repo. Máximo 8 preguntas globales en total.
12. Clasifica cada una como BLOQUEANTE o NO BLOQUEANTE, y di: qué falta, a quién preguntar (si se mencionó) y qué hace el agente mientras tanto (lo mínimo, sin inventar).
13. Si la transcripción admite varias lecturas de una hora de corte (ej.: 06:00–19:00 vs otras), un nombre de campo o un alcance, NO fijes ninguna: pregúntala como BLOQUEANTE.
14. Si lo pedido ya existe según el contexto o las reglas de negocio (ej.: estados de novedad Abierta / En proceso / Solucionada / Cerrada; método de inicio "Ninguna"), no lo implementes desde cero: crea un requerimiento de "verificar y completar lo faltante" con una pregunta bloqueante.

## E. Alcance
17. No crees requerimientos en un repo si la transcripción no lo pide ni es consecuencia directa de otro ítem.
18. Agrupa cambios pequeños del mismo módulo en un solo ítem.

## H. Formato de salida
Orden del documento:
1. Resumen ejecutivo (sin datos inventados, 2-3 párrafos fieles exclusivamente a la transcripción).
2. Ya resuelto (alreadyResolved).
3. En curso (inProgress, con responsable si se mencionó).
4. Decisiones clave (keyDecisions).
5. Preguntas abiertas globales (globalOpenQuestions: máximo 8; ninguna sobre ruido evidente).
6. Requerimientos nuevos clasificados (newItems).
7. Backlog (backlog).

## I. Autoverificación antes de responder
Antes de entregar tu respuesta, revisa:
- [ ] ¿Cada requerimiento tiene una marca de tiempo [mm:ss] que lo respalda?
- [ ] ¿Hay algún nombre de tabla, endpoint, cliente o estado que no esté en la transcripción ni en el contexto y no esté marcado PROPUESTO?
- [ ] ¿Hay alguna librería o namespace inventado?
- [ ] ¿Algún ítem con pendientes quedó marcado como cerrado?
- [ ] ¿Hay preguntas abiertas sobre palabras cuyo significado es obvio por contexto?
Si alguna respuesta es incorrecta, corrígela antes de responder.

### FORMATO DE SALIDA (JSON ESTRICTO):
{
  "summary": "Resumen ejecutivo en 2-3 párrafos fieles exclusivamente a la transcripción...",
  "alreadyResolved": [
    "Descripción de ítem cerrado o ya resuelto citando [mm:ss]..."
  ],
  "inProgress": [
    "Descripción de ítem en curso [mm:ss], indicando responsable y qué falta o si requiere validar/integrar..."
  ],
  "newItems": [
    {
      "title": "Título técnico del requerimiento nuevo",
      "description": "Detalle técnico acordado citando marca de tiempo [mm:ss]...",
      "affectedRepos": ["backend", "panel", "app"]
    }
  ],
  "backlog": [
    "Ítem no bloqueante destinado a backlog o mejoras futuras..."
  ],
  "keyDecisions": [
    "Decisión clave 1 [mm:ss]...",
    "Decisión clave 2 [mm:ss]..."
  ],
  "globalOpenQuestions": [
    "[BLOQUEANTE] Pregunta sobre ambigüedad de negocio citando fragmento y [mm:ss]. Qué falta, a quién preguntar y qué hacer provisionalmente.",
    "[NO BLOQUEANTE] Pregunta sobre decisión no bloqueante..."
  ],
  "topicsDiscussed": [
    "Tema principal 1...",
    "Tema principal 2..."
  ]
}`;
  }

  private buildStep2Prompt(projectContext?: string): string {
    const todayFormatted = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const contextSection = projectContext
      ? `### CONTEXTO DEL PROYECTO:\n${projectContext}`
      : `### CONTEXTO DEL PROYECTO:\nInfiere la tecnología y arquitectura a partir del contexto provisto.`;

    const glossarySection = this.getProjectGlossary();

    return `Eres un Principal Software Architect y Technical Lead de élite especializado en generar issues técnicas para Agentes de IA (Cursor, Antigravity, Claude Code).

${glossarySection}

${contextSection}

A partir de la lista de requerimientos NUEVOS, en curso y preguntas abiertas clasificados en la fase previa (Paso 1), debes generar los Issues de programación definitivos ÚNICAMENTE a partir de esa lista (sin volver a la transcripción para inventar detalles) y verificar aritméticamente las estimaciones en horas.

INSTRUCCIONES DE CALIDAD PARA GENERAR ISSUES DESDE UNA TRANSCRIPCIÓN (Fase 2: Redacción de Issues y Verificación)

Sigue estas reglas al pie de la letra. Si una regla choca con tu criterio de "ser útil", gana la regla.

## A. Fuente de verdad
1. Solo afirma como hecho lo registrado explícitamente en el Paso 1 o en el contexto del proyecto.
2. Cita la marca de tiempo [mm:ss] que respalda cada requerimiento en cada issue.
3. No inventes nombres de campos, tablas, rutas de endpoints, archivos, proyectos, librerías, estados, roles, transiciones, reglas de validación ni valores. Si necesitas uno que no existe en la fuente, escríbelo como "PROPUESTO (por confirmar)".
4. Todo criterio de aceptación que deduzcas tú se marca [Supuesto].
5. No uses tecnologías ni herramientas que no estén en el contexto del proyecto, salvo como "verificar en el repo".
6. No atribuyas una afirmación a una persona a menos que su nombre se diga en esa misma frase.

## D. Preguntas abiertas y bloqueo
13. Si un ítem tiene una pregunta BLOQUEANTE, crea el issue como BLOQUEADO: sin script SQL, sin criterios inventados y sin estimación definitiva. Estima solo cuando el alcance esté confirmado (indicar 0h o marcar pendiente de confirmación en el texto de estimación).
14. Si lo pedido ya existe según el contexto o las reglas de negocio (ej.: estados de novedad Abierta / En proceso / Solucionada / Cerrada; método de inicio "Ninguna"), no lo implementes desde cero: crea un issue de "verificar y completar lo faltante" con una pregunta bloqueante.

## E. Alcance y dependencias
15. Crea UN issue por repositorio afectado (backend / panel / app); nunca mezcles repos en un issue.
16. Si el panel o la app necesitan un endpoint o servicio (borrado masivo, exportación, reprogramación, etc.) y no se menciona como existente, crea también el issue de backend correspondiente marcado PROPUESTO y enlázalo con "Depende de ISSUE-N". No dejes horas de un repo sin la dependencia que las hace posibles.
17. No crees issues en un repo si no fue solicitado ni es consecuencia directa de otro issue. Marca las consecuencias como [Derivado de ISSUE-N].
18. Agrupa cambios pequeños del mismo módulo en un solo issue.
19. Respeta las fronteras entre repos y capas descritas en el contexto del proyecto:
   - backend: Controllers/, Controllers/Mobile/, Logic/, Logic/Mobile/, Models/DTOs/Mobile/, db_changes/ (scripts AAAAMMDD_0NN, ej.: ${todayFormatted}_001.sql).
   - panel: componente → hook → servicio → httpClient → API (más adaptadores).
   - app: expo-router, SQLite + cola de sincronización. La app móvil NO modifica endpoints compartidos del panel: lo nuevo va en /api/mobile/... (Controllers/Mobile/, Logic/Mobile/).
   - PROHIBIDO inventar nombres de proyectos o namespaces (ej.: Diamante.API, Diamante.Core, Diamante.Data).
   - En "expectedFiles" sugiere carpetas o módulos, no rutas de archivo concretas, y rotúlalos "(verificar en el repo)".
   - Stack cerrado: backend = xUnit; panel = pruebas unitarias + Playwright; app = Jest + tsc. No nombres librerías (FluentValidation, Yup, Zod, ClosedXML, EPPlus, TanStack, etc.) salvo como "(verificar en el repo)".
- "Dependencias entre PR": qué debe entrar antes en dev. Escribe "Ninguna" solo si es cierto; si la app consume un endpoint nuevo, la dependencia NO es "Ninguna".
- Flujo de PR: "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan."

## F. Estimación
20. Horas por repo en cada issue y total por issue: "Backend: Xh | Panel: Yh | App: Zh | Total: Th". Como el issue pertenece a un único repo, las horas del repo asignado serán > 0 y las de los otros repos 0h.
21. Incluye siempre en las horas lo que el contexto del proyecto exige:
   - Script SQL en db_changes (con fecha de hoy ${todayFormatted}, formato AAAAMMDD_0NN, ej.: ${todayFormatted}_001.sql, solo si hay columnas nuevas).
   - Pruebas (xUnit / Playwright + unitarias / Jest).
   - Actualización de docs/REGLAS_DE_NEGOCIO.md.
   - Capturas para el PR y revisión de Juan.
   - Si afecta a la app: considera modo sin conexión (SQLite + cola de sincronización) y pantallas de mínimo 360x640.
22. Al final calcula los totales por repo sumando issue por issue ("backend", "panel", "app", y total general). Verifica la suma antes de escribirla; no uses "~" si puedes calcular.
23. Indica en los totales qué issues dependen de elementos PROPUESTOS o BLOQUEADOS.

## G. Prompt de cada issue (para el agente de código)
24. Secciones obligatorias para agentPrompt, con estas secciones exactas en este orden:
   ### Rol y Objetivo
   ### Contexto
   ### Pasos numerados
   ### Restricciones
   ### Criterios de Aceptación
   ### Verificación
25. El primer paso es leer los documentos de contexto del repo (AI_CONTEXT.md / CLAUDE.md / CONTEXTO.md / BITACORA.md y docs/REGLAS_DE_NEGOCIO.md).
26. Si hay algo PENDIENTE sin resolver en el issue, escribe: "Si esta parte no está resuelta en este issue, detente, reporta la duda en el PR y no implementes esa parte". NO escribas "confirma con el líder funcional" (un agente no puede hacerlo).
27. No nombres carpetas, librerías ni namespaces que no estén en el contexto del proyecto.
28. Sugiere carpetas o módulos, no rutas de archivo concretas, y rotúlalos "(verificar en el repo)".

## H. Formato de salida
Issues agrupados por repositorio y totales de horas por repositorio calculados con suma exacta.

## I. Autoverificación antes de responder
Antes de entregar tu respuesta, revisa:
- [ ] ¿Cada requerimiento tiene una marca de tiempo [mm:ss] que lo respalda?
- [ ] ¿Hay algún nombre de tabla, endpoint, cliente o estado que no esté en la transcripción ni en el contexto y no esté marcado PROPUESTO?
- [ ] ¿Hay alguna librería o namespace inventado?
- [ ] ¿Los ítems bloqueados tienen script SQL o estimación definitiva? (No deberían tenerlos).
- [ ] ¿Los totales de horas coinciden con la suma issue por issue?
- [ ] ¿Algún ítem con pendientes quedó marcado como cerrado?
- [ ] ¿Hay preguntas abiertas sobre palabras cuyo significado es obvio por contexto?
Si alguna respuesta es incorrecta, corrígela antes de responder.

### FORMATO DE SALIDA (JSON ESTRICTO):
{
  "issues": [
    {
      "id": "BACKEND-1",
      "repo": "backend",
      "title": "[Backend] Título técnico imperativo",
      "type": "feature",
      "priority": "high",
      "component": "Controllers / Logic",
      "description": "Descripción clara citando [mm:ss] sin inventar campos...",
      "estimation": {
        "backendHours": 4,
        "panelHours": 0,
        "appHours": 0,
        "totalHours": 4,
        "text": "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
      },
      "openQuestions": ["Ninguna"],
      "dependencies": ["Ninguna"],
      "prWorkflow": "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan.",
      "expectedFiles": ["Controllers/ (verificar en el repo)", "Logic/ (verificar en el repo)", "db_changes/${todayFormatted}_001.sql", "docs/REGLAS_DE_NEGOCIO.md"],
      "acceptanceCriteria": [
        "Criterio explícito respaldado en [mm:ss]",
        "[Supuesto] Criterio deducido..."
      ],
      "agentPrompt": "### Rol y Objetivo\\nActúa como...\\n\\n### Contexto\\n...\\n\\n### Pasos numerados\\n1. Leer AI_CONTEXT.md y docs/REGLAS_DE_NEGOCIO.md\\n2. ...\\n\\n### Restricciones\\n...\\n\\n### Criterios de Aceptación\\n- [ ] ...\\n\\n### Verificación\\n..."
    }
  ],
  "repoHoursTotals": {
    "backend": 4,
    "panel": 0,
    "app": 0,
    "total": 4
  }
}`;
  }

  private buildSingleStepPrompt(projectContext?: string): string {
    const todayFormatted = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const contextSection = projectContext
      ? `### CONTEXTO DEL PROYECTO:\n${projectContext}`
      : `### CONTEXTO DEL PROYECTO:\nInfiere la tecnología y arquitectura a partir del contexto provisto.`;

    const glossarySection = this.getProjectGlossary();

    return `Eres un Principal Software Architect y Technical Lead de élite especializado en convertir reuniones técnicas en documentación accionable e issues de software listas para ser ejecutadas por Agentes de Inteligencia Artificial (ej. Cursor, Antigravity, Claude Code).

${glossarySection}

${contextSection}

INSTRUCCIONES DE CALIDAD PARA GENERAR ISSUES DESDE UNA TRANSCRIPCIÓN

Sigue estas reglas al pie de la letra. Si una regla choca con tu criterio de "ser útil", gana la regla.

## A. Fuente de verdad
1. Solo afirmes como hecho lo que aparece en la transcripción o en el contexto del proyecto.
2. Cita la marca de tiempo [mm:ss] que respalda cada requerimiento. Si no puedes citarla, no es un hecho: es [Supuesto] o una pregunta.
3. No inventes nombres de campos, tablas, rutas de endpoints, archivos, proyectos, librerías, estados, roles, transiciones, reglas de validación ni valores. Si necesitas uno que no existe en la fuente, escríbelo como "PROPUESTO (por confirmar)".
4. Todo criterio de aceptación que deduzcas tú se marca [Supuesto].
5. No uses tecnologías ni herramientas que no estén en el contexto del proyecto, salvo como "verificar en el repo".
6. No atribuyas una afirmación a una persona a menos que su nombre se diga en esa misma frase. La transcripción puede no distinguir hablantes.

## B. Ruido de la transcripción
7. La transcripción es automática y puede contener palabras mal reconocidas.
8. Si la corrección es evidente por contexto o por el glosario, escribe [Interpretación: lo transcrito → lo probable] y continúa.
9. Si la palabra o la frase admite varias lecturas que cambian el alcance, no elijas: lístalas y conviértela en pregunta abierta.
10. Si una cifra o dato puede referirse a cosas distintas, lista las interpretaciones.
- Si un término suena raro o no encaja con el vocabulario del dominio (ej.: "aislamientos"), NO lo interpretes (por ejemplo, NO asumas que obliga a escribir "N/A" ni asumas reglas): créalo como PREGUNTA ABIERTA citando el fragmento y la marca de tiempo [mm:ss].

## C. Clasificar antes de crear issues
Clasifica cada punto tratado en la reunión:
- CERRADO: solo si se dijo explícitamente que está cerrado o listo. No crees issue; va a "Ya resuelto" (alreadyResolved).
- EN CURSO: alguien ya lo trabaja o quedan pasos pendientes para cerrarlo (ej.: "Cristian está ajustando", "me falta revisar las notas para cerrar"). No dupliques: crea solo la parte faltante o una tarea de validación, e indica el responsable si se nombró (inProgress).
- NUEVO: crea el issue (issues).
- BACKLOG: se dijo que no es bloqueante o que va a una etapa posterior. Solo entrada de backlog, sin prompt de implementación (backlog).
Si hay pendientes, no lo pongas como cerrado.

## D. Preguntas abiertas
11. Úsalas solo cuando falta información que cambia el alcance, una regla de negocio o una decisión (horarios, nomenclatura, fuente de datos). No las uses para ruido evidente ni para cosas que el agente puede verificar leyendo el repo. Máximo 8 preguntas globales en total.
12. Clasifica cada una como BLOQUEANTE o NO BLOQUEANTE, y di: qué falta, a quién preguntar (si se mencionó) y qué hace el agente mientras tanto (lo mínimo, sin inventar).
13. Si un ítem tiene una pregunta BLOQUEANTE, crea el issue como BLOQUEADO: sin script SQL, sin criterios inventados y sin estimación definitiva. Estima solo cuando el alcance esté confirmado (indicar 0h o marcar pendiente de confirmación).
14. Si lo pedido ya existe según el contexto o las reglas de negocio (ej.: estados de novedad Abierta / En proceso / Solucionada / Cerrada; método de inicio "Ninguna"), no lo implementes desde cero: crea un issue de "verificar y completar lo faltante" con una pregunta bloqueante.

## E. Alcance y dependencias
15. Crea un issue por repositorio afectado (backend / panel / app); no mezcles repos en uno solo.
16. Si un repo necesita un endpoint o servicio que la transcripción no dice que exista (borrado masivo, exportación, reprogramación, etc.), crea también el issue del repo dueño marcado PROPUESTO y enlázalo con "Depende de ISSUE-N". No dejes horas de un repo sin la dependencia que las hace posibles.
17. No crees issues en un repo si la transcripción no lo pide ni es consecuencia directa de otro issue. Marca las consecuencias como [Derivado de ISSUE-N].
18. Agrupa cambios pequeños del mismo módulo en un solo issue.
19. Respeta las fronteras entre repos y capas descritas en el contexto del proyecto:
   - backend: Controllers/, Controllers/Mobile/, Logic/, Logic/Mobile/, Models/DTOs/Mobile/, db_changes/ (scripts AAAAMMDD_0NN, ej.: ${todayFormatted}_001.sql).
   - panel: componente → hook → servicio → httpClient → API (más adaptadores).
   - app: expo-router, SQLite + cola de sincronización. La app móvil NO modifica endpoints compartidos del panel: lo nuevo va en /api/mobile/... (Controllers/Mobile/, Logic/Mobile/).
   - PROHIBIDO inventar nombres de proyectos o namespaces (ej.: Diamante.API, Diamante.Core, Diamante.Data).
   - En "expectedFiles" sugiere carpetas o módulos, no rutas de archivo concretas, y rotúlalos "(verificar en el repo)".
   - Stack cerrado: backend = xUnit; panel = pruebas unitarias + Playwright; app = Jest + tsc. No nombres librerías (FluentValidation, Yup, Zod, ClosedXML, EPPlus, TanStack, etc.) salvo como "(verificar en el repo)".
- "Dependencias entre PR": qué debe entrar antes en dev. Escribe "Ninguna" solo si es cierto; si la app consume un endpoint nuevo, la dependencia NO es "Ninguna".
- Flujo de PR: "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan."

## F. Estimación
20. Horas por repo en cada issue y total por issue: "Backend: Xh | Panel: Yh | App: Zh | Total: Th".
21. Incluye siempre en las horas lo que el contexto del proyecto exige:
   - Script SQL en db_changes (con fecha de hoy ${todayFormatted}, formato AAAAMMDD_0NN, ej.: ${todayFormatted}_001.sql, solo si hay columnas nuevas).
   - Pruebas (xUnit / Playwright + unitarias / Jest).
   - Actualización de docs/REGLAS_DE_NEGOCIO.md.
   - Capturas para el PR y revisión de Juan.
   - Si afecta a la app: considera el modo sin conexión (SQLite + cola de sincronización) y pantallas de mínimo 360x640.
22. Al final suma por repo y el total general, verificando la aritmética antes de escribirla. No uses "~" si puedes calcular.
23. Indica en los totales qué issues dependen de elementos PROPUESTOS o BLOQUEADOS.

## G. Prompt de cada issue (para el agente de código)
24. Secciones obligatorias para agentPrompt, en este orden:
   ### Rol y Objetivo
   ### Contexto
   ### Pasos numerados
   ### Restricciones
   ### Criterios de Aceptación
   ### Verificación
25. El primer paso es leer los documentos de contexto del repo (AI_CONTEXT.md / CLAUDE.md / CONTEXTO.md / BITACORA.md y docs/REGLAS_DE_NEGOCIO.md).
26. Si hay algo PENDIENTE sin resolver en el issue, escribe: "Si esta parte no está resuelta en este issue, detente, reporta la duda en el PR y no implementes esa parte". NO escribas "confirma con el líder funcional" (un agente no puede hacerlo).
27. No nombres carpetas, librerías ni namespaces que no estén en el contexto del proyecto.
28. Sugiere carpetas o módulos, no rutas de archivo concretas, y rotúlalos "(verificar en el repo)".

## H. Formato de salida
Orden del documento:
1. Resumen ejecutivo (sin datos inventados).
2. Ya resuelto.
3. En curso (con responsable si se mencionó).
4. Decisiones clave.
5. Preguntas abiertas globales (máximo 8; ninguna sobre ruido evidente).
6. Issues agrupados por repositorio.
7. Backlog.
8. Totales de horas por repositorio y total general (con aritmética verificada).

## I. Autoverificación antes de responder
Antes de entregar tu respuesta, revisa:
- [ ] ¿Cada requerimiento tiene una marca de tiempo [mm:ss] que lo respalda?
- [ ] ¿Hay algún nombre de tabla, endpoint, cliente o estado que no esté en la transcripción ni en el contexto y no esté marcado PROPUESTO?
- [ ] ¿Hay alguna librería o namespace inventado?
- [ ] ¿Los ítems bloqueados tienen script SQL o estimación definitiva? (No deberían tenerlos).
- [ ] ¿Los totales de horas coinciden con la suma issue por issue?
- [ ] ¿Algún ítem con pendientes quedó marcado como cerrado?
- [ ] ¿Hay preguntas abiertas sobre palabras cuyo significado es obvio por contexto?
Si alguna respuesta es incorrecta, corrígela antes de responder.

### FORMATO DE SALIDA (JSON ESTRICTO):
{
  "summary": "Resumen ejecutivo en 2-3 párrafos fieles exclusivamente a la transcripción...",
  "alreadyResolved": [
    "Descripción de ítem cerrado o ya resuelto citando [mm:ss]..."
  ],
  "inProgress": [
    "Descripción de ítem en curso citando [mm:ss], indicando responsable y qué falta..."
  ],
  "keyDecisions": [
    "Decisión clave 1 [mm:ss]...",
    "Decisión clave 2 [mm:ss]..."
  ],
  "topicsDiscussed": [
    "Tema principal 1...",
    "Tema principal 2..."
  ],
  "globalOpenQuestions": [
    "[BLOQUEANTE] Pregunta sobre ambigüedad de negocio citando fragmento y [mm:ss]...",
    "[NO BLOQUEANTE] Pregunta no bloqueante..."
  ],
  "issues": [
    {
      "id": "BACKEND-1",
      "repo": "backend",
      "title": "[Backend] Título técnico imperativo",
      "type": "feature",
      "priority": "high",
      "component": "Controllers / Logic",
      "description": "Descripción clara citando [mm:ss] sin inventar campos...",
      "estimation": {
        "backendHours": 4,
        "panelHours": 0,
        "appHours": 0,
        "totalHours": 4,
        "text": "Backend: 4h | Panel: 0h | App: 0h | Total: 4h"
      },
      "openQuestions": ["Ninguna"],
      "dependencies": ["Ninguna"],
      "prWorkflow": "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan.",
      "expectedFiles": ["Controllers/ (verificar en el repo)", "Logic/ (verificar en el repo)", "db_changes/${todayFormatted}_001.sql", "docs/REGLAS_DE_NEGOCIO.md"],
      "acceptanceCriteria": [
        "Criterio explícito respaldado en [mm:ss]",
        "[Supuesto] Criterio deducido..."
      ],
      "agentPrompt": "### Rol y Objetivo\\nActúa como...\\n\\n### Contexto\\n...\\n\\n### Pasos numerados\\n1. Leer AI_CONTEXT.md y docs/REGLAS_DE_NEGOCIO.md\\n2. ...\\n\\n### Restricciones\\n...\\n\\n### Criterios de Aceptación\\n- [ ] ...\\n\\n### Verificación\\n..."
    }
  ],
  "backlog": [
    "Ítem no bloqueante destinado a backlog o mejoras futuras..."
  ],
  "repoHoursTotals": {
    "backend": 4,
    "panel": 0,
    "app": 0,
    "total": 4
  }
}`;
  }

  private async callGemini(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    model: string
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    };

    const controller = new AbortController();
    const timeoutMs = 360000; // 6 minutos para dar tiempo suficiente a transcripciones extensas
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Gemini API respondió con error ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = (await res.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Gemini API no devolvió contenido de texto en la respuesta.");
      }
      return text;
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.toLowerCase().includes("aborted")) {
        throw new Error(
          `La generación con Gemini excedió el tiempo límite (${timeoutMs / 60000} minutos). Para reuniones muy extensas, el modelo tardó más de lo esperado en procesar el audio completo.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callGroq(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    model: string
  ): Promise<string> {
    const url = "https://api.groq.com/openai/v1/chat/completions";

    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    };

    const controller = new AbortController();
    const timeoutMs = 360000; // 6 minutos para permitir transcripciones largas
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Groq API respondió con error ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("Groq API no devolvió contenido en la respuesta.");
      }
      return text;
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.toLowerCase().includes("aborted")) {
        throw new Error(
          `La generación con Groq excedió el tiempo límite (${timeoutMs / 60000} minutos).`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenAi(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<string> {
    const rawBase = baseUrl || process.env["OPENAI_BASE_URL"] || "https://api.openai.com/v1";
    const cleanBase = rawBase.replace(/\/+$/, "");
    const url = cleanBase.endsWith("/chat/completions") ? cleanBase : `${cleanBase}/chat/completions`;

    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    };

    const controller = new AbortController();
    const timeoutMs = 360000; // 6 minutos para modelos de razonamiento (ej. DeepSeek Flash, R1) y reuniones extensas
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        // Si el proveedor personalizado no soporta response_format: { type: "json_object" }, reintentar sin ese parámetro
        if (res.status === 400 && errorText.toLowerCase().includes("response_format")) {
          const fallbackBody = { ...requestBody };
          delete (fallbackBody as any).response_format;
          const retryRes = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(fallbackBody),
            signal: controller.signal
          });
          if (retryRes.ok) {
            const data = (await retryRes.json()) as any;
            const text = data?.choices?.[0]?.message?.content;
            if (text) return text;
          }
        }
        throw new Error(`El proveedor de IA respondió con error ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = (await res.json()) as any;
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("OpenAI API no devolvió contenido en la respuesta.");
      }
      return text;
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.toLowerCase().includes("aborted")) {
        throw new Error(
          `La llamada al proveedor de IA excedió el tiempo límite de espera (${timeoutMs / 60000} minutos). Para reuniones extensas o modelos de razonamiento profundo (como DeepSeek Flash / R1), el modelo tardó más de lo esperado en procesar los miles de tokens de audio y redactar las tareas.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAndValidateResponse(rawJson: string): GeneratedMeetingData {
    const clean = this.cleanJsonString(rawJson);

    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch (e: any) {
      throw new Error(`Error al parsear el JSON generado por el modelo: ${e.message}\nContenido recibido: ${clean.slice(0, 200)}`);
    }

    if (Array.isArray(parsed)) {
      parsed = { issues: parsed };
    }

    let sumBackend = 0;
    let sumPanel = 0;
    let sumApp = 0;

    // Asegurar IDs únicos si vinieron repetidos o vacíos y sumar horas por repo
    const seenIds = new Set<string>();
    const rawIssues: unknown[] = Array.isArray(parsed?.issues) ? parsed.issues : [];
    const sanitizedIssues: DevIssueDto[] = [];

    rawIssues.forEach((rawIssue, index) => {
      if (!rawIssue || typeof rawIssue !== "object") return;
      const parseResult = DevIssueSchema.safeParse(rawIssue);
      if (parseResult.success) {
        const issue = parseResult.data;
        let id = issue.id || `ISSUE-${index + 1}`;
        if (seenIds.has(id)) {
          id = `ISSUE-${index + 1}`;
        }
        seenIds.add(id);

        const bHours = Number(issue.estimation?.backendHours) || 0;
        const pHours = Number(issue.estimation?.panelHours) || 0;
        const aHours = Number(issue.estimation?.appHours) || 0;
        const totHours = bHours + pHours + aHours;
        sumBackend += bHours;
        sumPanel += pHours;
        sumApp += aHours;

        const estimationText =
          issue.estimation?.text || `Backend: ${bHours}h | Panel: ${pHours}h | App: ${aHours}h | Total: ${totHours}h`;

        sanitizedIssues.push({
          id,
          repo: issue.repo,
          title: issue.title,
          type: issue.type,
          priority: issue.priority,
          component: issue.component,
          description: issue.description,
          estimation: {
            backendHours: bHours,
            panelHours: pHours,
            appHours: aHours,
            totalHours: totHours,
            text: estimationText
          },
          openQuestions: issue.openQuestions && issue.openQuestions.length > 0 ? issue.openQuestions : ["Ninguna"],
          dependencies: issue.dependencies && issue.dependencies.length > 0 ? issue.dependencies : ["Ninguna"],
          prWorkflow:
            issue.prWorkflow ||
            "Rama corta desde dev, PR a dev, skill /revisar-entrega, captura de la prueba en pantalla y revisión de Juan.",
          expectedFiles: issue.expectedFiles || [],
          acceptanceCriteria: issue.acceptanceCriteria || [],
          agentPrompt: issue.agentPrompt
        });
      } else {
        console.warn(`[LlmMeetingAnalysisService] Issue #${index + 1} fue adaptado con valores por defecto:`, parseResult.error.message);
      }
    });

    const toStringArray = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.map((item) => String(item).trim()).filter(Boolean);
      if (typeof val === "string" && val.trim()) return [val.trim()];
      return [];
    };

    const verifiedTotals = {
      backend: sumBackend,
      panel: sumPanel,
      app: sumApp,
      total: sumBackend + sumPanel + sumApp
    };

    const summary = typeof parsed?.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "Resumen técnico de la reunión";

    return {
      summary,
      alreadyResolved: toStringArray(parsed?.alreadyResolved),
      inProgress: toStringArray(parsed?.inProgress),
      keyDecisions: toStringArray(parsed?.keyDecisions),
      topicsDiscussed: toStringArray(parsed?.topicsDiscussed),
      globalOpenQuestions: toStringArray(parsed?.globalOpenQuestions),
      issues: sanitizedIssues,
      backlog: toStringArray(parsed?.backlog),
      repoHoursTotals: verifiedTotals
    };
  }
}
