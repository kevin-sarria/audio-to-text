import { spawn } from "node:child_process";

function cleanLlmModelId(raw?: string): string {
  if (!raw) return "";
  const match = raw.match(/\(([^)]+)\)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return raw.replace(/^models\//i, "").trim();
}

export class LlmProviderClients {
  public static async callGoogleAccount(
    agyPath: string,
    systemPrompt: string,
    userPrompt: string,
    model?: string
  ): Promise<string> {
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
      const targetModel = cleanLlmModelId(model);
      if (targetModel && knownAgyModels.includes(targetModel) && targetModel !== "gemini-3.8-flash-high") {
        args.push("--model", targetModel);
      } else {
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

      const message = JSON.stringify({
        event: "user",
        message: { content: promptText }
      });
      child.stdin.write(message + "\n");
      child.stdin.end();
    });
  }

  public static async callGemini(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    model: string
  ): Promise<string> {
    const cleanModel = cleanLlmModelId(model) || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`;

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
    const timeoutMs = 360000;
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
          `La generación con Gemini excedió el tiempo límite (${timeoutMs / 60000} minutos).`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  public static async callGroq(
    systemPrompt: string,
    userPrompt: string,
    apiKey: string,
    model: string
  ): Promise<string> {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const cleanModel = cleanLlmModelId(model) || "whisper-large-v3-turbo";

    const requestBody = {
      model: cleanModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    };

    const controller = new AbortController();
    const timeoutMs = 360000;
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

  public static async callOpenAi(
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
    const timeoutMs = 360000;
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
          `La llamada al proveedor de IA excedió el tiempo límite de espera (${timeoutMs / 60000} minutos).`
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
