import { describe, it, expect } from "vitest";
import { formatOffset } from "../domain/timeFormat.js";
import {
  calculateParticipants,
  estimateDurationSec
} from "../domain/services/SpeakingStatsCalculator.js";
import { SummaryUtterance } from "../domain/models/MeetingSummary.js";

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
