import { describe, it, expect, vi, afterEach } from "vitest";
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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AutonomousMeetingBotService } from "../application/AutonomousMeetingBotService.js";
import { MeetingClassifierLlmService } from "../infrastructure/ai/MeetingClassifierLlmService.js";
import { parseTranscriptLines } from "../application/transcriptParsing.js";
import { ProcessMeetingSessionUseCase } from "../application/ProcessMeetingSessionUseCase.js";
import { CommercialProposalLlmService } from "../infrastructure/ai/CommercialProposalLlmService.js";
import { HeadlessMeetingBotConnector } from "../infrastructure/connectors/HeadlessMeetingBotConnector.js";
import { IMeetingSummarizer } from "../domain/services/IMeetingSummarizer.js";

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

  it("nunca lanza error aunque una intervención venga malformada", async () => {
    const service = new MeetingSummaryLlmService(vi.fn());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const summary = await service.summarize({
      sessionId: "s-bad",
      utterances: [{ speakerName: "A" } as any]
    });
    expect(summary.note).toBeDefined();
    expect(summary.sessionId).toBe("s-bad");
    vi.restoreAllMocks();
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

describe("MeetingSummaryMarkdownRenderer robustez", () => {
  const base: MeetingSummary = {
    sessionId: "s1",
    generatedAt: "2026-11-25T10:00:00.000Z",
    language: "es",
    executiveSummary: "Resumen.",
    topics: [],
    decisions: [],
    actionItems: [{ task: "Tarea", evidence: "linea uno\nlinea dos" }],
    openQuestions: [],
    participants: [{ name: "Ana | Co", speakingSeconds: 10, speakingPercent: 100 }],
    chapters: []
  };

  it("colapsa la evidencia multilínea en una sola línea de cita", () => {
    const md = renderSummaryMarkdown(base);
    expect(md).toContain('  > "linea uno linea dos"');
    expect(md).not.toContain("linea uno\nlinea dos");
  });

  it("escapa | en el nombre del participante", () => {
    const md = renderSummaryMarkdown(base);
    expect(md).toContain("| Ana \\| Co |");
  });
});

describe("AutonomousMeetingBotService + resumen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubConnector(): void {
    vi.spyOn(HeadlessMeetingBotConnector.prototype, "connectToMeeting").mockResolvedValue({
      sessionId: "stub",
      platform: "GOOGLE_MEET",
      connectedAt: new Date().toISOString(),
      status: "CONNECTED_AND_RECORDING",
      message: "stub"
    });
    vi.spyOn(HeadlessMeetingBotConnector.prototype, "leaveMeeting").mockResolvedValue({ success: true });
  }

  function newBot(summarizer: IMeetingSummarizer): AutonomousMeetingBotService {
    return new AutonomousMeetingBotService(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      undefined,
      undefined,
      summarizer
    );
  }

  it("asigna offsetSec y escribe Resumen_<id>.md y .json junto a los demás entregables", async () => {
    stubConnector();
    const bot = newBot(new MeetingSummaryLlmService());

    const sessionId = await bot.startAutonomousMeeting({
      meetingUrl: "https://meet.google.com/test-room",
      headless: true
    });
    bot.recordUtterance({
      speakerName: "David",
      content: "Vamos a cerrar los bugs de auth en este sprint.",
      timestamp: "09:00:00",
      platform: "GOOGLE_MEET"
    });
    bot.recordUtterance({
      speakerName: "Marta",
      content: "Yo reviso el PR del backend.",
      timestamp: "09:00:05",
      platform: "GOOGLE_MEET"
    });

    expect(typeof bot.getActiveUtterances()[0]?.offsetSec).toBe("number");

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-summary-"));
    try {
      const record = await bot.finalizeAndGenerateDeliverables(
        sessionId,
        "https://meet.google.com/test-room",
        outDir
      );

      expect(record.transcriptDocxPath).toContain(".docx");
      expect(record.summaryMarkdownPath).toBe(path.join(outDir, `Resumen_${sessionId}.md`));
      expect(record.summaryJsonPath).toBe(path.join(outDir, `Resumen_${sessionId}.json`));

      const json = JSON.parse(fs.readFileSync(record.summaryJsonPath!, "utf-8"));
      expect(json.sessionId).toBe(sessionId);
      expect(json.participants.map((p: { name: string }) => p.name).sort()).toEqual(["David", "Marta"]);
      expect(fs.readFileSync(record.summaryMarkdownPath!, "utf-8")).toContain("## Resumen ejecutivo");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 10000);

  it("un resumidor que lanza error no bloquea los demás entregables", async () => {
    stubConnector();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bot = newBot({ summarize: vi.fn().mockRejectedValue(new Error("boom")) });
    const sessionId = await bot.startAutonomousMeeting({
      meetingUrl: "https://meet.google.com/test-room",
      headless: true
    });
    bot.recordUtterance({
      speakerName: "David",
      content: "Vamos a cerrar los bugs de auth en este sprint.",
      timestamp: "09:00:00",
      platform: "GOOGLE_MEET"
    });
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bot-summary-"));
    try {
      const record = await bot.finalizeAndGenerateDeliverables(
        sessionId,
        "https://meet.google.com/test-room",
        outDir
      );
      expect(record.transcriptDocxPath).toContain(".docx");
      expect(record.summaryMarkdownPath).toBeUndefined();
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }, 10000);

  it("recordUtterance fusiona subtítulos parciales crecientes del mismo hablante", async () => {
    stubConnector();
    const bot = newBot(new MeetingSummaryLlmService());
    await bot.startAutonomousMeeting({ meetingUrl: "https://meet.google.com/test-room", headless: true });
    const mk = (speakerName: string, content: string, timestamp: string) => ({
      speakerName,
      content,
      timestamp,
      platform: "GOOGLE_MEET" as const
    });
    bot.recordUtterance(mk("Ana", "Hola", "09:00:00"));
    bot.recordUtterance(mk("Ana", "Hola a", "09:00:01"));
    bot.recordUtterance(mk("Ana", "Hola a todos", "09:00:02"));
    bot.recordUtterance(mk("Luis", "Buenas", "09:00:03"));

    let list = bot.getActiveUtterances();
    expect(list).toHaveLength(2);
    expect(list[0]?.speakerName).toBe("Ana");
    expect(list[0]?.content).toBe("Hola a todos");
    expect(list[0]?.timestamp).toBe("09:00:00");
    expect(typeof list[0]?.offsetSec).toBe("number");

    bot.recordUtterance(mk("Ana", "Otra cosa distinta", "09:00:05"));
    list = bot.getActiveUtterances();
    expect(list).toHaveLength(3);
    expect(list[2]?.content).toBe("Otra cosa distinta");
    expect(list[2]?.timestamp).toBe("09:00:05");
  });
});

describe("ProcessMeetingSessionUseCase + resumen", () => {
  it("parseTranscriptLines extrae hablante y texto, con o sin marca de tiempo", () => {
    const result = parseTranscriptLines(
      "[00:10] Ana: Hola a todos\nLuis: Buenas, ¿cómo están?\n\nuna línea sin hablante"
    );
    expect(result).toEqual([
      { speakerName: "Ana", text: "Hola a todos" },
      { speakerName: "Luis", text: "Buenas, ¿cómo están?" },
      { speakerName: "Participante", text: "una línea sin hablante" }
    ]);
  });

  it("parseTranscriptLines trata casos límite sin inventar hablantes", () => {
    const result = parseTranscriptLines(
      [
        "[00:10] una línea sin nombre",
        "10:30 reunión con el cliente",
        "https://x.com/a",
        "http://x.com",
        "a/b: texto con barra",
        " : texto sin nombre"
      ].join("\n")
    );
    expect(result).toEqual([
      { speakerName: "Participante", text: "[00:10] una línea sin nombre" },
      { speakerName: "Participante", text: "10:30 reunión con el cliente" },
      { speakerName: "Participante", text: "https://x.com/a" },
      { speakerName: "Participante", text: "http://x.com" },
      { speakerName: "Participante", text: "a/b: texto con barra" },
      { speakerName: "Participante", text: ": texto sin nombre" }
    ]);
  });

  it("un resumidor que lanza error no bloquea la propuesta comercial", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const useCase = new ProcessMeetingSessionUseCase(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      { summarize: vi.fn().mockRejectedValue(new Error("boom")) }
    );
    const out = await useCase.execute({
      transcript:
        "Cliente: necesitamos una propuesta y una cotización con presupuesto y plazo de entrega para nuestros servicios."
    });
    expect(out.commercialProposal).toBeDefined();
    expect(out.summary.note).toBeDefined();
    vi.restoreAllMocks();
  });

  it("devuelve el resumen tanto en reuniones internas como comerciales", async () => {
    const useCase = new ProcessMeetingSessionUseCase(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService()
    );

    const internal = await useCase.execute({
      transcript: "Ana: Sprint Planning, vamos a refactorizar el módulo de auth y preparar el PR del backend."
    });
    expect(internal.classification.type).toBe("INTERNAL");
    expect(internal.summary.sessionId).toBe(internal.sessionId);
    expect(internal.summary.participants[0]?.name).toBe("Ana");

    const commercial = await useCase.execute({
      transcript:
        "Cliente: necesitamos una propuesta y una cotización con presupuesto y plazo de entrega para nuestros servicios."
    });
    expect(commercial.classification.type).toBe("COMMERCIAL_CLIENT");
    expect(commercial.commercialProposal).toBeDefined();
    expect(commercial.summary).toBeDefined();
  });

  it("usa las utterances con offsets si se entregan en lugar de parsear el texto", async () => {
    const useCase = new ProcessMeetingSessionUseCase(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService()
    );
    const out = await useCase.execute({ transcript: "ignorado", utterances: FIXTURE });
    expect(out.summary.participants.map((p) => p.name)).toEqual(["Luis", "Ana"]);
  });
});
