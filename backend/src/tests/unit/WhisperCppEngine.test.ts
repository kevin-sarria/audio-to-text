import { describe, it, expect } from "vitest";
import { cleanSegments, buildWhisperArgs } from "../../infrastructure/transcription/WhisperCppEngine.js";

const seg = (text: string, i = 0) => ({ startMs: i * 1000, endMs: i * 1000 + 900, text, speakerLabel: "Hablante 1" });

describe("cleanSegments", () => {
  it("descarta anotaciones de sonido que no son habla", () => {
    const out = cleanSegments([
      seg("[Susurro]", 0),
      seg("(Ruido de la puerta)", 1),
      seg("[BLANK_AUDIO]", 2),
      seg("Muy buenas tardes.", 3)
    ]);
    expect(out.map((s) => s.text)).toEqual(["Muy buenas tardes."]);
  });

  it("conserva texto que solo contiene paréntesis dentro de una frase", () => {
    const out = cleanSegments([seg("El valor (aproximado) es 5.", 0), seg("Dijo [sic] eso.", 1)]);
    expect(out).toHaveLength(2);
  });

  it("corta bucles: conserva como máximo 2 repeticiones consecutivas idénticas", () => {
    const out = cleanSegments([0, 1, 2, 3, 4].map((i) => seg("Gracias.", i)).concat([seg("Adiós.", 5), seg("Gracias.", 6)]));
    expect(out.map((s) => s.text)).toEqual(["Gracias.", "Gracias.", "Adiós.", "Gracias."]);
  });

  it("ignora segmentos vacíos", () => {
    expect(cleanSegments([seg("   ", 0)])).toEqual([]);
  });
});

describe("buildWhisperArgs", () => {
  const config = { binaryPath: "w", modelPath: "m.bin", threads: 6 };

  it("siempre desactiva el contexto y las etiquetas de sonido", () => {
    const args = buildWhisperArgs(config, "a.wav", "es", "out");
    expect(args).toEqual(expect.arrayContaining(["-mc", "0", "-sns", "-t", "6", "-l", "es"]));
    expect(args).not.toContain("--vad");
  });

  it("activa VAD solo si hay modelo VAD", () => {
    const args = buildWhisperArgs({ ...config, vadModelPath: "vad.bin" }, "a.wav", "es", "out");
    const i = args.indexOf("--vad");
    expect(i).toBeGreaterThan(-1);
    expect(args.slice(i, i + 3)).toEqual(["--vad", "-vm", "vad.bin"]);
  });
});
