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
  title: z.string(),
  type: z.enum(["feature", "bug", "refactor", "chore", "spike"]).default("feature"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  component: z.string().default("General"),
  description: z.string(),
  expectedFiles: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  agentPrompt: z.string()
});

const MeetingAnalysisJsonSchema = z.object({
  summary: z.string(),
  keyDecisions: z.array(z.string()).default([]),
  topicsDiscussed: z.array(z.string()).default([]),
  issues: z.array(DevIssueSchema).default([])
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

    const systemPrompt = this.buildSystemPrompt(projectContext);
    const userPrompt = `A continuación se presenta la transcripción completa de la reunión de desarrollo:\n\n${transcript}\n\nPor favor, genera el resumen estructurado y las issues para programación optimizadas para agentes de IA siguiendo el formato JSON especificado.`;

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

    return this.parseAndValidateResponse(rawResponse);
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
      (p) => p.id === targetProvider || p.name === targetProvider
    );
    if (customConfig) {
      const savedKey = this.deps?.secretVault
        ? await this.deps.secretVault.get(customConfig.id)
        : null;
      const apiKey = options?.apiKey || savedKey || customConfig.apiKey || "dummy-key";
      return {
        provider: "custom",
        apiKey,
        model: options?.model || customConfig.defaultModel || "default",
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
      return { provider, apiKey: options.apiKey || "dummy-key", model, baseUrl: options.baseUrl };
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
      if (model && knownAgyModels.includes(model.trim())) {
        args.push("--model", model.trim());
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
    }
  }

  private buildSystemPrompt(projectContext?: string): string {
    const contextSection = projectContext
      ? `\n### CONTEXTO DEL PROYECTO PROPORCIONADO POR EL EQUIPO:\n${projectContext}\n`
      : `\n### CONTEXTO GENERAL DEL PROYECTO:\nSi no se especificó contexto adicional, infiere la tecnología y arquitectura a partir de lo discutido en la reunión.\n`;

    return `Eres un Principal Software Architect y Technical Lead de élite especializado en convertir reuniones técnicas en documentación accionable e issues de software listas para ser ejecutadas por Agentes de Inteligencia Artificial (ej. Cursor, Antigravity, Claude Code, GitHub Copilot).
${contextSection}
### TUS OBJETIVOS:
1. Proporcionar un **resumen ejecutivo** de la reunión, resaltando los objetivos, el estado del proyecto y los acuerdos principales.
2. Identificar las **decisiones clave** (arquitectura, librerías, diseño, prioridades).
3. Identificar los **temas principales tratados** en la reunión.
4. Desglosar todo el trabajo acordado en **Issues de programación individuales y atómicas**, específicamente estructuradas para que un Agente de IA las implemente con máxima autonomía y sin ambigüedades.

### REQUISITOS CRÍTICOS PARA CADA ISSUE:
- **id**: Identificador correlativo legible (ej. "ISSUE-1", "ISSUE-2").
- **title**: Título conciso, técnico y en formato imperativo (ej. "[Backend] Implementar endpoint POST /api/webhooks con validación HMAC").
- **type**: Uno de los siguientes valores exactos: "feature" | "bug" | "refactor" | "chore" | "spike".
- **priority**: Uno de: "high" | "medium" | "low".
- **component**: Módulo o capa técnica afectada (ej. "Frontend / UI", "Backend / API", "Database / Migrations", "DevOps / CI").
- **description**: Explicación clara y detallada del requerimiento o problema detectado en la reunión.
- **expectedFiles**: Lista de rutas de archivos o módulos que previsiblemente deben crearse o modificarse según el contexto del proyecto (ej. ["backend/src/routes/webhook.ts", "backend/src/services/webhookService.ts"]).
- **acceptanceCriteria**: Lista de criterios de aceptación verificables (checklist en estilo Definition of Done). Cada criterio debe ser claro y testeable.
- **agentPrompt**: UN PROMPT COMPLETO Y ROBUSTO EN FORMATO MARKDOWN, OPTIMIZADO PARA ENTREGAR DIRECTAMENTE A UN AGENTE DE IA (Cursor, Antigravity, Claude Code).
  El agentPrompt debe contener:
  * Rol del agente ("Actúa como un desarrollador senior especializado en...")
  * Objetivo de la tarea
  * Contexto relevante del proyecto y de la reunión
  * Pasos guiados de implementación
  * Archivos a tocar
  * Restricciones técnicas y de estilo
  * Criterios de aceptación (con checkboxes '- [ ]')
  * Comandos de verificación / pruebas esperadas.

### FORMATO DE SALIDA REQUERIDO (JSON ESTRICTO):
Debes responder ÚNICAMENTE con un objeto JSON válido con la siguiente estructura (sin texto antes ni después):
{
  "summary": "Resumen ejecutivo en 2-4 párrafos estructurados...",
  "keyDecisions": [
    "Decisión 1...",
    "Decisión 2..."
  ],
  "topicsDiscussed": [
    "Tema 1...",
    "Tema 2..."
  ],
  "issues": [
    {
      "id": "ISSUE-1",
      "title": "...",
      "type": "feature",
      "priority": "high",
      "component": "...",
      "description": "...",
      "expectedFiles": ["..."],
      "acceptanceCriteria": [
        "El endpoint responde 200 cuando el payload es válido",
        "Retorna 400 con mensaje explicativo si falta el campo X"
      ],
      "agentPrompt": "### Rol y Objetivo\\nActúa como...\\n\\n### Contexto\\n...\\n\\n### Tarea...\\n\\n### Criterios de Aceptación\\n- [ ] ...\\n\\n### Verificación\\n..."
    }
  ]
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
    const timeout = setTimeout(() => controller.abort(), 120000);

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
    const timeout = setTimeout(() => controller.abort(), 120000);

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
    const timeout = setTimeout(() => controller.abort(), 120000);

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
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAndValidateResponse(rawJson: string): GeneratedMeetingData {
    let clean = rawJson.trim();
    if (clean.startsWith("```json")) {
      clean = clean.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (clean.startsWith("```")) {
      clean = clean.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(clean);
    } catch (e: any) {
      throw new Error(`Error al parsear el JSON generado por el modelo: ${e.message}\nContenido recibido: ${clean.slice(0, 200)}`);
    }

    const validated = MeetingAnalysisJsonSchema.parse(parsed);

    // Asegurar IDs únicos si vinieron repetidos o vacíos
    const seenIds = new Set<string>();
    const sanitizedIssues: DevIssueDto[] = validated.issues.map((issue, index) => {
      let id = issue.id || `ISSUE-${index + 1}`;
      if (seenIds.has(id)) {
        id = `ISSUE-${index + 1}`;
      }
      seenIds.add(id);

      return {
        id,
        title: issue.title,
        type: issue.type,
        priority: issue.priority,
        component: issue.component,
        description: issue.description,
        expectedFiles: issue.expectedFiles || [],
        acceptanceCriteria: issue.acceptanceCriteria || [],
        agentPrompt: issue.agentPrompt
      };
    });

    return {
      summary: validated.summary,
      keyDecisions: validated.keyDecisions,
      topicsDiscussed: validated.topicsDiscussed,
      issues: sanitizedIssues
    };
  }
}
