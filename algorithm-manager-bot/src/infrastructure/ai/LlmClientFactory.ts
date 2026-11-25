export interface LlmClientOptions {
  provider?: "gemini" | "openai" | "heuristic";
  apiKey?: string;
  model?: string;
}

export class LlmClientFactory {
  public static createCaller(
    options?: LlmClientOptions
  ): ((system: string, user: string) => Promise<string>) | undefined {
    const apiKey = options?.apiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return undefined;
    }

    const provider = options?.provider || (process.env.GEMINI_API_KEY ? "gemini" : "openai");

    if (provider === "gemini" && apiKey) {
      const model = options?.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";
      return async (system: string, user: string): Promise<string> => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2
            }
          })
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`[LlmClientFactory] Error Gemini API (${res.status}): ${errText.slice(0, 200)}`);
        }

        const data = (await res.json()) as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new Error("[LlmClientFactory] Respuesta vacía de Gemini API");
        }
        return text;
      };
    }

    if (provider === "openai" && apiKey) {
      const model = options?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
      return async (system: string, user: string): Promise<string> => {
        const url = "https://api.openai.com/v1/chat/completions";
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
          })
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`[LlmClientFactory] Error OpenAI API (${res.status}): ${errText.slice(0, 200)}`);
        }

        const data = (await res.json()) as any;
        const text = data?.choices?.[0]?.message?.content;
        if (!text) {
          throw new Error("[LlmClientFactory] Respuesta vacía de OpenAI API");
        }
        return text;
      };
    }

    return undefined;
  }
}
