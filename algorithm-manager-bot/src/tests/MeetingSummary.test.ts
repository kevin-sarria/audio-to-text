import { describe, it, expect, vi } from "vitest";
import { formatOffset } from "../domain/timeFormat.js";
import {
  MeetingSummaryLlmService,
  splitIntoChunks,
  formatTranscript
} from "../infrastructure/ai/MeetingSummaryLlmService.js";
import {
  calculateParticipants,
  estimateDurationSec
} from "../domain/services/SpeakingStatsCalculator.js";
import { MeetingSummary, SummaryUtterance } from "../domain/models/MeetingSummary.js";
import { parseLlmSummary } from "../infrastructure/ai/MeetingSummaryValidator.js";
import { renderSummaryMarkdown, renderConsoleExcerpt } from "../infrastructure/export/MeetingSummaryMarkdownRenderer.js";

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

describe("MeetingSummaryLlmService", () => {
  const VALID = JSON.stringify({
    language: "es",
    executiveSummary: "Se acordó migrar la base de datos el viernes.",
    topics: [{ title: "Migración", summary: "Plan de migración." }],
    decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar la base de datos el viernes." }],
    actionItems: [
      { task: "Preparar el script", owner: "Luis", evidence: "Yo me encargo de preparar el script de migración." },
      { task: "Contratar a alguien", evidence: "frase que nadie dijo" }
    ],
    openQuestions: [{ text: "¿Quién aprueba el presupuesto?", askedBy: "Ana" }],
    chapters: [
      { title: "Migración", startSec: 0, endSec: 30 },
      { title: "Fuera de rango", startSec: 500, endSec: 600 }
    ]
  });

  it("genera el resumen: texto del LLM validado y participantes calculados por código", async () => {
    const callLlm = vi.fn().mockResolvedValue(VALID);
    const service = new MeetingSummaryLlmService(callLlm);

    const summary = await service.summarize({ sessionId: "s1", utterances: FIXTURE });

    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(summary.sessionId).toBe("s1");
    expect(summary.executiveSummary).toContain("migrar");
    expect(summary.actionItems).toHaveLength(1);
    expect(summary.chapters).toEqual([{ title: "Migración", startSec: 0, endSec: 30 }]);
    expect(summary.participants.map((p) => p.name)).toEqual(["Luis", "Ana"]);
    expect(summary.note).toBeUndefined();
  });

  it("reintenta una vez cuando la primera respuesta no es JSON válido", async () => {
    const callLlm = vi.fn().mockResolvedValueOnce("lo siento, no puedo").mockResolvedValueOnce(VALID);
    const service = new MeetingSummaryLlmService(callLlm);

    const summary = await service.summarize({ sessionId: "s2", utterances: FIXTURE });

    expect(callLlm).toHaveBeenCalledTimes(2);
    expect(String(callLlm.mock.calls[1]?.[1])).toContain("no fue un JSON válido");
    expect(summary.executiveSummary).toContain("migrar");
  });

  it("devuelve un resumen mínimo con nota si el LLM falla dos veces", async () => {
    const callLlm = vi.fn().mockResolvedValue("basura");
    const service = new MeetingSummaryLlmService(callLlm);

    const summary = await service.summarize({ sessionId: "s3", utterances: FIXTURE });

    expect(callLlm).toHaveBeenCalledTimes(2);
    expect(summary.note).toContain("no se pudo generar");
    expect(summary.topics).toEqual([]);
    expect(summary.participants).toHaveLength(2);
  });

  it("devuelve resumen mínimo sin llamar a nada cuando no hay LLM configurado", async () => {
    const service = new MeetingSummaryLlmService();
    const summary = await service.summarize({ sessionId: "s4", utterances: FIXTURE });
    expect(summary.note).toBeDefined();
    expect(summary.participants).toHaveLength(2);
  });

  it("divide las transcripciones largas en bloques y fusiona los parciales", async () => {
    const empty = JSON.stringify({ executiveSummary: "Parcial.", language: "es" });
    const callLlm = vi.fn().mockResolvedValue(empty);
    const maxChunkChars = 90;
    const chunks = splitIntoChunks(FIXTURE, maxChunkChars);
    expect(chunks.length).toBeGreaterThan(1);

    const service = new MeetingSummaryLlmService(callLlm, { maxChunkChars });
    const summary = await service.summarize({ sessionId: "s5", utterances: FIXTURE });

    expect(callLlm).toHaveBeenCalledTimes(chunks.length + 1);
    expect(summary.executiveSummary).toBe("Parcial.");
  });

  it("splitIntoChunks conserva el orden y no pierde intervenciones", () => {
    const chunks = splitIntoChunks(FIXTURE, 90);
    expect(chunks.flat()).toEqual(FIXTURE);
    expect(splitIntoChunks(FIXTURE, 100000)).toHaveLength(1);
    expect(splitIntoChunks([], 100)).toEqual([]);
  });

  it("formatTranscript incluye marca de tiempo solo cuando hay offset", () => {
    expect(formatTranscript([{ speakerName: "Ana", text: "hola", offsetSec: 65 }])).toBe("[01:05] Ana: hola");
    expect(formatTranscript([{ speakerName: "Ana", text: "hola" }])).toBe("Ana: hola");
  });
});

describe("MeetingSummaryMarkdownRenderer", () => {
  const full: MeetingSummary = {
    sessionId: "s1",
    generatedAt: "2026-11-25T10:00:00.000Z",
    language: "es",
    executiveSummary: "Se acordó migrar la base el viernes.",
    topics: [{ title: "Migración", summary: "Plan de migración." }],
    decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar" }],
    actionItems: [
      { task: "Preparar el script", owner: "Luis", dueDate: "jueves", evidence: "Yo me encargo" },
      { task: "Revisar costos", evidence: "hay que revisar costos" }
    ],
    openQuestions: [{ text: "¿Quién aprueba el presupuesto?", askedBy: "Ana" }],
    participants: [
      { name: "Luis", speakingSeconds: 18, speakingPercent: 54.9 },
      { name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 }
    ],
    chapters: [{ title: "Migración", startSec: 0, endSec: 30 }]
  };

  it("incluye todas las secciones con su contenido", () => {
    const md = renderSummaryMarkdown(full, "Reunión GOOGLE_MEET");
    for (const heading of [
      "# Reunión GOOGLE_MEET",
      "## Resumen ejecutivo",
      "## Puntos de acción",
      "## Decisiones",
      "## Temas",
      "## Preguntas abiertas",
      "## Capítulos",
      "## Participantes"
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("- [ ] **Preparar el script** — Responsable: Luis · Fecha: jueves");
    expect(md).toContain('> "Yo me encargo"');
    expect(md).toContain("- [ ] **Revisar costos**");
    expect(md).toContain("`00:00–00:30` Migración");
    expect(md).toContain("| Luis | 00:18 | 54.9% |");
  });

  it("muestra 'Sin elementos' en secciones vacías y la nota si existe", () => {
    const md = renderSummaryMarkdown({
      ...full,
      topics: [],
      decisions: [],
      actionItems: [],
      openQuestions: [],
      chapters: [],
      note: "El resumen con IA no se pudo generar: prueba."
    });
    expect(md).toContain("_Sin elementos._");
    expect(md).toContain("> ⚠️ El resumen con IA no se pudo generar: prueba.");
  });

  it("el extracto de consola resume cantidades y las primeras tareas", () => {
    const text = renderConsoleExcerpt(full);
    expect(text).toContain("Se acordó migrar la base el viernes.");
    expect(text).toContain("2 puntos de acción");
    expect(text).toContain("Preparar el script");
  });
});
