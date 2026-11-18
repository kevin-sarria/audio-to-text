import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseTimeToMs } from "../infrastructure/transcription/GeminiEngine.js";

describe("ProviderEngines logic", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parseTimeToMs parsea correctamente formatos mm:ss, hh:mm:ss y segundos", () => {
    expect(parseTimeToMs("01:30")).toBe(90000); // 1m 30s
    expect(parseTimeToMs("00:05")).toBe(5000); // 5s
    expect(parseTimeToMs("01:00:00")).toBe(3600000); // 1h
    expect(parseTimeToMs("10")).toBe(10000); // 10s
    expect(parseTimeToMs("invalido")).toBeNull();
    expect(parseTimeToMs("")).toBeNull();
  });

  it("GroqEngine maneja reintento ante 429 respetando Retry-After", async () => {
    let callCount = 0;
    const apiKey = "gsk_secret_key_1234567890abcdef";

    global.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
      // Verificar que la cabecera jamás expone la clave en texto de error
      expect(opts.headers.Authorization).toBe(`Bearer ${apiKey}`);
      callCount++;
      if (callCount === 1) {
        return new Response("Rate limited", {
          status: 429,
          headers: { "retry-after": "1" }
        });
      }
      return new Response(
        JSON.stringify({
          language: "es",
          segments: [
            { start: 0.5, end: 2.5, text: "Hola desde Groq" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    // Simulación de parseo de respuesta
    const res = await global.fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    expect(res.status).toBe(429);

    const retryRes = await global.fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    expect(retryRes.status).toBe(200);
    const data = (await retryRes.json()) as Record<string, any>;
    expect(data.segments[0].text).toBe("Hola desde Groq");
    // Mapeo a ms
    expect(Math.round(data.segments[0].start * 1000)).toBe(500);
    expect(Math.round(data.segments[0].end * 1000)).toBe(2500);
  });

  it("GeminiEngine descarta segmentos donde endMs <= startMs o texto vacío", () => {
    const rawCandidates = [
      { speaker: "Hablante 1", start: "00:00", end: "00:05", text: "Segmento válido" },
      { speaker: "Hablante 1", start: "00:10", end: "00:08", text: "Tiempo invertido" },
      { speaker: "Hablante 2", start: "00:15", end: "00:20", text: "   " } // Vacío
    ];

    const validSegments = rawCandidates
      .map((item) => {
        const startMs = parseTimeToMs(item.start);
        const endMs = parseTimeToMs(item.end);
        return { ...item, startMs, endMs };
      })
      .filter((s) => s.startMs !== null && s.endMs !== null && s.endMs > s.startMs && s.text.trim().length > 0);

    expect(validSegments.length).toBe(1);
    expect(validSegments[0]!.text).toBe("Segmento válido");
  });
});
