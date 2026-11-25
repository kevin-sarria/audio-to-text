import { describe, it, expect } from "vitest";
import { formatOffset } from "../domain/timeFormat.js";
import {
  calculateParticipants,
  estimateDurationSec
} from "../domain/services/SpeakingStatsCalculator.js";
import { SummaryUtterance } from "../domain/models/MeetingSummary.js";
import { parseLlmSummary } from "../infrastructure/ai/MeetingSummaryValidator.js";

export const FIXTURE: SummaryUtterance[] = [
  { speakerName: "Ana", text: "Vamos a migrar la base de datos el viernes.", offsetSec: 0 },
  { speakerName: "Luis", text: "Yo me encargo de preparar el script de migración.", offsetSec: 12 },
  { speakerName: "Ana", text: "Perfecto, ¿alguien sabe quién aprueba el presupuesto?", offsetSec: 30 }
];

describe("Resumen de reuniones", () => {
  describe("formatOffset", () => {
    it("formatea mm:ss y h:mm:ss", () => {
      expect(formatOffset(0)).toBe("00:00");
      expect(formatOffset(65)).toBe("01:05");
      expect(formatOffset(3725)).toBe("1:02:05");
      expect(formatOffset(-5)).toBe("00:00");
    });
  });

  describe("SpeakingStatsCalculator", () => {
    it("calcula tiempos y porcentajes con offsets conocidos", () => {
      const result = calculateParticipants(FIXTURE);
      expect(result.map((p) => p.name)).toEqual(["Luis", "Ana"]);
      expect(result[0]).toEqual({ name: "Luis", speakingSeconds: 18, speakingPercent: 54.9 });
      expect(result[1]).toEqual({ name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 });
    });

    it("estima por número de palabras cuando no hay offsets", () => {
      const result = calculateParticipants([
        { speakerName: "A", text: "uno dos tres cuatro cinco" },
        { speakerName: "B", text: "uno dos tres cuatro cinco seis siete ocho nueve diez" }
      ]);
      expect(result[0]).toEqual({ name: "B", speakingSeconds: 4, speakingPercent: 66.7 });
      expect(result[1]).toEqual({ name: "A", speakingSeconds: 2, speakingPercent: 33.3 });
    });

    it("limita cada turno a 30 segundos aunque haya un silencio largo", () => {
      const result = calculateParticipants([
        { speakerName: "A", text: "hola", offsetSec: 0 },
        { speakerName: "B", text: "hola", offsetSec: 600 }
      ]);
      expect(result.find((p) => p.name === "A")?.speakingSeconds).toBe(30);
    });

    it("devuelve lista vacía sin intervenciones", () => {
      expect(calculateParticipants([])).toEqual([]);
    });

    it("estima la duración total o undefined sin offsets", () => {
      expect(estimateDurationSec(FIXTURE)).toBe(33);
      expect(estimateDurationSec([{ speakerName: "A", text: "hola" }])).toBeUndefined();
      expect(estimateDurationSec([])).toBeUndefined();
    });
  });
});

describe("MeetingSummaryValidator", () => {
  const transcript =
    "[00:00] Ana: Vamos a migrar la base de datos el viernes.\n" +
    "[00:12] Luis: Yo me encargo de preparar el script de migración.";

  const base = (over: Record<string, unknown>) =>
    JSON.stringify({ language: "es", executiveSummary: "Resumen.", ...over });

  it("descarta tareas y decisiones cuya evidencia no está en la transcripción", () => {
    const raw = base({
      decisions: [
        { text: "Migrar el viernes", evidence: "Vamos a migrar la base de datos el viernes." },
        { text: "Inventada", evidence: "esto nadie lo dijo" }
      ],
      actionItems: [
        { task: "Preparar script", owner: "Luis", evidence: "Yo me encargo de preparar el script de migración." },
        { task: "Otra inventada", evidence: "frase inexistente" },
        { task: "Sin evidencia" }
      ]
    });
    const parts = parseLlmSummary(raw, transcript, 40);
    expect(parts.decisions).toHaveLength(1);
    expect(parts.actionItems).toEqual([
      { task: "Preparar script", owner: "Luis", evidence: "Yo me encargo de preparar el script de migración." }
    ]);
  });

  it("compara la evidencia sin distinguir mayúsculas ni espacios repetidos", () => {
    const raw = base({
      decisions: [{ text: "Migrar", evidence: "VAMOS  a migrar   la base de datos el viernes." }]
    });
    expect(parseLlmSummary(raw, transcript, 40).decisions).toHaveLength(1);
  });

  it("no inventa responsable ni fecha", () => {
    const raw = base({
      actionItems: [{ task: "Preparar script", owner: "  ", evidence: "preparar el script de migración" }]
    });
    const item = parseLlmSummary(raw, transcript, 40).actionItems[0];
    expect(item?.owner).toBeUndefined();
    expect(item?.dueDate).toBeUndefined();
  });

  it("descarta capítulos fuera de rango o solapados y los ordena", () => {
    const raw = base({
      chapters: [
        { title: "B", startSec: 20, endSec: 40 },
        { title: "A", startSec: 0, endSec: 25 },
        { title: "Fuera", startSec: 500, endSec: 600 },
        { title: "Invertido", startSec: 30, endSec: 10 }
      ]
    });
    const chapters = parseLlmSummary(raw, transcript, 40).chapters;
    expect(chapters).toEqual([{ title: "A", startSec: 0, endSec: 25 }]);
  });

  it("no devuelve capítulos si la transcripción no tiene marcas de tiempo", () => {
    const raw = base({ chapters: [{ title: "A", startSec: 0, endSec: 10 }] });
    expect(parseLlmSummary(raw, transcript, undefined).chapters).toEqual([]);
  });

  it("acepta JSON dentro de un bloque ```json y usa 'es' por defecto", () => {
    const raw = "```json\n" + JSON.stringify({ executiveSummary: "Hola." }) + "\n```";
    const parts = parseLlmSummary(raw, transcript, 40);
    expect(parts.executiveSummary).toBe("Hola.");
    expect(parts.language).toBe("es");
    expect(parts.topics).toEqual([]);
  });

  it("lanza error si no hay JSON o falta el resumen ejecutivo", () => {
    expect(() => parseLlmSummary("no es json", transcript, 40)).toThrow();
    expect(() => parseLlmSummary(JSON.stringify({ topics: [] }), transcript, 40)).toThrow();
  });
});
