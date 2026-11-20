import { describe, it, expect } from "vitest";
import { TranscriptSanitizer } from "../../infrastructure/analysis/TranscriptSanitizer.js";

describe("TranscriptSanitizer", () => {
  it("deja intacta una transcripción normal sin fragmentos JSON", () => {
    const raw = `[00:10] Hablante 1: Hola equipo, bienvenidos a la reunión.
[00:25] Hablante 2: Buenos días, comencemos con los pendientes.`;

    expect(TranscriptSanitizer.hasEmbeddedJson(raw)).toBe(false);
    expect(TranscriptSanitizer.sanitize(raw)).toBe(raw);
  });

  it("detecta y repara líneas con JSON incrustado de transcripción ('speaker', 'text', 'start')", () => {
    const corrupted = `[12:00] Hablante 1: O, sí, después de que nos pasen el API, pues ya es un poco más flexible.
[12:10] Hablante 1: {"speaker": "Hablante 1", "start": "00:00", "end": "00:10", "text": "bueno aquí tenemos lo de los formularios"}
[12:20] Hablante 1: {"speaker": "Hablante 1", "start": "00:10", "end": "00:20", "text": "el módulo de formularios pues realmente aquí el estado"}
[12:30] Hablante 1: {"speaker": "Hablante 1", "start": "00:20", "end": "00:30", "text": "es de parte de Juan Esteban."}
[12:45] Hablante 2: De acuerdo, continuemos.`;

    expect(TranscriptSanitizer.hasEmbeddedJson(corrupted)).toBe(true);
    const cleaned = TranscriptSanitizer.sanitize(corrupted);

    expect(cleaned).not.toContain('"speaker"');
    expect(cleaned).not.toContain('"text"');
    expect(cleaned).not.toContain('{"speaker"');
    expect(cleaned).toContain("bueno aquí tenemos lo de los formularios");
    expect(cleaned).toContain("el módulo de formularios pues realmente aquí el estado");
    expect(cleaned).toContain("es de parte de Juan Esteban.");
  });

  it("limpia fragmentos con comillas escapadas y sintaxis JSON residual", () => {
    const rawWithEscapes = `[14:00] Hablante 1: {"speaker": "Hablante 1", "text": "Juan dijo: \\"hay que validar la matriz\\" y seguir."}`;
    const cleaned = TranscriptSanitizer.sanitize(rawWithEscapes);

    expect(cleaned).toContain('Juan dijo: "hay que validar la matriz" y seguir.');
    expect(cleaned).not.toContain('"speaker"');
  });
});
