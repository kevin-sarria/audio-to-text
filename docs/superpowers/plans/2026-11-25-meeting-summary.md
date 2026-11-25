# Resumen de reuniones estilo Fireflies — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `algorithm-manager-bot` genere, al terminar cada reunión, `Resumen_<sessionId>.md` y `.json` con resumen ejecutivo, temas, decisiones, puntos de acción, preguntas abiertas, participantes con tiempo de habla y capítulos.

**Architecture:** Un servicio LLM nuevo (`MeetingSummaryLlmService`) detrás de la interfaz `IMeetingSummarizer`, como el clasificador y el generador de propuestas. Los números (tiempo de habla) los calcula código puro; el texto lo escribe el LLM y un validador descarta lo que no tenga evidencia textual. Un renderer produce el Markdown. Se engancha en `AutonomousMeetingBotService` y `ProcessMeetingSessionUseCase`.

**Tech Stack:** TypeScript (ESM, NodeNext, `strict`, `noUncheckedIndexedAccess`), vitest, Node `fs`/`path`. Spec: `docs/superpowers/specs/2026-11-25-meeting-summary-design.md`.

## Global Constraints

- Ningún archivo supera las 500 líneas de código.
- Imports relativos con extensión `.js` (ESM NodeNext), como el resto del bot.
- Todo texto de cara al usuario en español.
- Las pruebas usan un LLM simulado (`vi.fn`); ninguna llamada de red real.
- El resumen nunca bloquea la entrega del `.docx`, el `.xlsx` ni la propuesta.
- Comandos se ejecutan desde `algorithm-manager-bot/` salvo que se indique otra cosa. Línea base antes de empezar: `npx tsc --noEmit` sin errores y `npx vitest run` con 10 tests pasando.

## Desviaciones deliberadas respecto al spec

1. **`offsetSec` lo rellena `AutonomousMeetingBotService.recordUtterance`**, no cada driver de Meet/Teams. Cubre ambos drivers y el modo simulación con un solo cambio.
2. `MeetingSummary` gana un campo opcional `note?: string` para el aviso del resumen mínimo cuando falla el LLM.
3. Los archivos se llaman `Resumen_<sessionId>.md/.json`, igual que `Transcripcion_<id>.docx` e `Issues_<id>.xlsx`.

## Regla de commits (importante)

Muchos archivos del bot ya tienen cambios sin commitear del usuario (`AutonomousMeetingBotService.ts`, `PlatformSpeakerExtractor.ts`, `cli.ts`, `index.ts`, `README.md` y el test existente). **Las Tareas 1–4 solo crean archivos nuevos y se commitean. Las Tareas 5–7 modifican archivos con trabajo previo del usuario: NO las commitees**; déjalas en el árbol de trabajo y repórtalo. Nunca uses `git add -A` ni `git add .`.

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `algorithm-manager-bot/src/domain/models/MeetingSummary.ts` | Crear | Tipos del resumen y `SummaryUtterance`. |
| `algorithm-manager-bot/src/domain/timeFormat.ts` | Crear | `formatOffset(sec)` → `mm:ss` / `h:mm:ss`. |
| `algorithm-manager-bot/src/domain/services/SpeakingStatsCalculator.ts` | Crear | `calculateParticipants`, `estimateDurationSec`. |
| `algorithm-manager-bot/src/domain/services/IMeetingSummarizer.ts` | Crear | Interfaz del resumidor. |
| `algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryValidator.ts` | Crear | Parseo del JSON del LLM, evidencia y capítulos válidos. |
| `algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryLlmService.ts` | Crear | Prompts, bloques, fusión, reintento, fallback. |
| `algorithm-manager-bot/src/infrastructure/export/MeetingSummaryMarkdownRenderer.ts` | Crear | `renderSummaryMarkdown`, `renderConsoleExcerpt`. |
| `algorithm-manager-bot/src/application/transcriptParsing.ts` | Crear | `parseTranscriptLines` para texto plano. |
| `algorithm-manager-bot/src/tests/MeetingSummary.test.ts` | Crear | Todas las pruebas nuevas. |
| `algorithm-manager-bot/src/infrastructure/connectors/PlatformSpeakerExtractor.ts` | Modificar | `offsetSec?` en `ExtractedUtterance`. |
| `algorithm-manager-bot/src/application/AutonomousMeetingBotService.ts` | Modificar | Offsets, generar y escribir el resumen. |
| `algorithm-manager-bot/src/application/ProcessMeetingSessionUseCase.ts` | Modificar | Reemplazar `internalSummary` por `summary`. |
| `algorithm-manager-bot/src/tests/ProcessMeetingSession.test.ts` | Modificar | Ajustar la aserción de `internalSummary`. |
| `algorithm-manager-bot/src/cli.ts`, `src/index.ts`, `README.md` | Modificar | Cableado, exports y documentación. |

---

### Task 1: Modelo, formato de tiempo y estadísticas de habla

**Files:**
- Create: `algorithm-manager-bot/src/domain/models/MeetingSummary.ts`
- Create: `algorithm-manager-bot/src/domain/timeFormat.ts`
- Create: `algorithm-manager-bot/src/domain/services/SpeakingStatsCalculator.ts`
- Create: `algorithm-manager-bot/src/domain/services/IMeetingSummarizer.ts`
- Test: `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`

**Interfaces:**
- Produces:
  - `SummaryUtterance { speakerName: string; text: string; offsetSec?: number }`
  - `MeetingSummary` (campos en el código de abajo)
  - `formatOffset(totalSec: number): string`
  - `calculateParticipants(utterances: SummaryUtterance[]): SummaryParticipant[]`
  - `estimateDurationSec(utterances: SummaryUtterance[]): number | undefined`
  - `IMeetingSummarizer { summarize(input: SummarizeInput): Promise<MeetingSummary> }`, con `SummarizeInput { sessionId: string; utterances: SummaryUtterance[] }`

- [ ] **Step 1: Escribir el test que falla**

Crear `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: FAIL (no se pueden resolver los módulos `timeFormat.js` / `SpeakingStatsCalculator.js`).

- [ ] **Step 3: Implementar**

`algorithm-manager-bot/src/domain/models/MeetingSummary.ts`:

```ts
export interface SummaryUtterance {
  speakerName: string;
  text: string;
  /** Segundos desde el inicio de la reunión. Ausente en transcripciones de texto plano. */
  offsetSec?: number;
}

export interface SummaryTopic {
  title: string;
  summary: string;
}

export interface SummaryDecision {
  text: string;
  evidence: string;
}

export interface SummaryActionItem {
  task: string;
  owner?: string;
  dueDate?: string;
  evidence: string;
}

export interface SummaryOpenQuestion {
  text: string;
  askedBy?: string;
}

export interface SummaryParticipant {
  name: string;
  speakingSeconds: number;
  speakingPercent: number;
}

export interface SummaryChapter {
  title: string;
  startSec: number;
  endSec: number;
}

export interface MeetingSummary {
  sessionId: string;
  generatedAt: string;
  language: string;
  executiveSummary: string;
  topics: SummaryTopic[];
  decisions: SummaryDecision[];
  actionItems: SummaryActionItem[];
  openQuestions: SummaryOpenQuestion[];
  participants: SummaryParticipant[];
  chapters: SummaryChapter[];
  /** Aviso cuando el resumen es el mínimo porque el LLM no estuvo disponible o falló. */
  note?: string;
}
```

`algorithm-manager-bot/src/domain/timeFormat.ts`:

```ts
export function formatOffset(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
```

`algorithm-manager-bot/src/domain/services/SpeakingStatsCalculator.ts`:

```ts
import { SummaryParticipant, SummaryUtterance } from "../models/MeetingSummary.js";

const WORDS_PER_SECOND = 2.5;
const MAX_TURN_SECONDS = 30;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateTurnSeconds(text: string): number {
  return Math.min(countWords(text) / WORDS_PER_SECOND, MAX_TURN_SECONDS);
}

export function calculateParticipants(utterances: SummaryUtterance[]): SummaryParticipant[] {
  const totals = new Map<string, number>();

  utterances.forEach((u, i) => {
    let seconds = estimateTurnSeconds(u.text);
    const next = utterances[i + 1];
    if (u.offsetSec !== undefined && next?.offsetSec !== undefined) {
      seconds = Math.min(Math.max(next.offsetSec - u.offsetSec, 0), MAX_TURN_SECONDS);
    }
    totals.set(u.speakerName, (totals.get(u.speakerName) ?? 0) + seconds);
  });

  const sum = Array.from(totals.values()).reduce((a, b) => a + b, 0);

  return Array.from(totals.entries())
    .map(([name, seconds]) => ({
      name,
      speakingSeconds: Math.round(seconds),
      speakingPercent: sum > 0 ? Math.round((seconds / sum) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.speakingSeconds - a.speakingSeconds);
}

/** Duración estimada en segundos; undefined si las intervenciones no traen offsets. */
export function estimateDurationSec(utterances: SummaryUtterance[]): number | undefined {
  const last = utterances[utterances.length - 1];
  if (!last || last.offsetSec === undefined) return undefined;
  return Math.ceil(last.offsetSec + estimateTurnSeconds(last.text));
}
```

`algorithm-manager-bot/src/domain/services/IMeetingSummarizer.ts`:

```ts
import { MeetingSummary, SummaryUtterance } from "../models/MeetingSummary.js";

export interface SummarizeInput {
  sessionId: string;
  utterances: SummaryUtterance[];
}

export interface IMeetingSummarizer {
  summarize(input: SummarizeInput): Promise<MeetingSummary>;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add algorithm-manager-bot/src/domain/models/MeetingSummary.ts algorithm-manager-bot/src/domain/timeFormat.ts algorithm-manager-bot/src/domain/services/SpeakingStatsCalculator.ts algorithm-manager-bot/src/domain/services/IMeetingSummarizer.ts algorithm-manager-bot/src/tests/MeetingSummary.test.ts
git commit -m "feat(bot): summary model, time format and speaking stats"
```

---

### Task 2: Validador de la respuesta del LLM

**Files:**
- Create: `algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryValidator.ts`
- Modify (tests): `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`

**Interfaces:**
- Consumes: tipos de `MeetingSummary.ts` (Task 1).
- Produces:
  - `LlmSummaryParts { language: string; executiveSummary: string; topics: SummaryTopic[]; decisions: SummaryDecision[]; actionItems: SummaryActionItem[]; openQuestions: SummaryOpenQuestion[]; chapters: SummaryChapter[] }`
  - `parseLlmSummary(raw: string, transcriptText: string, durationSec: number | undefined): LlmSummaryParts` — lanza `Error` si el JSON es inválido o falta `executiveSummary`.

- [ ] **Step 1: Añadir los tests que fallan**

Añadir arriba de `MeetingSummary.test.ts`: `import { parseLlmSummary } from "../infrastructure/ai/MeetingSummaryValidator.js";`. Añadir al final del archivo:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: FAIL (no se resuelve `MeetingSummaryValidator.js`).

- [ ] **Step 3: Implementar**

`algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryValidator.ts`:

```ts
import {
  SummaryActionItem,
  SummaryChapter,
  SummaryDecision,
  SummaryOpenQuestion,
  SummaryTopic
} from "../../domain/models/MeetingSummary.js";

export interface LlmSummaryParts {
  language: string;
  executiveSummary: string;
  topics: SummaryTopic[];
  decisions: SummaryDecision[];
  actionItems: SummaryActionItem[];
  openQuestions: SummaryOpenQuestion[];
  chapters: SummaryChapter[];
}

type Raw = Record<string, unknown>;

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function objects(v: unknown): Raw[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Raw => typeof x === "object" && x !== null);
}

function parseChapters(v: unknown, durationSec: number | undefined): SummaryChapter[] {
  if (durationSec === undefined) return [];

  const candidates: SummaryChapter[] = [];
  for (const c of objects(v)) {
    const title = str(c["title"]);
    const startSec = Number(c["startSec"]);
    const endSec = Number(c["endSec"]);
    if (!title || !Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    if (startSec < 0 || endSec <= startSec || endSec > durationSec) continue;
    candidates.push({ title, startSec, endSec });
  }

  candidates.sort((a, b) => a.startSec - b.startSec);

  const result: SummaryChapter[] = [];
  for (const c of candidates) {
    const prev = result[result.length - 1];
    if (!prev || c.startSec >= prev.endSec) result.push(c);
  }
  return result;
}

export function parseLlmSummary(
  raw: string,
  transcriptText: string,
  durationSec: number | undefined
): LlmSummaryParts {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("La respuesta del LLM no contiene un objeto JSON.");
  }

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Raw;
  const executiveSummary = str(parsed["executiveSummary"]);
  if (!executiveSummary) {
    throw new Error("La respuesta del LLM no incluye executiveSummary.");
  }

  const haystack = normalizeText(transcriptText);
  const evidenceOf = (v: unknown): string | undefined => {
    const e = str(v);
    return e && haystack.includes(normalizeText(e)) ? e : undefined;
  };

  const topics: SummaryTopic[] = [];
  for (const t of objects(parsed["topics"])) {
    const title = str(t["title"]);
    const summary = str(t["summary"]);
    if (title && summary) topics.push({ title, summary });
  }

  const decisions: SummaryDecision[] = [];
  for (const d of objects(parsed["decisions"])) {
    const text = str(d["text"]);
    const evidence = evidenceOf(d["evidence"]);
    if (text && evidence) decisions.push({ text, evidence });
  }

  const actionItems: SummaryActionItem[] = [];
  for (const a of objects(parsed["actionItems"])) {
    const task = str(a["task"]);
    const evidence = evidenceOf(a["evidence"]);
    if (!task || !evidence) continue;
    const item: SummaryActionItem = { task, evidence };
    const owner = str(a["owner"]);
    const dueDate = str(a["dueDate"]);
    if (owner) item.owner = owner;
    if (dueDate) item.dueDate = dueDate;
    actionItems.push(item);
  }

  const openQuestions: SummaryOpenQuestion[] = [];
  for (const q of objects(parsed["openQuestions"])) {
    const text = str(q["text"]);
    if (!text) continue;
    const item: SummaryOpenQuestion = { text };
    const askedBy = str(q["askedBy"]);
    if (askedBy) item.askedBy = askedBy;
    openQuestions.push(item);
  }

  return {
    language: str(parsed["language"]) ?? "es",
    executiveSummary,
    topics,
    decisions,
    actionItems,
    openQuestions,
    chapters: parseChapters(parsed["chapters"], durationSec)
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryValidator.ts algorithm-manager-bot/src/tests/MeetingSummary.test.ts
git commit -m "feat(bot): validate LLM summary output (evidence, chapters)"
```

---

### Task 3: Servicio LLM del resumen (bloques, fusión, reintento, fallback)

**Files:**
- Create: `algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryLlmService.ts`
- Modify (tests): `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`

**Interfaces:**
- Consumes: `calculateParticipants`, `estimateDurationSec` (Task 1); `parseLlmSummary`, `LlmSummaryParts` (Task 2); `IMeetingSummarizer`, `SummarizeInput` (Task 1); `formatOffset` (Task 1).
- Produces:
  - `type LlmCaller = (system: string, user: string) => Promise<string>`
  - `class MeetingSummaryLlmService implements IMeetingSummarizer` — `constructor(callLlm?: LlmCaller, options?: { maxChunkChars?: number })`; `summarize(input)` nunca lanza.
  - `formatTranscript(utterances: SummaryUtterance[]): string`
  - `splitIntoChunks(utterances: SummaryUtterance[], maxChars: number): SummaryUtterance[][]`
  - `DEFAULT_MAX_CHUNK_CHARS = 24000`

- [ ] **Step 1: Añadir los tests que fallan**

Imports arriba de `MeetingSummary.test.ts` (fusionar `vi` en el import de vitest existente: `import { describe, it, expect, vi } from "vitest";`):

```ts
import {
  MeetingSummaryLlmService,
  splitIntoChunks,
  formatTranscript
} from "../infrastructure/ai/MeetingSummaryLlmService.js";
```

Al final del archivo:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: FAIL (no se resuelve `MeetingSummaryLlmService.js`).

- [ ] **Step 3: Implementar**

`algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryLlmService.ts`:

```ts
import { MeetingSummary, SummaryUtterance } from "../../domain/models/MeetingSummary.js";
import { IMeetingSummarizer, SummarizeInput } from "../../domain/services/IMeetingSummarizer.js";
import {
  calculateParticipants,
  estimateDurationSec
} from "../../domain/services/SpeakingStatsCalculator.js";
import { formatOffset } from "../../domain/timeFormat.js";
import { LlmSummaryParts, parseLlmSummary } from "./MeetingSummaryValidator.js";

export type LlmCaller = (system: string, user: string) => Promise<string>;

export interface MeetingSummaryOptions {
  maxChunkChars?: number;
}

export const DEFAULT_MAX_CHUNK_CHARS = 24000;

const RETRY_HINT =
  "Tu respuesta anterior no fue un JSON válido o no cumplía el esquema. Responde SOLO con el objeto JSON, sin texto adicional.";

const SYSTEM_PROMPT = `Eres un asistente experto en redactar actas de reunión. Recibes una transcripción con líneas "[mm:ss] Nombre: texto" (la marca de tiempo puede faltar).
Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "language": "código de idioma dominante, por ejemplo es o en",
  "executiveSummary": "resumen ejecutivo de 3 a 5 líneas",
  "topics": [{ "title": "tema", "summary": "una línea" }],
  "decisions": [{ "text": "decisión tomada", "evidence": "cita textual" }],
  "actionItems": [{ "task": "tarea", "owner": "responsable", "dueDate": "fecha límite", "evidence": "cita textual" }],
  "openQuestions": [{ "text": "pregunta sin resolver", "askedBy": "quién la hizo" }],
  "chapters": [{ "title": "capítulo", "startSec": 0, "endSec": 120 }]
}
Reglas estrictas:
- "evidence" es una cita contigua copiada TAL CUAL de lo que dijo alguien, sin el nombre ni la marca de tiempo. Si no puedes citar la frase, no incluyas la decisión ni la tarea.
- "owner" y "dueDate" solo si se dijeron en la reunión. Si no, omite esas claves. Nunca los adivines.
- No inventes información que no esté en la transcripción.
- "chapters": segundos desde el inicio de la reunión, ordenados, sin solaparse y dentro de la duración indicada. Si no hay marcas de tiempo, devuelve [].
- Escribe en el idioma dominante de la transcripción.`;

export function formatTranscript(utterances: SummaryUtterance[]): string {
  return utterances
    .map((u) => {
      const tag = u.offsetSec !== undefined ? `[${formatOffset(u.offsetSec)}] ` : "";
      return `${tag}${u.speakerName}: ${u.text}`;
    })
    .join("\n");
}

export function splitIntoChunks(utterances: SummaryUtterance[], maxChars: number): SummaryUtterance[][] {
  const chunks: SummaryUtterance[][] = [];
  let current: SummaryUtterance[] = [];
  let size = 0;

  for (const u of utterances) {
    const length = formatTranscript([u]).length + 1;
    if (current.length > 0 && size + length > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(u);
    size += length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function durationLine(durationSec: number | undefined): string {
  return durationSec === undefined
    ? "Duración: desconocida (sin marcas de tiempo)."
    : `Duración de la reunión: ${durationSec} segundos.`;
}

export class MeetingSummaryLlmService implements IMeetingSummarizer {
  constructor(
    private callLlm?: LlmCaller,
    private options: MeetingSummaryOptions = {}
  ) {}

  public async summarize(input: SummarizeInput): Promise<MeetingSummary> {
    const participants = calculateParticipants(input.utterances);
    const base = { sessionId: input.sessionId, generatedAt: new Date().toISOString() };

    if (!this.callLlm || input.utterances.length === 0) {
      return this.minimalSummary(base, participants, "no hay un modelo de IA configurado o la reunión no tiene intervenciones");
    }

    try {
      const parts = await this.generateWithRetry(input.utterances);
      return { ...base, ...parts, participants };
    } catch (err) {
      console.warn("[MeetingSummaryLlmService] No se pudo generar el resumen con IA:", err);
      return this.minimalSummary(base, participants, "el modelo de IA falló o devolvió una respuesta inválida");
    }
  }

  private async generateWithRetry(utterances: SummaryUtterance[]): Promise<LlmSummaryParts> {
    try {
      return await this.generate(utterances, undefined);
    } catch (first) {
      console.warn("[MeetingSummaryLlmService] Primer intento fallido, reintentando:", first);
      return await this.generate(utterances, RETRY_HINT);
    }
  }

  private async generate(utterances: SummaryUtterance[], hint: string | undefined): Promise<LlmSummaryParts> {
    const call = this.callLlm!;
    const fullText = formatTranscript(utterances);
    const durationSec = estimateDurationSec(utterances);
    const maxChars = this.options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
    const chunks = splitIntoChunks(utterances, maxChars);
    const suffix = hint ? `\n\n${hint}` : "";

    if (chunks.length <= 1) {
      const user = `${durationLine(durationSec)}\n\nTranscripción:\n${fullText}\n\nGenera el resumen en JSON estricto.${suffix}`;
      return parseLlmSummary(await call(SYSTEM_PROMPT, user), fullText, durationSec);
    }

    const partials: string[] = [];
    for (const chunk of chunks) {
      const text = formatTranscript(chunk);
      const user = `${durationLine(durationSec)}\n\nEsta es SOLO una parte de la reunión.\n\nTranscripción (parte):\n${text}\n\nGenera el resumen parcial en JSON estricto.${suffix}`;
      const parts = parseLlmSummary(await call(SYSTEM_PROMPT, user), text, durationSec);
      partials.push(JSON.stringify(parts));
    }

    const mergeUser = `${durationLine(durationSec)}\n\nA continuación están los resúmenes parciales (JSON) de cada parte de la reunión, en orden. Fusiónalos en UN solo resumen final: elimina duplicados, conserva las citas "evidence" tal cual y reconstruye capítulos coherentes.\n\n${partials.join("\n")}\n\nDevuelve el resumen final en JSON estricto.${suffix}`;
    return parseLlmSummary(await call(SYSTEM_PROMPT, mergeUser), fullText, durationSec);
  }

  private minimalSummary(
    base: { sessionId: string; generatedAt: string },
    participants: MeetingSummary["participants"],
    reason: string
  ): MeetingSummary {
    return {
      ...base,
      language: "es",
      executiveSummary: "El resumen con IA no está disponible para esta reunión.",
      topics: [],
      decisions: [],
      actionItems: [],
      openQuestions: [],
      participants,
      chapters: [],
      note: `El resumen con IA no se pudo generar: ${reason}. Se muestran solo los participantes y su tiempo de habla.`
    };
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: PASS (20 tests). Si el test de bloques falla porque `splitIntoChunks(FIXTURE, 90)` devuelve 1 bloque, baja `maxChunkChars` a 60 en ese test y en el de `splitIntoChunks` (la línea más corta de FIXTURE mide ~58 caracteres).

- [ ] **Step 5: Commit**

```bash
git add algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryLlmService.ts algorithm-manager-bot/src/tests/MeetingSummary.test.ts
git commit -m "feat(bot): LLM meeting summarizer with chunking, retry and fallback"
```

---

### Task 4: Renderer Markdown y extracto de consola

**Files:**
- Create: `algorithm-manager-bot/src/infrastructure/export/MeetingSummaryMarkdownRenderer.ts`
- Modify (tests): `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`

**Interfaces:**
- Consumes: `MeetingSummary` (Task 1), `formatOffset` (Task 1).
- Produces:
  - `renderSummaryMarkdown(summary: MeetingSummary, title?: string): string`
  - `renderConsoleExcerpt(summary: MeetingSummary): string`

- [ ] **Step 1: Añadir los tests que fallan**

Imports arriba: `import { renderSummaryMarkdown, renderConsoleExcerpt } from "../infrastructure/export/MeetingSummaryMarkdownRenderer.js";` y ampliar el import de tipos: `import { MeetingSummary, SummaryUtterance } from "../domain/models/MeetingSummary.js";`

Al final del archivo:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: FAIL (no se resuelve `MeetingSummaryMarkdownRenderer.js`).

- [ ] **Step 3: Implementar**

`algorithm-manager-bot/src/infrastructure/export/MeetingSummaryMarkdownRenderer.ts`:

```ts
import { MeetingSummary } from "../../domain/models/MeetingSummary.js";
import { formatOffset } from "../../domain/timeFormat.js";

const EMPTY = "_Sin elementos._";

function section<T>(title: string, items: T[], renderItem: (item: T) => string): string {
  const body = items.length > 0 ? items.map(renderItem).join("\n") : EMPTY;
  return `## ${title}\n\n${body}`;
}

export function renderSummaryMarkdown(summary: MeetingSummary, title = "Resumen de reunión"): string {
  const parts: string[] = [
    `# ${title}`,
    `_Generado: ${summary.generatedAt} · Sesión: ${summary.sessionId} · Idioma: ${summary.language}_`
  ];

  if (summary.note) parts.push(`> ⚠️ ${summary.note}`);

  parts.push(`## Resumen ejecutivo\n\n${summary.executiveSummary}`);

  parts.push(
    section("Puntos de acción", summary.actionItems, (a) => {
      const meta = [a.owner ? `Responsable: ${a.owner}` : "", a.dueDate ? `Fecha: ${a.dueDate}` : ""]
        .filter(Boolean)
        .join(" · ");
      const head = `- [ ] **${a.task}**${meta ? ` — ${meta}` : ""}`;
      return `${head}\n  > "${a.evidence}"`;
    })
  );

  parts.push(section("Decisiones", summary.decisions, (d) => `- ${d.text}\n  > "${d.evidence}"`));
  parts.push(section("Temas", summary.topics, (t) => `- **${t.title}**: ${t.summary}`));
  parts.push(
    section("Preguntas abiertas", summary.openQuestions, (q) =>
      `- ${q.text}${q.askedBy ? ` _(${q.askedBy})_` : ""}`
    )
  );
  parts.push(
    section(
      "Capítulos",
      summary.chapters,
      (c) => `- \`${formatOffset(c.startSec)}–${formatOffset(c.endSec)}\` ${c.title}`
    )
  );

  const rows = summary.participants.map(
    (p) => `| ${p.name} | ${formatOffset(p.speakingSeconds)} | ${p.speakingPercent}% |`
  );
  parts.push(
    `## Participantes\n\n${
      rows.length > 0
        ? ["| Participante | Tiempo de habla | % |", "|---|---|---|", ...rows].join("\n")
        : EMPTY
    }`
  );

  return parts.join("\n\n") + "\n";
}

export function renderConsoleExcerpt(summary: MeetingSummary): string {
  const lines = [
    `📝 ${summary.executiveSummary}`,
    `   ${summary.actionItems.length} puntos de acción · ${summary.decisions.length} decisiones · ${summary.topics.length} temas · ${summary.chapters.length} capítulos`
  ];
  for (const a of summary.actionItems.slice(0, 5)) {
    lines.push(`   • ${a.task}${a.owner ? ` (${a.owner})` : ""}`);
  }
  if (summary.note) lines.push(`   ⚠️ ${summary.note}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
git add algorithm-manager-bot/src/infrastructure/export/MeetingSummaryMarkdownRenderer.ts algorithm-manager-bot/src/tests/MeetingSummary.test.ts
git commit -m "feat(bot): markdown renderer and console excerpt for meeting summary"
```

---

### Task 5: Integración en `AutonomousMeetingBotService` (NO commitear)

**Files:**
- Modify: `algorithm-manager-bot/src/infrastructure/connectors/PlatformSpeakerExtractor.ts:1-6`
- Modify: `algorithm-manager-bot/src/application/AutonomousMeetingBotService.ts`
- Modify (tests): `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`

**Interfaces:**
- Consumes: `IMeetingSummarizer`, `SummarizeInput` (Task 1); `MeetingSummaryLlmService` (Task 3); `renderSummaryMarkdown`, `renderConsoleExcerpt` (Task 4).
- Produces:
  - `ExtractedUtterance.offsetSec?: number`
  - `AutonomousMeetingBotService` constructor con 5º parámetro `summarizer: IMeetingSummarizer = new MeetingSummaryLlmService()`
  - `AutonomousMeetingRecord.summaryMarkdownPath?: string` y `summaryJsonPath?: string`

- [ ] **Step 1: Añadir el test que falla**

Imports arriba de `MeetingSummary.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AutonomousMeetingBotService } from "../application/AutonomousMeetingBotService.js";
import { MeetingClassifierLlmService } from "../infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "../infrastructure/ai/CommercialProposalLlmService.js";
```

Al final del archivo:

```ts
describe("AutonomousMeetingBotService + resumen", () => {
  it("asigna offsetSec y escribe Resumen_<id>.md y .json junto a los demás entregables", async () => {
    const bot = new AutonomousMeetingBotService(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      undefined,
      undefined,
      new MeetingSummaryLlmService()
    );

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
  }, 15000);
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/tests/MeetingSummary.test.ts -t "AutonomousMeetingBotService"`
Expected: FAIL (`offsetSec` indefinido / `summaryMarkdownPath` indefinido).

- [ ] **Step 3: Implementar**

3a. En `PlatformSpeakerExtractor.ts`, añadir el campo a la interfaz:

```ts
export interface ExtractedUtterance {
  speakerName: string;
  content: string;
  timestamp: string;
  platform: string;
  /** Segundos desde el inicio de la reunión; lo asigna AutonomousMeetingBotService.recordUtterance. */
  offsetSec?: number;
}
```

3b. En `AutonomousMeetingBotService.ts`:

- Imports nuevos (junto a los demás imports):

```ts
import { IMeetingSummarizer } from "../domain/services/IMeetingSummarizer.js";
import { MeetingSummaryLlmService } from "../infrastructure/ai/MeetingSummaryLlmService.js";
import {
  renderConsoleExcerpt,
  renderSummaryMarkdown
} from "../infrastructure/export/MeetingSummaryMarkdownRenderer.js";
```

- En `AutonomousMeetingRecord`, tras `proposalMarkdownPath?: string;` añadir:

```ts
  summaryMarkdownPath?: string;
  summaryJsonPath?: string;
```

- Constructor: añadir un 5º parámetro tras `docxExporter`:

```ts
    private docxExporter: TranscriptDocxExporter = new TranscriptDocxExporter(),
    private summarizer: IMeetingSummarizer = new MeetingSummaryLlmService()
```

- Reemplazar `recordUtterance` por:

```ts
  public recordUtterance(utterance: ExtractedUtterance): void {
    if (!this.isRunning) return;
    const withOffset: ExtractedUtterance =
      utterance.offsetSec !== undefined
        ? utterance
        : { ...utterance, offsetSec: Math.round((Date.now() - this.startTime) / 1000) };
    this.activeUtterances.push(withOffset);
  }
```

- En `finalizeAndGenerateDeliverables`, justo antes de `return {` (después del bloque `if/else` de entregables), insertar:

```ts
    // 5. Resumen estilo Fireflies (nunca bloquea los demás entregables)
    let summaryMarkdownPath: string | undefined;
    let summaryJsonPath: string | undefined;
    try {
      const summary = await this.summarizer.summarize({
        sessionId,
        utterances: this.activeUtterances.map((u) => ({
          speakerName: u.speakerName,
          text: u.content,
          offsetSec: u.offsetSec
        }))
      });
      const mdPath = path.join(outputDir, `Resumen_${sessionId}.md`);
      const jsonPath = path.join(outputDir, `Resumen_${sessionId}.json`);
      fs.writeFileSync(mdPath, renderSummaryMarkdown(summary, `Reunión ${platform}`), "utf-8");
      fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf-8");
      summaryMarkdownPath = mdPath;
      summaryJsonPath = jsonPath;
      console.info(`[AutonomousBot] Resumen generado: ${mdPath}\n${renderConsoleExcerpt(summary)}`);
    } catch (err) {
      console.warn("[AutonomousBot] No se pudo generar el resumen; los demás entregables siguen disponibles:", err);
    }
```

- En el objeto del `return`, tras `proposalMarkdownPath,` añadir:

```ts
      summaryMarkdownPath,
      summaryJsonPath,
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/tests/MeetingSummary.test.ts`
Expected: PASS (24 tests). Luego `npx vitest run` completo: los 10 tests originales siguen pasando. `npx tsc --noEmit`: sin errores.

- [ ] **Step 5: NO commitear**

Estos archivos tienen trabajo previo sin commitear del usuario. Deja los cambios en el árbol de trabajo y anótalo en el reporte final.

---

### Task 6: Integración en `ProcessMeetingSessionUseCase` (NO commitear)

**Files:**
- Create: `algorithm-manager-bot/src/application/transcriptParsing.ts`
- Modify: `algorithm-manager-bot/src/application/ProcessMeetingSessionUseCase.ts`
- Modify: `algorithm-manager-bot/src/tests/ProcessMeetingSession.test.ts:143-145`
- Modify (tests): `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`

**Interfaces:**
- Consumes: `IMeetingSummarizer`, `MeetingSummary`, `SummaryUtterance` (Task 1); `MeetingSummaryLlmService` (Task 3).
- Produces:
  - `parseTranscriptLines(transcript: string): SummaryUtterance[]`
  - `ProcessMeetingInput.utterances?: SummaryUtterance[]`
  - `ProcessMeetingOutput.summary: MeetingSummary` (reemplaza `internalSummary`)
  - constructor `ProcessMeetingSessionUseCase(classifier, proposalGenerator, summarizer: IMeetingSummarizer = new MeetingSummaryLlmService())`

- [ ] **Step 1: Añadir los tests que fallan**

Imports arriba de `MeetingSummary.test.ts`:

```ts
import { parseTranscriptLines } from "../application/transcriptParsing.js";
import { ProcessMeetingSessionUseCase } from "../application/ProcessMeetingSessionUseCase.js";
```

Al final del archivo:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/tests/MeetingSummary.test.ts -t "ProcessMeetingSessionUseCase"`
Expected: FAIL (no se resuelve `transcriptParsing.js` / `output.summary` indefinido).

- [ ] **Step 3: Implementar**

3a. Crear `algorithm-manager-bot/src/application/transcriptParsing.ts`:

```ts
import { SummaryUtterance } from "../domain/models/MeetingSummary.js";

const LINE_PATTERN = /^\s*(?:\[[^\]]*\]\s*)?([^:\n]{1,60}):\s*(.+)$/;

/** Convierte texto plano "[mm:ss] Nombre: texto" en intervenciones (sin offsets). */
export function parseTranscriptLines(transcript: string): SummaryUtterance[] {
  const utterances: SummaryUtterance[] = [];
  for (const line of transcript.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const match = LINE_PATTERN.exec(line);
    const speaker = match?.[1];
    const text = match?.[2];
    if (speaker && text) {
      utterances.push({ speakerName: speaker.trim(), text: text.trim() });
    } else {
      utterances.push({ speakerName: "Participante", text: line.trim() });
    }
  }
  return utterances;
}
```

3b. Reescribir `ProcessMeetingSessionUseCase.ts` completo:

```ts
import { MeetingClassification, BotConnectionMode } from "../domain/models/MeetingTypes.js";
import { CommercialProposal } from "../domain/models/CommercialProposal.js";
import { MeetingSummary, SummaryUtterance } from "../domain/models/MeetingSummary.js";
import { IMeetingClassifier } from "../domain/services/IMeetingClassifier.js";
import { ICommercialProposalGenerator } from "../domain/services/ICommercialProposalGenerator.js";
import { IMeetingSummarizer } from "../domain/services/IMeetingSummarizer.js";
import { MeetingSummaryLlmService } from "../infrastructure/ai/MeetingSummaryLlmService.js";
import { parseTranscriptLines } from "./transcriptParsing.js";

export interface ProcessMeetingInput {
  sessionId?: string;
  transcript: string;
  /** Si se entregan, se usan en lugar de parsear `transcript` (traen offsets de tiempo). */
  utterances?: SummaryUtterance[];
  mode?: BotConnectionMode;
  clientHint?: string;
  companyContext?: string;
}

export interface ProcessMeetingOutput {
  sessionId: string;
  classification: MeetingClassification;
  mode: BotConnectionMode;
  summary: MeetingSummary;
  commercialProposal?: CommercialProposal;
}

export class ProcessMeetingSessionUseCase {
  constructor(
    private meetingClassifier: IMeetingClassifier,
    private proposalGenerator: ICommercialProposalGenerator,
    private summarizer: IMeetingSummarizer = new MeetingSummaryLlmService()
  ) {}

  public async execute(input: ProcessMeetingInput): Promise<ProcessMeetingOutput> {
    if (!input.transcript || input.transcript.trim().length === 0) {
      throw new Error("No se proporcionó una transcripción válida para procesar la reunión.");
    }

    const sessionId = input.sessionId || `session-${Date.now()}`;
    const mode = input.mode || "LOCAL_CAPTURE";

    // 1. Clasificación de la reunión (Interna vs Comercial/Cliente)
    const classification = await this.meetingClassifier.classify(input.transcript);

    // Si el usuario especificó un hint explícito de cliente, lo preservamos
    if (input.clientHint && !classification.clientName) {
      classification.clientName = input.clientHint;
    }

    // 2. Resumen estilo Fireflies para toda reunión
    const summary = await this.summarizer.summarize({
      sessionId,
      utterances: input.utterances ?? parseTranscriptLines(input.transcript)
    });

    // 3. Entregable adicional según el tipo de reunión
    if (classification.type === "COMMERCIAL_CLIENT") {
      const commercialProposal = await this.proposalGenerator.generateProposal(
        input.transcript,
        classification,
        input.companyContext
      );
      return { sessionId, classification, mode, summary, commercialProposal };
    }

    return { sessionId, classification, mode, summary };
  }
}
```

3c. En `ProcessMeetingSession.test.ts`, reemplazar las líneas 144-145:

```ts
      expect(output.internalSummary).toBeDefined();
      expect(output.internalSummary?.actionItemsSuggested).toBe(true);
```
por:
```ts
      expect(output.summary).toBeDefined();
      expect(output.summary.sessionId).toBe(output.sessionId);
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run`
Expected: PASS en ambos archivos (los 10 originales + los nuevos). `npx tsc --noEmit`: sin errores. `grep -rn internalSummary src` debe devolver vacío.

- [ ] **Step 5: NO commitear**

Mismo motivo que la Tarea 5. Deja los cambios en el árbol de trabajo.

---

### Task 7: CLI, exports, README y verificación final (NO commitear)

**Files:**
- Modify: `algorithm-manager-bot/src/cli.ts`
- Modify: `algorithm-manager-bot/src/index.ts`
- Modify: `algorithm-manager-bot/README.md`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: CLI**

En `cli.ts`, añadir el import junto a los demás de infraestructura:

```ts
import { MeetingSummaryLlmService } from "./infrastructure/ai/MeetingSummaryLlmService.js";
```

Reemplazar la línea `const botService = new AutonomousMeetingBotService(classifier, proposalGen);` por:

```ts
  const summarizer = new MeetingSummaryLlmService(callLlm);
  const botService = new AutonomousMeetingBotService(
    classifier,
    proposalGen,
    undefined,
    undefined,
    summarizer
  );
```

Tras el bloque `if (result.proposalMarkdownPath) { ... }` añadir:

```ts
  if (result.summaryMarkdownPath) {
    console.log(`   📝 Resumen (.md)          : ${result.summaryMarkdownPath}`);
    console.log(`   🧾 Resumen (.json)        : ${result.summaryJsonPath}`);
  }
```

- [ ] **Step 2: Exports**

En `index.ts` añadir, en la sección correspondiente:

```ts
export * from "./domain/models/MeetingSummary.js";
export * from "./domain/services/IMeetingSummarizer.js";
export * from "./domain/services/SpeakingStatsCalculator.js";
export * from "./domain/timeFormat.js";
```
```ts
export * from "./infrastructure/export/MeetingSummaryMarkdownRenderer.js";
export * from "./infrastructure/ai/MeetingSummaryLlmService.js";
export * from "./infrastructure/ai/MeetingSummaryValidator.js";
```
```ts
export * from "./application/transcriptParsing.js";
```

- [ ] **Step 3: README**

En `README.md`, dentro de "Capacidades Principales", añadir el punto 3:

```md
3. **Resumen estilo Fireflies**: al terminar cada reunión (interna o comercial) genera `Resumen_<sesión>.md` y `Resumen_<sesión>.json` con resumen ejecutivo, puntos de acción con responsable y cita textual, decisiones, temas, preguntas abiertas, participantes con tiempo de habla y capítulos con marcas de tiempo. Las tareas y decisiones sin respaldo textual en la transcripción se descartan. Si no hay modelo de IA o este falla, se entrega un resumen mínimo con los participantes y una nota.
```

En "Arquitectura", añadir a la lista de `src/infrastructure/` los archivos `MeetingSummaryLlmService.ts`, `MeetingSummaryValidator.ts` y `MeetingSummaryMarkdownRenderer.ts`.

- [ ] **Step 4: Verificación final**

Run (desde `algorithm-manager-bot/`):
- `npx tsc --noEmit` → Expected: sin errores.
- `npx vitest run` → Expected: todos los tests pasan (10 originales + los nuevos).
- `wc -l src/infrastructure/ai/MeetingSummaryLlmService.ts src/infrastructure/ai/MeetingSummaryValidator.ts src/infrastructure/export/MeetingSummaryMarkdownRenderer.ts` → Expected: cada archivo bajo 500 líneas.
- Prueba manual sin LLM: `cd .. && npm run bot -- --file <un .txt con líneas "Nombre: texto">` → Expected: en `output/` aparece `Resumen_<id>.md` con la nota del resumen mínimo y la tabla de participantes.

- [ ] **Step 5: NO commitear**

Reporta al usuario la lista de archivos modificados (Tareas 5–7) para que los incluya en su propio commit.
