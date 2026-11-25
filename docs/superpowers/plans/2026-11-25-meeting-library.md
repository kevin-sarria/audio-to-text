# Biblioteca de reuniones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las reuniones que atiende el bot aparezcan en el Historial de la app de escritorio, con su resumen completo, búsqueda de texto, filtros y una lista de pendientes entre reuniones.

**Architecture:** El bot escribe un `reunion_<id>.json` (escritura atómica); un importador en el backend lo convierte en una sesión SQLite (`source = 'BOT'`, sin audio) con hablantes, segmentos, resumen y puntos de acción, en una transacción y sin duplicados. Un módulo de biblioteca **solo de escritorio** (`backend/src/desktop/library`, rutas `/api/desktop/library/*`) sirve el listado con filtros/búsqueda, el resumen y los puntos de acción. La búsqueda usa `LIKE` sobre un texto normalizado indexado de forma perezosa (sin FTS5). El frontend extiende Historial y página de sesión y añade la página Pendientes.

**Tech Stack:** TypeScript (ESM NodeNext, `strict`, `noUncheckedIndexedAccess`), `node:sqlite` (`DatabaseSync`), Express, zod, vitest, React + MUI. Spec: `docs/superpowers/specs/2026-11-25-meeting-library-design.md`.

## Global Constraints

- Ningún archivo supera las 500 líneas de código.
- Imports relativos con extensión `.js` (ESM NodeNext). Todo texto de cara al usuario en español.
- Todas las consultas de la biblioteca se limitan a `user_id = req.user.userId` (en escritorio es `LOCAL_USER_ID`).
- El importador nunca modifica, mueve ni borra los archivos de origen, y nunca pisa el estado `done` de un punto de acción ya importado.
- Las pruebas no usan red real ni navegador real. Las rutas se prueban con un `express()` mínimo que inyecta `req.user`; una sola prueba usa `startDesktopServer` con la cookie `accessToken=<launchToken>`.
- Respetar los finales de línea de cada archivo: casi todo es LF, pero `frontend/src/pages/SessionPage.tsx` es CRLF. Tras editar un archivo, comprobar con `tr -cd '\r' < ARCHIVO | wc -c` (0 = LF) que no se mezclaron. Ediciones dirigidas, nunca reescribir archivos completos que ya existen.
- Comandos desde la raíz del repo salvo que se indique. Línea base antes de empezar: `cd backend && npx tsc --noEmit && npx vitest run` (388 tests), `cd frontend && npx tsc --noEmit && npx vitest run` (69), `cd algorithm-manager-bot && npx tsc --noEmit && npx vitest run` (44). Tras tocar `packages/shared`, ejecutar `cd packages/shared && npm run build` (backend y frontend consumen su `dist/`).
- **NO hacer commits.** El árbol de trabajo tiene cambios del usuario sin commitear en varios archivos de este plan (marcados ⚠). El usuario decide cuándo commitear; la última tarea lista los archivos tocados. Nunca `git add -A`, `git stash`, `git checkout` ni `git reset`.

⚠ Archivos con trabajo previo del usuario sin commitear que este plan toca: `packages/shared/src/index.ts`, `packages/shared/src/dto/botSettings.dto.ts`, `backend/src/interfaces/http/routes/bot.routes.ts`, `backend/src/infrastructure/bot/MeetingBotConfigManager.ts` (solo se lee), `backend/src/desktop/http/desktop.routes.ts`, `frontend/src/pages/settings/components/MeetingBotSettingsSection.tsx`. Editar solo las líneas que el plan indica.

## Desviaciones deliberadas respecto al spec

1. **Rutas en `/api/desktop/library/*`**, no en `/sessions` y `/action-items`. El listado compartido (`SessionController.list`) usa `ISessionRepository`, también implementado con Prisma para la versión web, que no tiene `source`; ampliarlo tocaría ambos. La biblioteca es solo de escritorio. En modo web el Historial sigue usando `/sessions`. La Tarea 1 actualiza el spec.
2. **`PATCH /library/action-items/:id` se entrega en F2**, no en F4: la pestaña de resumen de F2 ya muestra casillas y no debe ser una casilla muerta. F4 añade el listado entre reuniones y Pendientes.
3. **`GET /library/sessions` nace en F1** (con paginación y filtro `source`) porque el Historial necesita `source` para la etiqueta; F3 y F4 le añaden `q` y los demás filtros.
4. **`GET /library/participants`** (nombres distintos de hablantes) se añade en F4 para poblar el selector de participante.
5. **El campo "esta reunión es de bot" en la página de sesión** se deduce de `fileFormat === "bot"` (ya viaja en `GET /sessions/:id`), sin tocar la entidad de dominio ni Prisma.
6. **Limitación conocida:** renombrar un hablante no actualiza el índice de búsqueda hasta que cambie otra cosa de la sesión (el filtro por participante sí lee `speakers` directamente).

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `packages/shared/src/dto/botMeeting.dto.ts` | Crear | Esquema zod del archivo de entrega y su tipo. |
| `packages/shared/src/dto/library.dto.ts` | Crear | DTOs y esquemas de consulta de la biblioteca. |
| `packages/shared/src/dto/session.dto.ts`, `src/index.ts` ⚠ | Modificar | Campos opcionales `source`/`occurredAt`; exports. |
| `algorithm-manager-bot/src/infrastructure/export/BotMeetingDeliveryWriter.ts` | Crear | Escribe `reunion_<id>.json` de forma atómica. |
| `algorithm-manager-bot/src/application/AutonomousMeetingBotService.ts` | Modificar | Escribe el archivo de entrega y expone su ruta. |
| `backend/src/desktop/infrastructure/sqlite/migrations.ts` | Modificar | Migración 6; exporta `MIGRATIONS`. |
| `backend/src/desktop/library/botMeetingMapping.ts` | Crear | Tiempos de segmento, título, duración. |
| `backend/src/desktop/library/ImportBotMeetings.ts` | Crear | Importador transaccional. |
| `backend/src/desktop/infrastructure/sqlite/SqliteLibraryRepository.ts` | Crear | Listado, filtros, búsqueda, resumen, puntos de acción. |
| `backend/src/desktop/library/searchText.ts`, `searchSnippet.ts`, `SessionSearchIndexer.ts` | Crear | Normalización, fragmentos e índice perezoso. |
| `backend/src/desktop/http/routes/library.routes.ts` | Crear | Rutas `/library/*`. |
| `backend/src/infrastructure/bot/botOutputDir.ts` | Crear | Resuelve la carpeta de entrega. |
| `backend/src/desktop/composition-root.desktop.ts`, `server.ts`, `http/desktop.routes.ts` ⚠ | Modificar | Cableado e importación al arrancar. |
| `frontend/src/features/history/*`, `features/library/*`, `pages/PendientesPage.tsx` | Crear/Modificar | Pantallas. |
| `frontend/src/pages/SessionPage.tsx`, `features/player/SegmentList.tsx`, `components/AppShell.tsx`, `App.tsx` | Modificar | Pestaña de resumen, saltos a la transcripción, navegación. |

---

# FASE 1 — Importar reuniones del bot

### Task 1: Contrato compartido y spec actualizado

**Files:**
- Create: `packages/shared/src/dto/botMeeting.dto.ts`
- Create: `packages/shared/src/dto/library.dto.ts`
- Modify: `packages/shared/src/dto/session.dto.ts` (añadir dos campos opcionales a `TranscriptionSessionDto`)
- Modify ⚠: `packages/shared/src/index.ts` (dos líneas de export)
- Modify: `docs/superpowers/specs/2026-11-25-meeting-library-design.md` (sección 5)
- Create: `backend/src/tests/helpers/botMeetingFixtures.ts`
- Test: `backend/src/tests/unit/BotMeetingDeliverySchema.test.ts`

**Interfaces:**
- Produces: `BotMeetingDeliverySchema`, `BotMeetingDelivery`, `BOT_MEETING_SCHEMA_VERSION`; `SessionSource`, `LibrarySessionItemDto`, `ImportBotMeetingsResultDto`, `LibrarySessionsQuerySchema`, `LibrarySessionsQuery`; fixture `makeDelivery(overrides?)`.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/tests/helpers/botMeetingFixtures.ts`:

```ts
import type { BotMeetingDelivery } from "@audio-to-text/shared";

export function makeDelivery(overrides: Partial<BotMeetingDelivery> = {}): BotMeetingDelivery {
  return {
    schemaVersion: 1,
    sessionId: "bot-session-1001",
    platform: "GOOGLE_MEET",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    startedAt: "2026-11-25T14:00:00.000Z",
    endedAt: "2026-11-25T14:30:00.000Z",
    meetingType: "INTERNAL",
    classificationReason: "Sprint planning",
    utterances: [
      { speakerName: "Ana", text: "Vamos a migrar la base de datos el viernes.", offsetSec: 0 },
      { speakerName: "Luis", text: "Yo me encargo de preparar el script de migración.", offsetSec: 12 },
      { speakerName: "Ana", text: "Perfecto, ¿alguien sabe quién aprueba el presupuesto?", offsetSec: 30 }
    ],
    summary: {
      sessionId: "bot-session-1001",
      generatedAt: "2026-11-25T14:31:00.000Z",
      language: "es",
      executiveSummary: "Se acordó migrar la base de datos el viernes.",
      topics: [{ title: "Migración", summary: "Plan de migración." }],
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar la base de datos el viernes." }],
      actionItems: [
        {
          task: "Preparar el script de migración",
          owner: "Luis",
          dueDate: "jueves",
          evidence: "Yo me encargo de preparar el script de migración."
        },
        { task: "Definir quién aprueba el presupuesto", evidence: "alguien sabe quién aprueba el presupuesto" }
      ],
      openQuestions: [{ text: "¿Quién aprueba el presupuesto?", askedBy: "Ana" }],
      participants: [
        { name: "Luis", speakingSeconds: 18, speakingPercent: 54.9 },
        { name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 }
      ],
      chapters: [{ title: "Migración", startSec: 0, endSec: 30 }]
    },
    ...overrides
  };
}
```

`backend/src/tests/unit/BotMeetingDeliverySchema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BotMeetingDeliverySchema } from "@audio-to-text/shared";
import { makeDelivery } from "../helpers/botMeetingFixtures.js";

describe("BotMeetingDeliverySchema", () => {
  it("acepta un archivo de entrega válido", () => {
    expect(BotMeetingDeliverySchema.safeParse(makeDelivery()).success).toBe(true);
  });

  it("rechaza una schemaVersion distinta de 1", () => {
    const bad = { ...makeDelivery(), schemaVersion: 2 };
    expect(BotMeetingDeliverySchema.safeParse(bad).success).toBe(false);
  });

  it("rechaza utterances vacías, sin resumen, con fechas inválidas o con offsets negativos", () => {
    expect(BotMeetingDeliverySchema.safeParse({ ...makeDelivery(), utterances: [] }).success).toBe(false);

    const { summary: _omit, ...withoutSummary } = makeDelivery();
    expect(BotMeetingDeliverySchema.safeParse(withoutSummary).success).toBe(false);

    expect(BotMeetingDeliverySchema.safeParse({ ...makeDelivery(), startedAt: "no es una fecha" }).success).toBe(false);

    const negative = makeDelivery({
      utterances: [{ speakerName: "Ana", text: "hola", offsetSec: -1 }]
    });
    expect(BotMeetingDeliverySchema.safeParse(negative).success).toBe(false);
  });

  it("rechaza hablantes o textos vacíos", () => {
    const blankSpeaker = makeDelivery({ utterances: [{ speakerName: "", text: "hola", offsetSec: 0 }] });
    const blankText = makeDelivery({ utterances: [{ speakerName: "Ana", text: "", offsetSec: 0 }] });
    expect(BotMeetingDeliverySchema.safeParse(blankSpeaker).success).toBe(false);
    expect(BotMeetingDeliverySchema.safeParse(blankText).success).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/tests/unit/BotMeetingDeliverySchema.test.ts`
Expected: FAIL (`BotMeetingDeliverySchema` no está exportado por `@audio-to-text/shared`).

- [ ] **Step 3: Implementar**

`packages/shared/src/dto/botMeeting.dto.ts`:

```ts
import { z } from "zod";

export const BOT_MEETING_SCHEMA_VERSION = 1;

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Fecha ISO inválida");

export const BotMeetingSummarySchema = z.object({
  sessionId: z.string(),
  generatedAt: z.string(),
  language: z.string().min(1),
  executiveSummary: z.string().min(1),
  topics: z.array(z.object({ title: z.string(), summary: z.string() })),
  decisions: z.array(z.object({ text: z.string(), evidence: z.string() })),
  actionItems: z.array(
    z.object({
      task: z.string().min(1),
      owner: z.string().optional(),
      dueDate: z.string().optional(),
      evidence: z.string()
    })
  ),
  openQuestions: z.array(z.object({ text: z.string(), askedBy: z.string().optional() })),
  participants: z.array(
    z.object({ name: z.string(), speakingSeconds: z.number(), speakingPercent: z.number() })
  ),
  chapters: z.array(z.object({ title: z.string(), startSec: z.number(), endSec: z.number() })),
  note: z.string().optional()
});

/** Archivo `reunion_<sessionId>.json` que el bot deja en su carpeta de salida y la app importa. */
export const BotMeetingDeliverySchema = z.object({
  schemaVersion: z.literal(BOT_MEETING_SCHEMA_VERSION),
  sessionId: z.string().min(1).max(200),
  platform: z.enum(["GOOGLE_MEET", "MICROSOFT_TEAMS", "ZOOM", "LOCAL_DESKTOP"]),
  meetingUrl: z.string(),
  startedAt: isoDate,
  endedAt: isoDate,
  meetingType: z.enum(["INTERNAL", "COMMERCIAL_CLIENT"]),
  classificationReason: z.string(),
  utterances: z
    .array(
      z.object({
        speakerName: z.string().min(1),
        text: z.string().min(1),
        offsetSec: z.number().min(0)
      })
    )
    .min(1),
  summary: BotMeetingSummarySchema
});

export type BotMeetingDelivery = z.infer<typeof BotMeetingDeliverySchema>;
```

`packages/shared/src/dto/library.dto.ts`:

```ts
import { z } from "zod";
import type { SessionStatus } from "../enums.js";

export type SessionSource = "AUDIO" | "BOT";

export interface LibrarySessionItemDto {
  id: string;
  originalFileName: string;
  fileFormat: string;
  projectFolderId: string | null;
  status: SessionStatus;
  durationSeconds: number | null;
  fileSizeBytes: string;
  audioExpiresAt: string;
  isAudioPurged: boolean;
  createdAt: string;
  source: SessionSource;
  /** Fecha real de la reunión (para audios, la de creación). */
  occurredAt: string;
}

export interface ImportBotMeetingsResultDto {
  imported: number;
  alreadyImported: number;
  failed: { file: string; reason: string }[];
  folderMissing: boolean;
  folder: string;
}

export const LibrarySessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  source: z.enum(["AUDIO", "BOT"]).optional()
});

export type LibrarySessionsQuery = z.infer<typeof LibrarySessionsQuerySchema>;
```

En `packages/shared/src/dto/session.dto.ts`, dentro de `TranscriptionSessionDto`, tras `updatedAt: string;` añadir:

```ts
  /** Solo en el modo escritorio con biblioteca: origen de la sesión y fecha real de la reunión. */
  source?: "AUDIO" | "BOT";
  occurredAt?: string;
```

En `packages/shared/src/index.ts` ⚠ añadir al final dos líneas (sin tocar las existentes):

```ts
export * from "./dto/botMeeting.dto.js";
export * from "./dto/library.dto.js";
```

En el spec, sección "5. API": sustituir el párrafo introductorio ("Todo bajo `/sessions`, con la misma autenticación…") y los paths de la tabla por: "Todo bajo `/api/desktop/library/*` (rutas solo de escritorio, autenticadas con la cookie local; cada consulta se limita al usuario local). El listado conserva `page` y `limit`. En modo web el Historial sigue usando `/sessions`." y la tabla con `POST /library/import`, `GET /library/sessions`, `GET /library/sessions/:id/meeting-summary`, `GET /library/action-items`, `GET /library/participants`, `PATCH /library/action-items/:id`. En "7. Fases", mover `PATCH` a F2 y `participants` a F4.

- [ ] **Step 4: Compilar shared, ejecutar y verificar que pasa**

Run: `cd packages/shared && npm run build && cd ../../backend && npx vitest run src/tests/unit/BotMeetingDeliverySchema.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests), `tsc` sin errores.

- [ ] **Step 5: Checkpoint (sin commit)** — `git status --short packages docs backend/src/tests` debe mostrar solo los archivos de esta tarea.

---

### Task 2: El bot escribe el archivo de entrega

**Files:**
- Create: `algorithm-manager-bot/src/infrastructure/export/BotMeetingDeliveryWriter.ts`
- Create: `algorithm-manager-bot/src/tests/helpers/stubConnector.ts` (extraído de `MeetingSummary.test.ts`)
- Modify: `algorithm-manager-bot/src/tests/MeetingSummary.test.ts` (usar el helper extraído)
- Modify: `algorithm-manager-bot/src/application/AutonomousMeetingBotService.ts`
- Test: `algorithm-manager-bot/src/tests/BotMeetingDelivery.test.ts`

**Interfaces:**
- Consumes: `MeetingSummary` (`src/domain/models/MeetingSummary.ts`), `BotMeetingDeliverySchema` de `@audio-to-text/shared` (solo en tests; el bot no depende de `shared` en su código).
- Produces: `writeBotMeetingDelivery(outputDir: string, delivery: BotMeetingDelivery): string`; `AutonomousMeetingRecord.deliveryFilePath?: string`.

- [ ] **Step 1: Extraer el helper `stubConnector`**

Leer `algorithm-manager-bot/src/tests/MeetingSummary.test.ts`, localizar la función `stubConnector()` (la que hace `vi.spyOn(HeadlessMeetingBotConnector.prototype, "connectToMeeting")` y `"leaveMeeting"`) y moverla tal cual a `algorithm-manager-bot/src/tests/helpers/stubConnector.ts` con `export function stubConnector()` y sus imports (`vi` de vitest y `HeadlessMeetingBotConnector`). En `MeetingSummary.test.ts` reemplazar la definición por `import { stubConnector } from "./helpers/stubConnector.js";`. Run: `cd algorithm-manager-bot && npx vitest run src/tests/MeetingSummary.test.ts` → los 34 tests siguen pasando.

- [ ] **Step 2: Escribir el test que falla**

`algorithm-manager-bot/src/tests/BotMeetingDelivery.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { BotMeetingDeliverySchema } from "@audio-to-text/shared";
import { writeBotMeetingDelivery } from "../infrastructure/export/BotMeetingDeliveryWriter.js";
import { AutonomousMeetingBotService } from "../application/AutonomousMeetingBotService.js";
import { MeetingClassifierLlmService } from "../infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "../infrastructure/ai/CommercialProposalLlmService.js";
import { MeetingSummaryLlmService } from "../infrastructure/ai/MeetingSummaryLlmService.js";
import { stubConnector } from "./helpers/stubConnector.js";

const baseDelivery = {
  schemaVersion: 1 as const,
  sessionId: "bot-session-1",
  platform: "GOOGLE_MEET" as const,
  meetingUrl: "https://meet.google.com/test-room",
  startedAt: "2026-11-25T14:00:00.000Z",
  endedAt: "2026-11-25T14:10:00.000Z",
  meetingType: "INTERNAL" as const,
  classificationReason: "Sprint planning",
  utterances: [{ speakerName: "Ana", text: "Hola equipo.", offsetSec: 0 }],
  summary: {
    sessionId: "bot-session-1",
    generatedAt: "2026-11-25T14:11:00.000Z",
    language: "es",
    executiveSummary: "Resumen.",
    topics: [],
    decisions: [],
    actionItems: [],
    openQuestions: [],
    participants: [{ name: "Ana", speakingSeconds: 1, speakingPercent: 100 }],
    chapters: []
  }
};

describe("BotMeetingDeliveryWriter", () => {
  const dirs: string[] = [];
  const tmp = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "bot-delivery-"));
    dirs.push(d);
    return d;
  };
  afterEach(() => {
    vi.restoreAllMocks();
    while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it("escribe reunion_<id>.json de forma atómica y válida contra el esquema compartido", () => {
    const dir = tmp();
    const file = writeBotMeetingDelivery(dir, baseDelivery);

    expect(file).toBe(path.join(dir, "reunion_bot-session-1.json"));
    expect(fs.readdirSync(dir)).toEqual(["reunion_bot-session-1.json"]); // sin .tmp residual
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(BotMeetingDeliverySchema.safeParse(parsed).success).toBe(true);
  });

  it("sanea el nombre de archivo pero conserva el sessionId real dentro del JSON", () => {
    const dir = tmp();
    const file = writeBotMeetingDelivery(dir, { ...baseDelivery, sessionId: "a/b:c" });
    expect(path.basename(file)).toBe("reunion_a_b_c.json");
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).sessionId).toBe("a/b:c");
  });

  it("el servicio del bot escribe el archivo de entrega junto a los demás entregables", async () => {
    stubConnector();
    const bot = new AutonomousMeetingBotService(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      undefined,
      undefined,
      new MeetingSummaryLlmService()
    );
    const sessionId = await bot.startAutonomousMeeting({ meetingUrl: "https://meet.google.com/test-room", headless: true });
    bot.recordUtterance({ speakerName: "David", content: "Vamos a cerrar los bugs de auth.", timestamp: "09:00:00", platform: "GOOGLE_MEET" });
    bot.recordUtterance({ speakerName: "Marta", content: "Yo reviso el PR del backend.", timestamp: "09:00:05", platform: "GOOGLE_MEET" });

    const dir = tmp();
    const record = await bot.finalizeAndGenerateDeliverables(sessionId, "https://meet.google.com/test-room", dir);

    expect(record.deliveryFilePath).toBe(path.join(dir, `reunion_${sessionId}.json`));
    const parsed = JSON.parse(fs.readFileSync(record.deliveryFilePath!, "utf-8"));
    expect(BotMeetingDeliverySchema.safeParse(parsed).success).toBe(true);
    expect(parsed.sessionId).toBe(sessionId);
    expect(parsed.utterances).toHaveLength(2);
    expect(typeof parsed.utterances[0].offsetSec).toBe("number");
    expect(parsed.summary.participants.map((p: { name: string }) => p.name).sort()).toEqual(["David", "Marta"]);
  }, 10000);

  it("sin intervenciones no escribe archivo de entrega", async () => {
    stubConnector();
    const bot = new AutonomousMeetingBotService(
      new MeetingClassifierLlmService(),
      new CommercialProposalLlmService(),
      undefined,
      undefined,
      new MeetingSummaryLlmService()
    );
    const sessionId = await bot.startAutonomousMeeting({ meetingUrl: "https://meet.google.com/test-room", headless: true });
    const dir = tmp();
    const record = await bot.finalizeAndGenerateDeliverables(sessionId, "https://meet.google.com/test-room", dir);
    expect(record.deliveryFilePath).toBeUndefined();
    expect(fs.readdirSync(dir).some((f) => f.startsWith("reunion_"))).toBe(false);
  }, 10000);
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

Run: `cd algorithm-manager-bot && npx vitest run src/tests/BotMeetingDelivery.test.ts`
Expected: FAIL (no se resuelve `BotMeetingDeliveryWriter.js`).

- [ ] **Step 4: Implementar el escritor**

`algorithm-manager-bot/src/infrastructure/export/BotMeetingDeliveryWriter.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { MeetingPlatform, MeetingType } from "../../domain/models/MeetingTypes.js";
import type { MeetingSummary } from "../../domain/models/MeetingSummary.js";

/** Contrato del archivo de entrega. Debe coincidir con `BotMeetingDeliverySchema` de `packages/shared` (lo valida la prueba). */
export interface BotMeetingDelivery {
  schemaVersion: 1;
  sessionId: string;
  platform: MeetingPlatform;
  meetingUrl: string;
  startedAt: string;
  endedAt: string;
  meetingType: MeetingType;
  classificationReason: string;
  utterances: { speakerName: string; text: string; offsetSec: number }[];
  summary: MeetingSummary;
}

/** Escribe `reunion_<id>.json`: primero a `.tmp` y luego renombra, para que la app nunca lea un archivo a medias. */
export function writeBotMeetingDelivery(outputDir: string, delivery: BotMeetingDelivery): string {
  const safeId = delivery.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const finalPath = path.join(outputDir, `reunion_${safeId}.json`);
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(delivery, null, 2), "utf-8");
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}
```

- [ ] **Step 5: Integrarlo en `AutonomousMeetingBotService.ts`**

Ediciones dirigidas:
1. Imports nuevos: `import type { MeetingSummary } from "../domain/models/MeetingSummary.js";` y `import { writeBotMeetingDelivery } from "../infrastructure/export/BotMeetingDeliveryWriter.js";`
2. En `AutonomousMeetingRecord`, tras `summaryJsonPath?: string;` añadir `deliveryFilePath?: string;`.
3. En el bloque `// 5. Resumen estilo Fireflies`, junto a `let summaryJsonPath: string | undefined;` añadir `let summaryForDelivery: MeetingSummary | undefined;` y, justo después de `const summary = await this.summarizer.summarize({...});`, añadir `summaryForDelivery = summary;`.
4. Tras el bloque `try/catch` del resumen y antes de `return {`, insertar:

```ts
    // 6. Archivo de entrega para la biblioteca de la app (nunca bloquea los demás entregables)
    let deliveryFilePath: string | undefined;
    if (summaryForDelivery && this.activeUtterances.length > 0) {
      try {
        deliveryFilePath = writeBotMeetingDelivery(outputDir, {
          schemaVersion: 1,
          sessionId,
          platform,
          meetingUrl,
          startedAt: new Date(this.startTime).toISOString(),
          endedAt,
          meetingType: classification.type,
          classificationReason: classification.reason,
          utterances: this.activeUtterances.map((u) => ({
            speakerName: u.speakerName,
            text: u.content,
            offsetSec: u.offsetSec ?? 0
          })),
          summary: summaryForDelivery
        });
        console.info(`[AutonomousBot] Archivo de entrega para la biblioteca: ${deliveryFilePath}`);
      } catch (err) {
        console.warn("[AutonomousBot] No se pudo escribir el archivo de entrega; los demás entregables siguen disponibles:", err);
      }
    }
```

5. En el objeto del `return`, tras `summaryJsonPath,` añadir `deliveryFilePath,`.

- [ ] **Step 6: Ejecutar y verificar que pasa**

Run: `cd algorithm-manager-bot && npx vitest run && npx tsc --noEmit`
Expected: PASS (los 44 tests existentes + 4 nuevos), `tsc` limpio. Comprobar finales de línea de los archivos tocados (`tr -cd '\r' < FILE | wc -c` = 0).

- [ ] **Step 7: Checkpoint (sin commit)**

---

### Task 3: Migración 6

**Files:**
- Modify: `backend/src/desktop/infrastructure/sqlite/migrations.ts`
- Create: `backend/src/desktop/tests/libraryTestUtils.ts`
- Test: `backend/src/desktop/tests/LibraryMigration.test.ts`

**Interfaces:**
- Produces: `export const MIGRATIONS: string[]` (ahora exportado); `libraryTestUtils`: `insertSession(db, opts)`, `insertSpeaker(db, opts)`, `insertSegment(db, opts)`, `LOCAL_USER_ID` re-exportado.

- [ ] **Step 1: Escribir los helpers y el test que falla**

`backend/src/desktop/tests/libraryTestUtils.ts`:

```ts
import type { DatabaseSync } from "node:sqlite";
import { LOCAL_USER_ID } from "../infrastructure/sqlite/migrations.js";

export { LOCAL_USER_ID };

export interface InsertSessionOptions {
  id: string;
  userId?: string;
  name?: string;
  source?: "AUDIO" | "BOT";
  fileFormat?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  occurredAt?: string | null;
  externalId?: string | null;
  projectFolderId?: string | null;
}

export function insertSession(db: DatabaseSync, o: InsertSessionOptions): void {
  const createdAt = o.createdAt ?? "2026-11-20T10:00:00.000Z";
  db.prepare(
    `INSERT INTO transcription_sessions (
      id, user_id, guest_token_hash, project_folder_id, original_file_name, file_format,
      duration_seconds, file_size_bytes, storage_path, audio_expires_at, is_audio_purged,
      status, source_language, error_message, created_at, updated_at, source, external_id, occurred_at, source_meta
    ) VALUES (?, ?, NULL, ?, ?, ?, 60, 0, NULL, ?, 1, ?, 'es', NULL, ?, ?, ?, ?, ?, NULL)`
  ).run(
    o.id,
    o.userId ?? LOCAL_USER_ID,
    o.projectFolderId ?? null,
    o.name ?? `Sesión ${o.id}`,
    o.fileFormat ?? "mp3",
    createdAt,
    o.status ?? "COMPLETED",
    createdAt,
    o.updatedAt ?? createdAt,
    o.source ?? "AUDIO",
    o.externalId ?? null,
    o.occurredAt ?? null
  );
}

export function insertSpeaker(db: DatabaseSync, o: { id: string; sessionId: string; label: string; customName?: string | null }): void {
  db.prepare("INSERT INTO speakers (id, session_id, label, custom_name) VALUES (?, ?, ?, ?)").run(
    o.id,
    o.sessionId,
    o.label,
    o.customName ?? null
  );
}

export function insertSegment(
  db: DatabaseSync,
  o: { id: string; sessionId: string; speakerId: string; startMs: number; endMs: number; content: string }
): void {
  db.prepare(
    "INSERT INTO transcription_segments (id, session_id, speaker_id, start_time_ms, end_time_ms, content, confidence_score) VALUES (?, ?, ?, ?, ?, ?, NULL)"
  ).run(o.id, o.sessionId, o.speakerId, o.startMs, o.endMs, o.content);
}
```

`backend/src/desktop/tests/LibraryMigration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { MIGRATIONS, runMigrations } from "../infrastructure/sqlite/migrations.js";
import { insertSession, LOCAL_USER_ID } from "./libraryTestUtils.js";
import type { DatabaseSync } from "node:sqlite";

const columns = (db: DatabaseSync, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe("Migración 6 (biblioteca de reuniones)", () => {
  it("una base nueva trae columnas y tablas de la biblioteca", () => {
    const db = openSqliteDatabase({ dbPath: ":memory:" });
    expect(columns(db, "transcription_sessions")).toEqual(
      expect.arrayContaining(["source", "external_id", "occurred_at", "source_meta"])
    );
    expect(columns(db, "meeting_summaries")).toEqual(
      expect.arrayContaining(["session_id", "language", "executive_summary", "note", "generated_at", "topics", "decisions", "open_questions", "participants", "chapters"])
    );
    expect(columns(db, "action_items")).toEqual(
      expect.arrayContaining(["id", "session_id", "position", "task", "owner", "due_date", "evidence", "done", "done_at"])
    );
    expect(columns(db, "session_search")).toEqual(
      expect.arrayContaining(["session_id", "title_text", "body_text", "indexed_at"])
    );
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    db.close();
  });

  it("migrar una base con datos conserva las filas existentes como origen AUDIO", () => {
    const sqlite = process.getBuiltinModule("node:sqlite")!;
    const db = new sqlite.DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    for (let i = 0; i < 5; i++) db.exec(MIGRATIONS[i]!);
    db.exec("PRAGMA user_version = 5");

    // sesión "antigua": solo con las columnas de antes de la migración 6
    db.prepare(
      `INSERT INTO transcription_sessions (id, user_id, original_file_name, file_format, file_size_bytes, audio_expires_at, is_audio_purged, status, created_at, updated_at)
       VALUES ('legacy-1', ?, 'viejo.mp3', 'mp3', 100, '2026-12-01T00:00:00.000Z', 0, 'COMPLETED', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')`
    ).run(LOCAL_USER_ID);

    runMigrations(db);

    const row = db.prepare("SELECT source, external_id, occurred_at, original_file_name FROM transcription_sessions WHERE id = 'legacy-1'").get() as any;
    expect(row).toMatchObject({ source: "AUDIO", external_id: null, occurred_at: null, original_file_name: "viejo.mp3" });
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    db.close();
  });

  it("el índice único impide duplicar (source, external_id) pero admite varios audios sin external_id", () => {
    const db = openSqliteDatabase({ dbPath: ":memory:" });
    insertSession(db, { id: "b1", source: "BOT", externalId: "bot-session-1", fileFormat: "bot" });
    expect(() => insertSession(db, { id: "b2", source: "BOT", externalId: "bot-session-1", fileFormat: "bot" })).toThrow();
    insertSession(db, { id: "a1" });
    insertSession(db, { id: "a2" });
    insertSession(db, { id: "b3", source: "BOT", externalId: "bot-session-2", fileFormat: "bot" });
    expect((db.prepare("SELECT COUNT(*) AS c FROM transcription_sessions").get() as any).c).toBe(4);
    db.close();
  });

  it("borrar una sesión borra en cascada su resumen, puntos de acción e índice", () => {
    const db = openSqliteDatabase({ dbPath: ":memory:" });
    insertSession(db, { id: "s1" });
    db.prepare("INSERT INTO meeting_summaries (id, session_id, language, executive_summary, generated_at, topics, decisions, open_questions, participants, chapters) VALUES ('m1','s1','es','x','2026-11-25T00:00:00.000Z','[]','[]','[]','[]','[]')").run();
    db.prepare("INSERT INTO action_items (id, session_id, position, task, evidence) VALUES ('ai1','s1',0,'t','e')").run();
    db.prepare("INSERT INTO session_search (session_id, title_text, body_text, indexed_at) VALUES ('s1','t','b','2026-11-25T00:00:00.000Z')").run();

    db.prepare("DELETE FROM transcription_sessions WHERE id = 's1'").run();

    for (const table of ["meeting_summaries", "action_items", "session_search"]) {
      expect((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as any).c).toBe(0);
    }
    db.close();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx vitest run src/desktop/tests/LibraryMigration.test.ts`
Expected: FAIL (`MIGRATIONS` no está exportado / columnas inexistentes).

- [ ] **Step 3: Implementar**

En `migrations.ts`: cambiar `const MIGRATIONS` por `export const MIGRATIONS` y, tras el último elemento del array (el de la "Migración 5", que termina en `...OR lower(name) LIKE '%diamante%';\n  `\n];`), añadir una coma y el nuevo elemento:

```ts
  ,
  // Migración 6: biblioteca de reuniones (origen de sesión, resumen de reunión, puntos de acción e índice de búsqueda)
  `
  ALTER TABLE transcription_sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'AUDIO';
  ALTER TABLE transcription_sessions ADD COLUMN external_id TEXT;
  ALTER TABLE transcription_sessions ADD COLUMN occurred_at TEXT;
  ALTER TABLE transcription_sessions ADD COLUMN source_meta TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_source_external ON transcription_sessions (source, external_id) WHERE external_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS meeting_summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    executive_summary TEXT NOT NULL,
    note TEXT,
    generated_at TEXT NOT NULL,
    topics TEXT NOT NULL,
    decisions TEXT NOT NULL,
    open_questions TEXT NOT NULL,
    participants TEXT NOT NULL,
    chapters TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES transcription_sessions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    task TEXT NOT NULL,
    owner TEXT,
    due_date TEXT,
    evidence TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    done_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_action_items_session ON action_items (session_id);
  CREATE INDEX IF NOT EXISTS idx_action_items_done ON action_items (done);

  CREATE TABLE IF NOT EXISTS session_search (
    session_id TEXT PRIMARY KEY REFERENCES transcription_sessions(id) ON DELETE CASCADE,
    title_text TEXT NOT NULL,
    body_text TEXT NOT NULL,
    indexed_at TEXT NOT NULL
  );
  `
```

Antes de dar por buena la tarea, comprobar con `PRAGMA table_info(speakers)` y `PRAGMA table_info(transcription_segments)` que las columnas de `insertSpeaker`/`insertSegment` (los helpers) coinciden con la base real; si alguna falta o sobra, ajustar los helpers (no la migración).

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `cd backend && npx vitest run src/desktop/tests/LibraryMigration.test.ts src/desktop/tests/SqliteRepositories.test.ts && npx tsc --noEmit`
Expected: PASS (4 nuevos + los existentes), `tsc` limpio.

- [ ] **Step 5: Checkpoint (sin commit)**

---

### Task 4: Mapeo e importador

**Files:**
- Create: `backend/src/desktop/library/botMeetingMapping.ts`
- Create: `backend/src/desktop/library/ImportBotMeetings.ts`
- Test: `backend/src/desktop/tests/BotMeetingMapping.test.ts`, `backend/src/desktop/tests/ImportBotMeetings.test.ts`

**Interfaces:**
- Consumes: `BotMeetingDeliverySchema`, `BotMeetingDelivery`, `BOT_MEETING_SCHEMA_VERSION`, `ImportBotMeetingsResultDto` (Task 1); `LOCAL_USER_ID`; `makeDelivery`; `insertSession`.
- Produces: `buildSegmentTimings(utterances): { startMs: number; endMs: number }[]`, `formatMeetingTitle(platform, startedAt): string`, `computeDurationSeconds(delivery, lastEndMs): number`; `class ImportBotMeetings { constructor(db: DatabaseSync, resolveFolder: () => string, now?: () => Date, newId?: () => string); execute(userId?: string): ImportBotMeetingsResultDto }`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/BotMeetingMapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSegmentTimings, formatMeetingTitle, computeDurationSeconds } from "../library/botMeetingMapping.js";
import { makeDelivery } from "../../tests/helpers/botMeetingFixtures.js";

describe("botMeetingMapping", () => {
  it("cada segmento termina donde empieza el siguiente; el último se estima por palabras", () => {
    const t = buildSegmentTimings(makeDelivery().utterances);
    expect(t[0]).toEqual({ startMs: 0, endMs: 12000 });
    expect(t[1]).toEqual({ startMs: 12000, endMs: 30000 });
    // "Perfecto, ¿alguien sabe quién aprueba el presupuesto?" = 7 palabras → 2,8 s
    expect(t[2]).toEqual({ startMs: 30000, endMs: 32800 });
  });

  it("garantiza end > start con offsets iguales y un mínimo de 1000 ms", () => {
    const t = buildSegmentTimings([
      { speakerName: "A", text: "uno dos tres cuatro cinco", offsetSec: 5 },
      { speakerName: "B", text: "hola", offsetSec: 5 }
    ]);
    expect(t[0]).toEqual({ startMs: 5000, endMs: 7000 }); // 5 palabras / 2,5 = 2 s
    expect(t[1]).toEqual({ startMs: 5000, endMs: 6000 }); // 1 palabra → mínimo 1000 ms
    for (const seg of t) expect(seg.endMs).toBeGreaterThan(seg.startMs);
  });

  it("limita la estimación del último turno a 30 s", () => {
    const longText = Array.from({ length: 300 }, () => "palabra").join(" ");
    const t = buildSegmentTimings([{ speakerName: "A", text: longText, offsetSec: 0 }]);
    expect(t[0]).toEqual({ startMs: 0, endMs: 30000 });
  });

  it("el título lleva plataforma y fecha local; la duración usa inicio/fin o el último segmento", () => {
    const title = formatMeetingTitle("MICROSOFT_TEAMS", "2026-11-25T14:00:00.000Z");
    expect(title.startsWith("Reunión Microsoft Teams ")).toBe(true);
    expect(title).toMatch(/\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);

    expect(computeDurationSeconds(makeDelivery(), 32800)).toBe(1800);
    const invalid = makeDelivery({ endedAt: "2026-11-25T13:00:00.000Z" }); // termina antes de empezar
    expect(computeDurationSeconds(invalid, 32800)).toBe(33);
  });
});
```

`backend/src/desktop/tests/ImportBotMeetings.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { ImportBotMeetings } from "../library/ImportBotMeetings.js";
import { makeDelivery } from "../../tests/helpers/botMeetingFixtures.js";

describe("ImportBotMeetings", () => {
  let db: DatabaseSync;
  let dir: string;
  const NOW = new Date("2026-11-26T09:00:00.000Z");
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  const importer = () => new ImportBotMeetings(db, () => dir, () => NOW);
  const write = (name: string, content: unknown) =>
    fs.writeFileSync(path.join(dir, name), typeof content === "string" ? content : JSON.stringify(content), "utf-8");

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-bot-"));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("importa una reunión con todas las columnas obligatorias de una sesión sin audio", () => {
    write("reunion_bot-session-1001.json", makeDelivery());

    const result = importer().execute();

    expect(result).toMatchObject({ imported: 1, alreadyImported: 0, failed: [], folderMissing: false });
    const s = db.prepare("SELECT * FROM transcription_sessions WHERE source = 'BOT'").get() as any;
    expect(s).toMatchObject({
      external_id: "bot-session-1001",
      file_format: "bot",
      file_size_bytes: 0,
      storage_path: null,
      is_audio_purged: 1,
      status: "COMPLETED",
      source_language: "es",
      duration_seconds: 1800,
      occurred_at: "2026-11-25T14:00:00.000Z",
      created_at: NOW.toISOString(),
      audio_expires_at: NOW.toISOString()
    });
    expect(s.original_file_name.startsWith("Reunión Google Meet ")).toBe(true);
    expect(JSON.parse(s.source_meta)).toMatchObject({ platform: "GOOGLE_MEET", meetingType: "INTERNAL" });

    const speakers = db.prepare("SELECT label FROM speakers WHERE session_id = ? ORDER BY label").all(s.id) as any[];
    expect(speakers.map((x) => x.label)).toEqual(["Ana", "Luis"]);

    const segs = db.prepare("SELECT start_time_ms, end_time_ms, content FROM transcription_segments WHERE session_id = ? ORDER BY start_time_ms").all(s.id) as any[];
    expect(segs.map((x) => [x.start_time_ms, x.end_time_ms])).toEqual([[0, 12000], [12000, 30000], [30000, 32800]]);
    expect(segs[0].content).toContain("migrar la base de datos");

    const summary = db.prepare("SELECT * FROM meeting_summaries WHERE session_id = ?").get(s.id) as any;
    expect(summary.executive_summary).toContain("migrar");
    expect(JSON.parse(summary.chapters)).toEqual([{ title: "Migración", startSec: 0, endSec: 30 }]);

    const items = db.prepare("SELECT position, task, owner, due_date, done FROM action_items WHERE session_id = ? ORDER BY position").all(s.id) as any[];
    expect(items).toEqual([
      { position: 0, task: "Preparar el script de migración", owner: "Luis", due_date: "jueves", done: 0 },
      { position: 1, task: "Definir quién aprueba el presupuesto", owner: null, due_date: null, done: 0 }
    ]);
  });

  it("no duplica al reimportar y no pisa el estado done de los puntos de acción", () => {
    write("reunion_bot-session-1001.json", makeDelivery());
    importer().execute();
    db.prepare("UPDATE action_items SET done = 1, done_at = '2026-11-26T10:00:00.000Z' WHERE position = 0").run();

    const second = importer().execute();

    expect(second).toMatchObject({ imported: 0, alreadyImported: 1, failed: [] });
    expect(count("SELECT COUNT(*) AS c FROM transcription_sessions WHERE source = 'BOT'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM action_items WHERE done = 1")).toBe(1);
  });

  it("ignora los .tmp y los archivos que no son reunion_*.json", () => {
    write("reunion_a.json.tmp", makeDelivery());
    write("notas.json", makeDelivery());
    write("Transcripcion_x.docx", "binario");

    const result = importer().execute();

    expect(result).toMatchObject({ imported: 0, alreadyImported: 0, failed: [] });
  });

  it("un archivo malo no frena a los demás y se informa su motivo", () => {
    write("reunion_ok.json", makeDelivery({ sessionId: "ok-1" }));
    write("reunion_roto.json", "{ esto no es json");
    write("reunion_v2.json", { ...makeDelivery({ sessionId: "v2" }), schemaVersion: 2 });
    const { summary: _s, ...sinResumen } = makeDelivery({ sessionId: "sin-resumen" });
    write("reunion_sinresumen.json", sinResumen);

    const result = importer().execute();

    expect(result.imported).toBe(1);
    const byFile = Object.fromEntries(result.failed.map((f) => [f.file, f.reason]));
    expect(byFile["reunion_roto.json"]).toContain("JSON inválido");
    expect(byFile["reunion_v2.json"]).toContain("schemaVersion 2");
    expect(byFile["reunion_sinresumen.json"]).toContain("Archivo no válido");
    expect(count("SELECT COUNT(*) AS c FROM transcription_sessions WHERE source = 'BOT'")).toBe(1);
  });

  it("si falla al guardar, revierte todo: no queda nada a medias y se puede reintentar", () => {
    write("reunion_x.json", makeDelivery());
    db.exec("CREATE TRIGGER fail_summary BEFORE INSERT ON meeting_summaries BEGIN SELECT RAISE(ABORT, 'boom'); END");

    const result = importer().execute();

    expect(result.imported).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.reason).toContain("boom");
    for (const table of ["transcription_sessions", "speakers", "transcription_segments", "action_items"]) {
      expect(count(`SELECT COUNT(*) AS c FROM ${table}`)).toBe(0);
    }

    db.exec("DROP TRIGGER fail_summary");
    expect(importer().execute().imported).toBe(1);
  });

  it("nunca modifica ni borra los archivos de origen", () => {
    write("reunion_x.json", makeDelivery());
    const file = path.join(dir, "reunion_x.json");
    const before = fs.readFileSync(file, "utf-8");
    const mtime = fs.statSync(file).mtimeMs;

    importer().execute();

    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
  });

  it("si la carpeta no existe devuelve folderMissing sin lanzar error", () => {
    const missing = path.join(dir, "no-existe");
    const result = new ImportBotMeetings(db, () => missing, () => NOW).execute();
    expect(result).toEqual({ imported: 0, alreadyImported: 0, failed: [], folderMissing: true, folder: missing });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/desktop/tests/BotMeetingMapping.test.ts src/desktop/tests/ImportBotMeetings.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar el mapeo**

`backend/src/desktop/library/botMeetingMapping.ts`:

```ts
import type { BotMeetingDelivery } from "@audio-to-text/shared";

const PLATFORM_LABELS: Record<BotMeetingDelivery["platform"], string> = {
  GOOGLE_MEET: "Google Meet",
  MICROSOFT_TEAMS: "Microsoft Teams",
  ZOOM: "Zoom",
  LOCAL_DESKTOP: "Escritorio"
};

const WORDS_PER_SECOND = 2.5;
const MAX_TURN_SECONDS = 30;
const MIN_SEGMENT_MS = 1000;

export interface SegmentTiming {
  startMs: number;
  endMs: number;
}

/** La base exige end > start: cada segmento termina donde empieza el siguiente; si no es posible, se estima por palabras. */
export function buildSegmentTimings(utterances: BotMeetingDelivery["utterances"]): SegmentTiming[] {
  return utterances.map((u, i) => {
    const startMs = Math.round(u.offsetSec * 1000);
    const next = utterances[i + 1];
    const nextStartMs = next ? Math.round(next.offsetSec * 1000) : undefined;
    if (nextStartMs !== undefined && nextStartMs > startMs) return { startMs, endMs: nextStartMs };

    const words = u.text.trim().split(/\s+/).filter(Boolean).length;
    const estimatedMs = Math.round(Math.min(words / WORDS_PER_SECOND, MAX_TURN_SECONDS) * 1000);
    return { startMs, endMs: startMs + Math.max(MIN_SEGMENT_MS, estimatedMs) };
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatMeetingTitle(platform: BotMeetingDelivery["platform"], startedAt: string): string {
  const d = new Date(startedAt);
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Reunión ${PLATFORM_LABELS[platform]} ${date}`;
}

export function computeDurationSeconds(delivery: BotMeetingDelivery, lastEndMs: number): number {
  const seconds = (Date.parse(delivery.endedAt) - Date.parse(delivery.startedAt)) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : Math.round(lastEndMs / 1000);
}
```

- [ ] **Step 4: Implementar el importador**

`backend/src/desktop/library/ImportBotMeetings.ts`:

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  BOT_MEETING_SCHEMA_VERSION,
  BotMeetingDeliverySchema,
  type BotMeetingDelivery,
  type ImportBotMeetingsResultDto
} from "@audio-to-text/shared";
import { LOCAL_USER_ID } from "../infrastructure/sqlite/migrations.js";
import { buildSegmentTimings, computeDurationSeconds, formatMeetingTitle } from "./botMeetingMapping.js";

const FILE_PATTERN = /^reunion_.+\.json$/;

export class ImportBotMeetings {
  constructor(
    private db: DatabaseSync,
    private resolveFolder: () => string,
    private now: () => Date = () => new Date(),
    private newId: () => string = () => crypto.randomUUID()
  ) {}

  public execute(userId: string = LOCAL_USER_ID): ImportBotMeetingsResultDto {
    const folder = this.resolveFolder();
    const result: ImportBotMeetingsResultDto = { imported: 0, alreadyImported: 0, failed: [], folderMissing: false, folder };

    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      result.folderMissing = true;
      return result;
    }

    const files = fs.readdirSync(folder).filter((f) => FILE_PATTERN.test(f)).sort();
    for (const file of files) {
      try {
        const outcome = this.importFile(path.join(folder, file), userId);
        if (outcome === "imported") result.imported++;
        else result.alreadyImported++;
      } catch (err) {
        result.failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }

  private importFile(filePath: string, userId: string): "imported" | "exists" {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      throw new Error("JSON inválido o archivo ilegible");
    }

    const version = (parsed as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (version !== BOT_MEETING_SCHEMA_VERSION) {
      throw new Error(`Versión de esquema no soportada (schemaVersion ${String(version)})`);
    }

    const check = BotMeetingDeliverySchema.safeParse(parsed);
    if (!check.success) {
      const detail = check.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`)
        .join("; ");
      throw new Error(`Archivo no válido: ${detail}`);
    }

    const delivery = check.data;
    const exists = this.db
      .prepare("SELECT 1 AS x FROM transcription_sessions WHERE source = 'BOT' AND external_id = ?")
      .get(delivery.sessionId);
    if (exists) return "exists";

    this.insert(delivery, userId);
    return "imported";
  }

  /** Crea sesión, hablantes, segmentos, resumen y puntos de acción en una sola transacción. */
  private insert(d: BotMeetingDelivery, userId: string): void {
    const nowIso = this.now().toISOString();
    const sessionId = this.newId();
    const timings = buildSegmentTimings(d.utterances);
    const lastEndMs = timings[timings.length - 1]!.endMs;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO transcription_sessions (
            id, user_id, guest_token_hash, project_folder_id, original_file_name, file_format,
            duration_seconds, file_size_bytes, storage_path, audio_expires_at, is_audio_purged,
            status, source_language, error_message, created_at, updated_at,
            source, external_id, occurred_at, source_meta
          ) VALUES (?, ?, NULL, NULL, ?, 'bot', ?, 0, NULL, ?, 1, 'COMPLETED', ?, NULL, ?, ?, 'BOT', ?, ?, ?)`
        )
        .run(
          sessionId,
          userId,
          formatMeetingTitle(d.platform, d.startedAt),
          computeDurationSeconds(d, lastEndMs),
          nowIso,
          d.summary.language,
          nowIso,
          nowIso,
          d.sessionId,
          d.startedAt,
          JSON.stringify({
            platform: d.platform,
            meetingUrl: d.meetingUrl,
            meetingType: d.meetingType,
            classificationReason: d.classificationReason
          })
        );

      const speakerIds = new Map<string, string>();
      for (const u of d.utterances) {
        if (speakerIds.has(u.speakerName)) continue;
        const id = this.newId();
        speakerIds.set(u.speakerName, id);
        this.db
          .prepare("INSERT INTO speakers (id, session_id, label, custom_name) VALUES (?, ?, ?, NULL)")
          .run(id, sessionId, u.speakerName);
      }

      const insertSegment = this.db.prepare(
        `INSERT INTO transcription_segments (id, session_id, speaker_id, start_time_ms, end_time_ms, content, confidence_score)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      );
      d.utterances.forEach((u, i) => {
        const t = timings[i]!;
        insertSegment.run(this.newId(), sessionId, speakerIds.get(u.speakerName)!, t.startMs, t.endMs, u.text);
      });

      const s = d.summary;
      this.db
        .prepare(
          `INSERT INTO meeting_summaries (id, session_id, language, executive_summary, note, generated_at, topics, decisions, open_questions, participants, chapters)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          this.newId(),
          sessionId,
          s.language,
          s.executiveSummary,
          s.note ?? null,
          s.generatedAt,
          JSON.stringify(s.topics),
          JSON.stringify(s.decisions),
          JSON.stringify(s.openQuestions),
          JSON.stringify(s.participants),
          JSON.stringify(s.chapters)
        );

      const insertItem = this.db.prepare(
        `INSERT INTO action_items (id, session_id, position, task, owner, due_date, evidence, done, done_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`
      );
      s.actionItems.forEach((item, position) => {
        insertItem.run(this.newId(), sessionId, position, item.task, item.owner ?? null, item.dueDate ?? null, item.evidence);
      });

      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw new Error(`Error al guardar: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `cd backend && npx vitest run src/desktop/tests/BotMeetingMapping.test.ts src/desktop/tests/ImportBotMeetings.test.ts && npx tsc --noEmit`
Expected: PASS (4 + 7 tests), `tsc` limpio. Si el test de `status: "COMPLETED"` falla porque el enum real usa otro valor, ajustar el literal SQL del importador al valor de `SessionStatus.COMPLETED`.

- [ ] **Step 6: Checkpoint (sin commit)**

---

### Task 5: Repositorio de biblioteca (listado), carpeta de entrega y ajuste del bot

**Files:**
- Create: `backend/src/desktop/infrastructure/sqlite/SqliteLibraryRepository.ts`
- Create: `backend/src/infrastructure/bot/botOutputDir.ts`
- Modify ⚠: `packages/shared/src/dto/botSettings.dto.ts` (añadir `botOutputDir?: string;` a `MeetingBotConfigDto`)
- Modify ⚠: `backend/src/interfaces/http/routes/bot.routes.ts` (añadir `botOutputDir: z.string().max(500).optional(),` a `UpdateBotConfigSchema`)
- Test: `backend/src/desktop/tests/LibraryRepository.test.ts`, `backend/src/tests/unit/botOutputDir.test.ts`

**Interfaces:**
- Consumes: `LibrarySessionItemDto`, `SessionSource` (Task 1); helpers de tests (Task 3).
- Produces:
  - `interface LibraryListQuery { userId: string; page: number; limit: number; source?: SessionSource }` (se amplía en F3 y F4)
  - `class SqliteLibraryRepository { constructor(db: DatabaseSync); listSessions(query: LibraryListQuery): { items: LibrarySessionItemDto[]; total: number } }`
  - `resolveBotOutputDir(config?: { botOutputDir?: string }, cwd?: string): string`

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/tests/unit/botOutputDir.test.ts`:

```ts
import path from "node:path";
import { describe, it, expect } from "vitest";
import { resolveBotOutputDir } from "../../infrastructure/bot/botOutputDir.js";

describe("resolveBotOutputDir", () => {
  it("usa la carpeta configurada si existe (resuelta a ruta absoluta)", () => {
    expect(resolveBotOutputDir({ botOutputDir: "  C:/reuniones/salida  " }, "C:/repo")).toBe(path.resolve("C:/reuniones/salida"));
  });

  it("sin configuración usa <raíz>/output, igual que el bot", () => {
    expect(resolveBotOutputDir({}, "C:/repo")).toBe(path.resolve("C:/repo", "output"));
    expect(resolveBotOutputDir({ botOutputDir: "   " }, "C:/repo")).toBe(path.resolve("C:/repo", "output"));
  });

  it("si el proceso corre desde backend/ o algorithm-manager-bot/ sube a la raíz", () => {
    expect(resolveBotOutputDir({}, path.join("C:/repo", "backend"))).toBe(path.resolve("C:/repo", "output"));
    expect(resolveBotOutputDir({}, path.join("C:/repo", "algorithm-manager-bot"))).toBe(path.resolve("C:/repo", "output"));
  });
});
```

`backend/src/desktop/tests/LibraryRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { insertSession, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository.listSessions", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    insertSession(db, { id: "audio-viejo", createdAt: "2026-11-01T10:00:00.000Z" });
    insertSession(db, { id: "audio-nuevo", createdAt: "2026-11-20T10:00:00.000Z" });
    // reunión de bot creada (importada) tarde pero ocurrida antes que audio-nuevo
    insertSession(db, { id: "bot-1", source: "BOT", fileFormat: "bot", externalId: "b1", createdAt: "2026-11-26T09:00:00.000Z", occurredAt: "2026-11-10T15:00:00.000Z" });
  });
  afterEach(() => db.close());

  it("ordena por la fecha real de la reunión (occurred_at, o created_at en audios)", () => {
    const { items, total } = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20 });
    expect(total).toBe(3);
    expect(items.map((i) => i.id)).toEqual(["audio-nuevo", "bot-1", "audio-viejo"]);
  });

  it("cada ítem trae origen, fecha de la reunión y formato", () => {
    const { items } = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20 });
    const bot = items.find((i) => i.id === "bot-1")!;
    expect(bot).toMatchObject({
      source: "BOT",
      fileFormat: "bot",
      occurredAt: "2026-11-10T15:00:00.000Z",
      createdAt: "2026-11-26T09:00:00.000Z",
      isAudioPurged: true,
      status: "COMPLETED",
      fileSizeBytes: "0"
    });
    const audio = items.find((i) => i.id === "audio-nuevo")!;
    expect(audio).toMatchObject({ source: "AUDIO", occurredAt: "2026-11-20T10:00:00.000Z" });
  });

  it("filtra por origen", () => {
    expect(repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, source: "BOT" }).items.map((i) => i.id)).toEqual(["bot-1"]);
    expect(repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, source: "AUDIO" }).total).toBe(2);
  });

  it("pagina y devuelve el total sin paginar", () => {
    const p1 = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 2 });
    const p2 = repo.listSessions({ userId: LOCAL_USER_ID, page: 2, limit: 2 });
    expect(p1.items.map((i) => i.id)).toEqual(["audio-nuevo", "bot-1"]);
    expect(p2.items.map((i) => i.id)).toEqual(["audio-viejo"]);
    expect(p1.total).toBe(3);
    expect(p2.total).toBe(3);
  });

  it("solo devuelve sesiones del usuario consultado", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'otro@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    expect(repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20 }).items.map((i) => i.id)).not.toContain("ajena");
    expect(repo.listSessions({ userId: "otro", page: 1, limit: 20 }).items.map((i) => i.id)).toEqual(["ajena"]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/tests/unit/botOutputDir.test.ts src/desktop/tests/LibraryRepository.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`backend/src/infrastructure/bot/botOutputDir.ts`:

```ts
import path from "node:path";
import { MeetingBotConfigManager } from "./MeetingBotConfigManager.js";

/**
 * Carpeta donde el bot deja sus entregables (y los `reunion_*.json` que la app importa).
 * Si no se configuró, es `<raíz>/output`, la misma que usa el bot al ejecutarse con `npm run bot` desde la raíz.
 */
export function resolveBotOutputDir(
  config: { botOutputDir?: string } = MeetingBotConfigManager.getInstance().getConfig(),
  cwd: string = process.cwd()
): string {
  const configured = config.botOutputDir?.trim();
  if (configured) return path.resolve(configured);

  const rootDir = cwd.endsWith("backend") || cwd.endsWith("algorithm-manager-bot") ? path.dirname(cwd) : cwd;
  return path.resolve(rootDir, "output");
}
```

`backend/src/desktop/infrastructure/sqlite/SqliteLibraryRepository.ts`:

```ts
import type { DatabaseSync } from "node:sqlite";
import type { LibrarySessionItemDto, SessionSource } from "@audio-to-text/shared";

export interface LibraryListQuery {
  userId: string;
  page: number;
  limit: number;
  source?: SessionSource;
}

const OCCURRED_AT = "COALESCE(s.occurred_at, s.created_at)";

export class SqliteLibraryRepository {
  constructor(private db: DatabaseSync) {}

  public listSessions(query: LibraryListQuery): { items: LibrarySessionItemDto[]; total: number } {
    const where: string[] = ["s.user_id = ?"];
    const params: (string | number)[] = [query.userId];

    if (query.source) {
      where.push("s.source = ?");
      params.push(query.source);
    }

    const whereSql = where.join(" AND ");
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM transcription_sessions s WHERE ${whereSql}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT s.id, s.original_file_name, s.file_format, s.project_folder_id, s.status, s.duration_seconds,
                s.file_size_bytes, s.audio_expires_at, s.is_audio_purged, s.created_at, s.source,
                ${OCCURRED_AT} AS occurred_at
         FROM transcription_sessions s
         WHERE ${whereSql}
         ORDER BY ${OCCURRED_AT} DESC, s.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, query.limit, (query.page - 1) * query.limit) as any[];

    return { items: rows.map((r) => this.toItem(r)), total: Number(totalRow.count) };
  }

  private toItem(r: any): LibrarySessionItemDto {
    return {
      id: r.id,
      originalFileName: r.original_file_name,
      fileFormat: r.file_format,
      projectFolderId: r.project_folder_id ?? null,
      status: r.status,
      durationSeconds: r.duration_seconds !== null && r.duration_seconds !== undefined ? Number(r.duration_seconds) : null,
      fileSizeBytes: String(r.file_size_bytes ?? 0),
      audioExpiresAt: r.audio_expires_at,
      isAudioPurged: Boolean(r.is_audio_purged),
      createdAt: r.created_at,
      source: r.source === "BOT" ? "BOT" : "AUDIO",
      occurredAt: r.occurred_at
    };
  }
}
```

En `botSettings.dto.ts` ⚠, dentro de `MeetingBotConfigDto`, tras `botLanguage: string;` añadir:

```ts
  /** Carpeta donde el bot deja las reuniones; vacío = la carpeta `output` del bot. */
  botOutputDir?: string;
```

En `bot.routes.ts` ⚠, dentro de `UpdateBotConfigSchema`, tras `botLanguage: z.string().optional()` añadir una coma y `botOutputDir: z.string().max(500).optional()`.

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd packages/shared && npm run build && cd ../../backend && npx vitest run src/tests/unit/botOutputDir.test.ts src/desktop/tests/LibraryRepository.test.ts && npx tsc --noEmit`
Expected: PASS (3 + 5 tests), `tsc` limpio.

- [ ] **Step 5: Checkpoint (sin commit)**

---

### Task 6: Rutas, cableado e importación al arrancar

**Files:**
- Create: `backend/src/desktop/http/routes/library.routes.ts`
- Modify: `backend/src/desktop/composition-root.desktop.ts`, `backend/src/desktop/server.ts`
- Modify ⚠: `backend/src/desktop/http/desktop.routes.ts`
- Test: `backend/src/desktop/tests/LibraryRoutes.test.ts`, `backend/src/desktop/tests/LibraryServer.test.ts`

**Interfaces:**
- Consumes: `ImportBotMeetings`, `SqliteLibraryRepository`, `resolveBotOutputDir`, `LibrarySessionsQuerySchema`, `validateQuery` (`backend/src/interfaces/http/middlewares/validate.ts`).
- Produces: `createLibraryRoutes(deps: LibraryRoutesDeps): Router`; el contenedor expone `libraryRepository` e `importBotMeetings`; `DesktopRoutesDeps` gana ambos campos.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/LibraryRoutes.test.ts`:

```ts
import http from "node:http";
import express from "express";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { createLibraryRoutes } from "../http/routes/library.routes.js";
import { errorHandler } from "../../interfaces/http/middlewares/errorHandler.js";
import { insertSession, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("library.routes", () => {
  let db: DatabaseSync;
  let server: http.Server;
  let base: string;
  let importCalls: string[];

  beforeEach(async () => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    importCalls = [];
    const importBotMeetings = {
      execute: (userId: string) => {
        importCalls.push(userId);
        return { imported: 2, alreadyImported: 1, failed: [], folderMissing: false, folder: "C:/salida" };
      }
    } as any;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { userId: LOCAL_USER_ID, email: "local@test" };
      next();
    });
    app.use(createLibraryRoutes({ importBotMeetings, libraryRepository: new SqliteLibraryRepository(db) }));
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });

  it("POST /library/import ejecuta el importador para el usuario autenticado", async () => {
    const res = await fetch(`${base}/library/import`, { method: "POST" });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, data: { imported: 2, alreadyImported: 1, failed: [], folderMissing: false, folder: "C:/salida" } });
    expect(importCalls).toEqual([LOCAL_USER_ID]);
  });

  it("GET /library/sessions devuelve ítems y meta, aplica el filtro source y valida la consulta", async () => {
    insertSession(db, { id: "a1", createdAt: "2026-11-20T10:00:00.000Z" });
    insertSession(db, { id: "b1", source: "BOT", fileFormat: "bot", externalId: "x", occurredAt: "2026-11-21T10:00:00.000Z" });

    const all = (await (await fetch(`${base}/library/sessions`)).json()) as any;
    expect(all.success).toBe(true);
    expect(all.data.map((i: any) => i.id)).toEqual(["b1", "a1"]);
    expect(all.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });

    const bots = (await (await fetch(`${base}/library/sessions?source=BOT`)).json()) as any;
    expect(bots.data.map((i: any) => i.id)).toEqual(["b1"]);

    const bad = await fetch(`${base}/library/sessions?limit=0`);
    expect(bad.status).toBe(400);
    const bad2 = await fetch(`${base}/library/sessions?source=OTRO`);
    expect(bad2.status).toBe(400);
  });
});
```

`backend/src/desktop/tests/LibraryServer.test.ts`:

```ts
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { startDesktopServer, DesktopServerInstance } from "../server.js";
import { InMemorySecretVault } from "../infrastructure/settings/ISecretVault.js";

describe("Biblioteca en el servidor de escritorio", () => {
  let tempDir: string;
  let server: DesktopServerInstance;
  const launchToken = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "library-server-test-"));
    server = await startDesktopServer({
      userDataDir: tempDir,
      resourcesDir: tempDir,
      vault: new InMemorySecretVault(),
      launchToken,
      port: 0
    });
  });

  afterEach(async () => {
    await server.close();
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("las rutas de la biblioteca exigen la cookie local y responden con ella", async () => {
    const url = `http://127.0.0.1:${server.port}/api/desktop/library/sessions`;

    expect((await fetch(url)).status).toBe(401);

    const ok = await fetch(url, { headers: { Cookie: `accessToken=${launchToken}` } });
    expect(ok.status).toBe(200);
    const json = (await ok.json()) as any;
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);

    const imp = await fetch(`http://127.0.0.1:${server.port}/api/desktop/library/import`, {
      method: "POST",
      headers: { Cookie: `accessToken=${launchToken}` }
    });
    expect(imp.status).toBe(200);
    const impJson = (await imp.json()) as any;
    expect(impJson.data).toHaveProperty("imported");
    expect(impJson.data).toHaveProperty("folderMissing");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/desktop/tests/LibraryRoutes.test.ts src/desktop/tests/LibraryServer.test.ts`
Expected: FAIL (módulo `library.routes.js` inexistente; ruta no montada).

- [ ] **Step 3: Implementar las rutas**

`backend/src/desktop/http/routes/library.routes.ts`:

```ts
import { Router, Request, Response, NextFunction } from "express";
import { LibrarySessionsQuerySchema, type LibrarySessionsQuery } from "@audio-to-text/shared";
import { validateQuery } from "../../../interfaces/http/middlewares/validate.js";
import type { ImportBotMeetings } from "../../library/ImportBotMeetings.js";
import type { SqliteLibraryRepository } from "../../infrastructure/sqlite/SqliteLibraryRepository.js";

export interface LibraryRoutesDeps {
  importBotMeetings: Pick<ImportBotMeetings, "execute">;
  libraryRepository: SqliteLibraryRepository;
}

export function createLibraryRoutes(deps: LibraryRoutesDeps): Router {
  const router = Router();

  router.post("/library/import", (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = deps.importBotMeetings.execute(req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/library/sessions",
    validateQuery(LibrarySessionsQuerySchema),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = req.query as unknown as LibrarySessionsQuery;
        const { items, total } = deps.libraryRepository.listSessions({ userId: req.user!.userId, ...query });
        res.json({
          success: true,
          data: items,
          meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
```

- [ ] **Step 4: Cablear**

1. `desktop.routes.ts` ⚠: añadir imports `import { createLibraryRoutes } from "./routes/library.routes.js";`, `import type { ImportBotMeetings } from "../library/ImportBotMeetings.js";`, `import type { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";`; añadir a `DesktopRoutesDeps` los campos `importBotMeetings: ImportBotMeetings;` y `libraryRepository: SqliteLibraryRepository;`; y en `createDesktopRoutes`, tras `router.use("/bot", createBotRoutes());`, añadir `router.use(createLibraryRoutes(deps));`.
2. `composition-root.desktop.ts`: imports `SqliteLibraryRepository`, `ImportBotMeetings` (`../library/ImportBotMeetings.js`) y `resolveBotOutputDir` (`../../infrastructure/bot/botOutputDir.js`, ajustar el nivel de `../` según la ubicación real del archivo: está en `backend/src/desktop/`, así que la ruta es `../infrastructure/bot/botOutputDir.js`). Antes del `return` del contenedor (tras crear `projectFolderController`), añadir:

```ts
  const libraryRepository = new SqliteLibraryRepository(db);
  const importBotMeetings = new ImportBotMeetings(db, () => resolveBotOutputDir());
```

y añadir `libraryRepository,` e `importBotMeetings,` al objeto devuelto.
3. `server.ts`: en `createDesktopRoutes({...})` añadir `importBotMeetings: container.importBotMeetings, libraryRepository: container.libraryRepository,`. Antes de `return { port: boundPort, ...}` añadir la importación al arrancar sin bloquear:

```ts
  // Importa las reuniones que el bot dejó mientras la app estaba cerrada (no bloquea el arranque)
  setImmediate(() => {
    try {
      const r = container.importBotMeetings.execute();
      if (r.imported > 0 || r.failed.length > 0) {
        console.log(
          `[Library] Importación al arrancar: ${r.imported} nuevas, ${r.alreadyImported} ya importadas, ${r.failed.length} con error.`
        );
      }
    } catch (err) {
      console.error("[Library] Error importando reuniones del bot al arrancar:", err);
    }
  });
```

- [ ] **Step 5: Ejecutar y verificar que pasan**

Run: `cd backend && npx vitest run src/desktop/tests/LibraryRoutes.test.ts src/desktop/tests/LibraryServer.test.ts src/desktop/tests/DesktopServer.test.ts && npx tsc --noEmit`
Expected: PASS, `tsc` limpio.

- [ ] **Step 6: Checkpoint (sin commit)**

---

### Task 7: Frontend de la fase 1

**Files:**
- Create: `frontend/src/features/history/importResult.ts`, `frontend/src/features/history/ImportBotMeetingsButton.tsx`
- Modify: `frontend/src/features/history/HistoryList.tsx`, `frontend/src/pages/HistoryPage.tsx`, `frontend/src/pages/SessionPage.tsx` (CRLF), `frontend/src/features/player/SegmentList.tsx` (se prepara en F2; aquí no)
- Modify ⚠: `frontend/src/pages/settings/components/MeetingBotSettingsSection.tsx`
- Test: `frontend/src/tests/importResult.test.ts`

**Interfaces:**
- Consumes: `ImportBotMeetingsResultDto`, `TranscriptionSessionDto` (con `source?`/`occurredAt?`), `isDesktopApp()`.
- Produces: `describeImportResult(result): { severity: "success" | "info" | "warning"; message: string }`; `HistoryList` acepta `refreshKey?: number`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/tests/importResult.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeImportResult } from "../features/history/importResult.js";
import type { ImportBotMeetingsResultDto } from "@audio-to-text/shared";

const base: ImportBotMeetingsResultDto = { imported: 0, alreadyImported: 0, failed: [], folderMissing: false, folder: "C:/salida" };

describe("describeImportResult", () => {
  it("informa cuántas reuniones nuevas se importaron", () => {
    expect(describeImportResult({ ...base, imported: 2, alreadyImported: 1 })).toEqual({
      severity: "success",
      message: "Se importaron 2 reuniones nuevas (1 ya estaba importada)."
    });
    expect(describeImportResult({ ...base, imported: 1 }).message).toBe("Se importó 1 reunión nueva.");
  });

  it("sin novedades lo dice claramente", () => {
    expect(describeImportResult({ ...base, alreadyImported: 3 })).toEqual({
      severity: "info",
      message: "No hay reuniones nuevas. 3 ya estaban importadas."
    });
    expect(describeImportResult(base)).toEqual({ severity: "info", message: "No hay reuniones nuevas para importar." });
  });

  it("avisa de archivos con error y nombra el primero", () => {
    const r = describeImportResult({
      ...base,
      imported: 1,
      failed: [
        { file: "reunion_a.json", reason: "JSON inválido o archivo ilegible" },
        { file: "reunion_b.json", reason: "Archivo no válido" }
      ]
    });
    expect(r.severity).toBe("warning");
    expect(r.message).toContain("Se importó 1 reunión nueva.");
    expect(r.message).toContain("2 archivos no se pudieron importar");
    expect(r.message).toContain("reunion_a.json: JSON inválido o archivo ilegible");
  });

  it("si la carpeta de entrega no existe lo explica con su ruta", () => {
    const r = describeImportResult({ ...base, folderMissing: true });
    expect(r.severity).toBe("warning");
    expect(r.message).toContain("C:/salida");
    expect(r.message).toContain("no existe");
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd frontend && npx vitest run src/tests/importResult.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar el helper y el botón**

`frontend/src/features/history/importResult.ts`:

```ts
import type { ImportBotMeetingsResultDto } from "@audio-to-text/shared";

export interface ImportMessage {
  severity: "success" | "info" | "warning";
  message: string;
}

export function describeImportResult(r: ImportBotMeetingsResultDto): ImportMessage {
  if (r.folderMissing) {
    return {
      severity: "warning",
      message: `La carpeta de entrega del bot no existe todavía: ${r.folder}. Ejecuta el bot o configura la carpeta en Configuración.`
    };
  }

  const parts: string[] = [];
  if (r.imported > 0) {
    parts.push(r.imported === 1 ? "Se importó 1 reunión nueva." : `Se importaron ${r.imported} reuniones nuevas.`);
    if (r.alreadyImported > 0) {
      parts[0] = parts[0]!.replace(/\.$/, "") + (r.alreadyImported === 1 ? " (1 ya estaba importada)." : ` (${r.alreadyImported} ya estaban importadas).`);
    }
  } else if (r.alreadyImported > 0) {
    parts.push(`No hay reuniones nuevas. ${r.alreadyImported} ya ${r.alreadyImported === 1 ? "estaba importada" : "estaban importadas"}.`);
  } else {
    parts.push("No hay reuniones nuevas para importar.");
  }

  if (r.failed.length > 0) {
    const first = r.failed[0]!;
    parts.push(
      `${r.failed.length} ${r.failed.length === 1 ? "archivo no se pudo importar" : "archivos no se pudieron importar"} (${first.file}: ${first.reason}).`
    );
    return { severity: "warning", message: parts.join(" ") };
  }

  return { severity: r.imported > 0 ? "success" : "info", message: parts.join(" ") };
}
```

`frontend/src/features/history/ImportBotMeetingsButton.tsx`:

```tsx
import React, { useState } from "react";
import { Alert, Button, CircularProgress, Snackbar } from "@mui/material";
import { SmartToy as BotIcon } from "@mui/icons-material";
import type { ImportBotMeetingsResultDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { describeImportResult, type ImportMessage } from "./importResult.js";

interface ImportBotMeetingsButtonProps {
  onImported: () => void;
}

export const ImportBotMeetingsButton: React.FC<ImportBotMeetingsButtonProps> = ({ onImported }) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<ImportMessage | null>(null);

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; data?: ImportBotMeetingsResultDto }>("/desktop/library/import");
      if (res.success && res.data) {
        setMessage(describeImportResult(res.data));
        if (res.data.imported > 0) onImported();
      }
    } catch (err: any) {
      setMessage({ severity: "warning", message: err.message || "No se pudieron importar las reuniones del bot." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={loading ? <CircularProgress size={16} /> : <BotIcon />}
        onClick={handleImport}
        disabled={loading}
      >
        Importar reuniones del bot
      </Button>
      <Snackbar open={Boolean(message)} autoHideDuration={8000} onClose={() => setMessage(null)}>
        {message ? (
          <Alert severity={message.severity} onClose={() => setMessage(null)} sx={{ width: "100%" }}>
            {message.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
};
```

- [ ] **Step 4: Modificar Historial, página de sesión y ajustes**

1. `HistoryPage.tsx`: importar `useState`, `ImportBotMeetingsButton` y `isDesktopApp`; añadir `const [refreshKey, setRefreshKey] = useState(0);`; en el encabezado, junto al título, mostrar `{isDesktopApp() && <ImportBotMeetingsButton onImported={() => setRefreshKey((k) => k + 1)} />}` (un `Box` con `display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2`); pasar `refreshKey={refreshKey}` a `<HistoryList .../>`.
2. `HistoryList.tsx`:
   - `HistoryListProps` gana `refreshKey?: number;` y el componente lo desestructura.
   - Importar `isDesktopApp` de `../../lib/runtime.js`.
   - En `fetchHistory`, usar `const endpoint = isDesktopApp() ? "/desktop/library/sessions" : "/sessions";` y `api.get<any>(endpoint, { params: { page: targetPage, limit } })`.
   - El `useEffect` pasa a `[page, refreshKey]`.
   - En el título de cada fila, tras el `Chip` de `status`, añadir `{sess.source === "BOT" && <Chip size="small" label="Bot" color="secondary" variant="outlined" sx={{ fontSize: "0.75rem", height: 22 }} />}` y `{sess.source === "AUDIO" && <Chip size="small" label="Audio" variant="outlined" sx={{ fontSize: "0.75rem", height: 22 }} />}`.
   - En el texto secundario, usar la fecha real: `new Date(sess.occurredAt ?? sess.createdAt).toLocaleDateString()`.
   - Estado vacío: si `isDesktopApp()`, el texto pasa a "No tienes transcripciones ni reuniones del bot. Sube un archivo, o ejecuta el bot (`npm run bot`) y pulsa «Importar reuniones del bot»."
3. `SessionPage.tsx` (CRLF): dentro de la pestaña de transcripción, reemplazar `<AudioPlayer />` por `{currentSession.fileFormat !== "bot" && <AudioPlayer />}` (las reuniones del bot no tienen audio).
4. `MeetingBotSettingsSection.tsx` ⚠: añadir `botOutputDir: ""` al estado inicial de `config` (tras `botLanguage: "es"`); y, justo después del `TextField` de la URL del avatar (el que termina con `placeholder="https://ejemplo.com/mi-avatar.png"\n            />`), añadir:

```tsx
            <TextField
              fullWidth
              size="small"
              sx={{ mt: 3 }}
              label="Carpeta donde el bot deja las reuniones"
              value={config.botOutputDir ?? ""}
              onChange={(e) => setConfig({ ...config, botOutputDir: e.target.value })}
              placeholder="Vacío = la carpeta output del bot"
              helperText="La app importa de esta carpeta las reuniones nuevas (archivos reunion_*.json)."
            />
```

- [ ] **Step 5: Ejecutar y verificar**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS (69 existentes + 4 nuevos), `tsc` limpio. Comprobar finales de línea de `SessionPage.tsx` (debe seguir 100 % CRLF: `CR == nº de líneas`) y de los demás archivos tocados (CR = 0).

- [ ] **Step 6: Checkpoint F1 (sin commit)**

Verificación manual de la fase: ejecutar el bot en modo archivo (`npm run bot -- --file <txt con "Nombre: texto">`), comprobar que aparece `output/reunion_<id>.json`, abrir la app en desarrollo, pulsar "Importar reuniones del bot" y comprobar la etiqueta Bot, que la sesión abre sin reproductor y que reimportar dice "ya estaba importada".

---

# FASE 2 — Ver el resumen completo

### Task 8: Resumen y puntos de acción en el backend

**Files:**
- Modify: `packages/shared/src/dto/library.dto.ts`
- Modify: `backend/src/desktop/infrastructure/sqlite/SqliteLibraryRepository.ts`
- Modify: `backend/src/desktop/http/routes/library.routes.ts`
- Modify: `backend/src/desktop/tests/libraryTestUtils.ts`
- Test: `backend/src/desktop/tests/LibraryRepository.test.ts` (añadir), `backend/src/desktop/tests/LibraryRoutes.test.ts` (añadir)

**Interfaces:**
- Produces:
  - DTOs `ActionItemDto`, `MeetingSummaryDto`, `UpdateActionItemSchema`.
  - `SqliteLibraryRepository.sessionExistsForUser(userId: string, sessionId: string): boolean`
  - `SqliteLibraryRepository.getMeetingSummary(sessionId: string): MeetingSummaryDto | null`
  - `SqliteLibraryRepository.setActionItemDone(userId: string, itemId: string, done: boolean, now?: Date): ActionItemDto | null`
  - Rutas `GET /library/sessions/:id/meeting-summary` (404 si la sesión no es del usuario; `data: null` si no tiene resumen) y `PATCH /library/action-items/:id` (`{ done }`; 404 si no existe o no es del usuario).
  - Helpers de test `insertMeetingSummary(db, o)` e `insertActionItem(db, o)`.

- [ ] **Step 1: Añadir helpers de test y los tests que fallan**

Añadir a `libraryTestUtils.ts`:

```ts
export function insertMeetingSummary(
  db: DatabaseSync,
  o: {
    sessionId: string;
    executiveSummary?: string;
    note?: string | null;
    topics?: unknown[];
    decisions?: unknown[];
    openQuestions?: unknown[];
    participants?: unknown[];
    chapters?: unknown[];
  }
): void {
  db.prepare(
    `INSERT INTO meeting_summaries (id, session_id, language, executive_summary, note, generated_at, topics, decisions, open_questions, participants, chapters)
     VALUES (?, ?, 'es', ?, ?, '2026-11-25T14:31:00.000Z', ?, ?, ?, ?, ?)`
  ).run(
    `ms-${o.sessionId}`,
    o.sessionId,
    o.executiveSummary ?? "Resumen de prueba.",
    o.note ?? null,
    JSON.stringify(o.topics ?? []),
    JSON.stringify(o.decisions ?? []),
    JSON.stringify(o.openQuestions ?? []),
    JSON.stringify(o.participants ?? []),
    JSON.stringify(o.chapters ?? [])
  );
}

export function insertActionItem(
  db: DatabaseSync,
  o: { id: string; sessionId: string; position?: number; task?: string; owner?: string | null; dueDate?: string | null; evidence?: string; done?: boolean }
): void {
  db.prepare(
    "INSERT INTO action_items (id, session_id, position, task, owner, due_date, evidence, done, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    o.id,
    o.sessionId,
    o.position ?? 0,
    o.task ?? `Tarea ${o.id}`,
    o.owner ?? null,
    o.dueDate ?? null,
    o.evidence ?? "cita",
    o.done ? 1 : 0,
    o.done ? "2026-11-26T10:00:00.000Z" : null
  );
}
```

Añadir a `LibraryRepository.test.ts` (con los imports `insertMeetingSummary, insertActionItem, insertSpeaker`):

```ts
describe("SqliteLibraryRepository: resumen y puntos de acción", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    insertSession(db, { id: "s1", source: "BOT", fileFormat: "bot", externalId: "x1" });
    insertSession(db, { id: "sin-resumen" });
    insertMeetingSummary(db, {
      sessionId: "s1",
      executiveSummary: "Se acordó migrar.",
      note: null,
      topics: [{ title: "Migración", summary: "Plan." }],
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar" }],
      openQuestions: [{ text: "¿Quién aprueba?", askedBy: "Ana" }, { text: "¿Cuándo?" }],
      participants: [{ name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 }],
      chapters: [{ title: "Migración", startSec: 0, endSec: 30 }]
    });
    insertActionItem(db, { id: "ai-b", sessionId: "s1", position: 1, task: "Segunda", owner: "Luis", dueDate: "jueves" });
    insertActionItem(db, { id: "ai-a", sessionId: "s1", position: 0, task: "Primera" });
  });
  afterEach(() => db.close());

  it("sessionExistsForUser distingue sesiones propias, ajenas e inexistentes", () => {
    expect(repo.sessionExistsForUser(LOCAL_USER_ID, "s1")).toBe(true);
    expect(repo.sessionExistsForUser(LOCAL_USER_ID, "no-existe")).toBe(false);
    expect(repo.sessionExistsForUser("otro-usuario", "s1")).toBe(false);
  });

  it("getMeetingSummary devuelve el resumen con los puntos de acción ordenados por posición", () => {
    const s = repo.getMeetingSummary("s1")!;
    expect(s).toMatchObject({
      sessionId: "s1",
      language: "es",
      executiveSummary: "Se acordó migrar.",
      note: null,
      topics: [{ title: "Migración", summary: "Plan." }],
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar" }],
      participants: [{ name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 }],
      chapters: [{ title: "Migración", startSec: 0, endSec: 30 }]
    });
    expect(s.openQuestions).toEqual([{ text: "¿Quién aprueba?", askedBy: "Ana" }, { text: "¿Cuándo?", askedBy: null }]);
    expect(s.actionItems.map((a) => a.task)).toEqual(["Primera", "Segunda"]);
    expect(s.actionItems[1]).toEqual({
      id: "ai-b", sessionId: "s1", task: "Segunda", owner: "Luis", dueDate: "jueves", evidence: "cita", done: false, doneAt: null
    });
  });

  it("devuelve null si la sesión no tiene resumen", () => {
    expect(repo.getMeetingSummary("sin-resumen")).toBeNull();
  });

  it("setActionItemDone marca y desmarca fijando o limpiando done_at", () => {
    const now = new Date("2026-11-27T12:00:00.000Z");
    const done = repo.setActionItemDone(LOCAL_USER_ID, "ai-a", true, now)!;
    expect(done).toMatchObject({ id: "ai-a", done: true, doneAt: now.toISOString() });

    const undone = repo.setActionItemDone(LOCAL_USER_ID, "ai-a", false)!;
    expect(undone).toMatchObject({ done: false, doneAt: null });
  });

  it("setActionItemDone devuelve null si el punto no existe o pertenece a otro usuario", () => {
    expect(repo.setActionItemDone(LOCAL_USER_ID, "no-existe", true)).toBeNull();
    expect(repo.setActionItemDone("otro-usuario", "ai-a", true)).toBeNull();
    expect((db.prepare("SELECT done FROM action_items WHERE id = 'ai-a'").get() as any).done).toBe(0);
  });
});
```

Añadir a `LibraryRoutes.test.ts` (importar `insertMeetingSummary`, `insertActionItem`):

```ts
  it("GET /library/sessions/:id/meeting-summary: resumen, null sin resumen y 404 si no existe", async () => {
    insertSession(db, { id: "s1", source: "BOT", fileFormat: "bot", externalId: "x1" });
    insertSession(db, { id: "s2" });
    insertMeetingSummary(db, { sessionId: "s1", executiveSummary: "Hola." });
    insertActionItem(db, { id: "ai1", sessionId: "s1", task: "Hacer algo" });

    const ok = (await (await fetch(`${base}/library/sessions/s1/meeting-summary`)).json()) as any;
    expect(ok.success).toBe(true);
    expect(ok.data.executiveSummary).toBe("Hola.");
    expect(ok.data.actionItems[0]).toMatchObject({ id: "ai1", task: "Hacer algo", done: false });

    const none = (await (await fetch(`${base}/library/sessions/s2/meeting-summary`)).json()) as any;
    expect(none).toEqual({ success: true, data: null });

    expect((await fetch(`${base}/library/sessions/no-existe/meeting-summary`)).status).toBe(404);
  });

  it("PATCH /library/action-items/:id marca como hecho, valida el cuerpo y responde 404 si no existe", async () => {
    insertSession(db, { id: "s1", source: "BOT", fileFormat: "bot", externalId: "x1" });
    insertActionItem(db, { id: "ai1", sessionId: "s1" });
    const patch = (id: string, body: unknown) =>
      fetch(`${base}/library/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

    const ok = await patch("ai1", { done: true });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).data).toMatchObject({ id: "ai1", done: true });

    expect((await patch("ai1", { done: "si" })).status).toBe(400);
    expect((await patch("no-existe", { done: true })).status).toBe(404);
  });
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/desktop/tests/LibraryRepository.test.ts src/desktop/tests/LibraryRoutes.test.ts`
Expected: FAIL (métodos y rutas inexistentes).

- [ ] **Step 3: Implementar**

Añadir a `packages/shared/src/dto/library.dto.ts`:

```ts
export interface ActionItemDto {
  id: string;
  sessionId: string;
  task: string;
  owner: string | null;
  /** Texto libre, tal como se dijo en la reunión (no se interpreta como fecha). */
  dueDate: string | null;
  evidence: string;
  done: boolean;
  doneAt: string | null;
}

export interface MeetingSummaryDto {
  sessionId: string;
  language: string;
  executiveSummary: string;
  note: string | null;
  generatedAt: string;
  topics: { title: string; summary: string }[];
  decisions: { text: string; evidence: string }[];
  openQuestions: { text: string; askedBy: string | null }[];
  participants: { name: string; speakingSeconds: number; speakingPercent: number }[];
  chapters: { title: string; startSec: number; endSec: number }[];
  actionItems: ActionItemDto[];
}

export const UpdateActionItemSchema = z.object({ done: z.boolean() });
export type UpdateActionItemInput = z.infer<typeof UpdateActionItemSchema>;
```

Añadir a `SqliteLibraryRepository.ts` (importar `ActionItemDto`, `MeetingSummaryDto`):

```ts
  public sessionExistsForUser(userId: string, sessionId: string): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 AS x FROM transcription_sessions WHERE id = ? AND user_id = ?").get(sessionId, userId)
    );
  }

  public getMeetingSummary(sessionId: string): MeetingSummaryDto | null {
    const row = this.db.prepare("SELECT * FROM meeting_summaries WHERE session_id = ?").get(sessionId) as any;
    if (!row) return null;

    const items = this.db
      .prepare("SELECT * FROM action_items WHERE session_id = ? ORDER BY position ASC")
      .all(sessionId) as any[];

    const openQuestions = parseJsonArray<{ text: string; askedBy?: string }>(row.open_questions).map((q) => ({
      text: q.text,
      askedBy: q.askedBy ?? null
    }));

    return {
      sessionId,
      language: row.language,
      executiveSummary: row.executive_summary,
      note: row.note ?? null,
      generatedAt: row.generated_at,
      topics: parseJsonArray(row.topics),
      decisions: parseJsonArray(row.decisions),
      openQuestions,
      participants: parseJsonArray(row.participants),
      chapters: parseJsonArray(row.chapters),
      actionItems: items.map(toActionItem)
    };
  }

  /** Marca o desmarca un punto de acción; null si no existe o no pertenece al usuario. */
  public setActionItemDone(userId: string, itemId: string, done: boolean, now: Date = new Date()): ActionItemDto | null {
    const owned = this.db
      .prepare(
        `SELECT a.id FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id
         WHERE a.id = ? AND s.user_id = ?`
      )
      .get(itemId, userId);
    if (!owned) return null;

    this.db
      .prepare("UPDATE action_items SET done = ?, done_at = ? WHERE id = ?")
      .run(done ? 1 : 0, done ? now.toISOString() : null, itemId);

    const row = this.db.prepare("SELECT * FROM action_items WHERE id = ?").get(itemId) as any;
    return toActionItem(row);
  }
```

y, fuera de la clase, al final del archivo:

```ts
function parseJsonArray<T = any>(raw: unknown): T[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toActionItem(r: any): ActionItemDto {
  return {
    id: r.id,
    sessionId: r.session_id,
    task: r.task,
    owner: r.owner ?? null,
    dueDate: r.due_date ?? null,
    evidence: r.evidence,
    done: Boolean(r.done),
    doneAt: r.done_at ?? null
  };
}
```

Añadir a `library.routes.ts` (importar `NotFoundError` de `../../../domain/errors/NotFoundError.js`, `validateBody` y `UpdateActionItemSchema`), antes del `return router;`:

```ts
  router.get("/library/sessions/:id/meeting-summary", (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.params["id"]!;
      if (!deps.libraryRepository.sessionExistsForUser(req.user!.userId, sessionId)) {
        throw new NotFoundError("Sesión de transcripción", sessionId);
      }
      res.json({ success: true, data: deps.libraryRepository.getMeetingSummary(sessionId) });
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/library/action-items/:id",
    validateBody(UpdateActionItemSchema),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const itemId = req.params["id"]!;
        const item = deps.libraryRepository.setActionItemDone(req.user!.userId, itemId, req.body.done);
        if (!item) throw new NotFoundError("Punto de acción", itemId);
        res.json({ success: true, data: item });
      } catch (err) {
        next(err);
      }
    }
  );
```

(`validateBody` se importa junto a `validateQuery` desde el mismo módulo.)

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd packages/shared && npm run build && cd ../../backend && npx vitest run src/desktop/tests/LibraryRepository.test.ts src/desktop/tests/LibraryRoutes.test.ts && npx tsc --noEmit`
Expected: PASS, `tsc` limpio.

- [ ] **Step 5: Checkpoint (sin commit)**

---

### Task 9: Pestaña "Resumen de reunión" en la página de sesión

**Files:**
- Create: `frontend/src/features/library/summaryHelpers.ts`, `frontend/src/features/library/useMeetingSummary.ts`, `frontend/src/features/library/MeetingSummaryTab.tsx`
- Modify: `frontend/src/pages/SessionPage.tsx` (CRLF), `frontend/src/features/player/SegmentList.tsx`
- Test: `frontend/src/tests/summaryHelpers.test.ts`

**Interfaces:**
- Consumes: `MeetingSummaryDto`, `ActionItemDto` (Task 8); endpoints `GET /desktop/library/sessions/:id/meeting-summary` y `PATCH /desktop/library/action-items/:id`.
- Produces:
  - `formatSeconds(totalSec: number): string`, `normalizeForMatch(text: string): string`, `findSegmentIdByQuote(segments: { id: string; content: string }[], quote: string): string | null`, `findSegmentIdAtSeconds(segments: { id: string; startTimeMs: number }[], sec: number): string | null`, `applyActionItemDone(summary: MeetingSummaryDto, itemId: string, done: boolean, doneAt: string | null): MeetingSummaryDto`
  - `useMeetingSummary(sessionId: string, enabled: boolean)` → `{ summary: MeetingSummaryDto | null; toggleActionItem: (itemId: string, done: boolean) => Promise<void> }`
  - `<MeetingSummaryTab summary onToggleItem onOpenQuote onOpenChapter />`

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/tests/summaryHelpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyActionItemDone,
  findSegmentIdAtSeconds,
  findSegmentIdByQuote,
  formatSeconds,
  normalizeForMatch
} from "../features/library/summaryHelpers.js";
import type { MeetingSummaryDto } from "@audio-to-text/shared";

const segments = [
  { id: "s1", startTimeMs: 0, content: "Vamos a migrar la base de datos el viernes." },
  { id: "s2", startTimeMs: 12000, content: "Yo me encargo de preparar el script de migración." },
  { id: "s3", startTimeMs: 30000, content: "Perfecto, ¿alguien sabe quién aprueba el presupuesto?" }
];

describe("summaryHelpers", () => {
  it("formatSeconds da mm:ss y h:mm:ss", () => {
    expect(formatSeconds(0)).toBe("00:00");
    expect(formatSeconds(75)).toBe("01:15");
    expect(formatSeconds(3725)).toBe("1:02:05");
    expect(formatSeconds(-3)).toBe("00:00");
  });

  it("normalizeForMatch ignora mayúsculas, tildes y espacios repetidos", () => {
    expect(normalizeForMatch("  Migración   DE  Datos ")).toBe("migracion de datos");
  });

  it("findSegmentIdByQuote encuentra el segmento que contiene la cita, sin importar tildes ni mayúsculas", () => {
    expect(findSegmentIdByQuote(segments, "yo me encargo de preparar el script de MIGRACION")).toBe("s2");
    expect(findSegmentIdByQuote(segments, "alguien sabe quién aprueba")).toBe("s3");
    expect(findSegmentIdByQuote(segments, "frase que nadie dijo")).toBeNull();
    expect(findSegmentIdByQuote(segments, "   ")).toBeNull();
  });

  it("findSegmentIdAtSeconds devuelve el segmento en curso (el último que empezó) o el primero", () => {
    expect(findSegmentIdAtSeconds(segments, 0)).toBe("s1");
    expect(findSegmentIdAtSeconds(segments, 11)).toBe("s1");
    expect(findSegmentIdAtSeconds(segments, 12)).toBe("s2");
    expect(findSegmentIdAtSeconds(segments, 500)).toBe("s3");
    expect(findSegmentIdAtSeconds([], 5)).toBeNull();
  });

  it("applyActionItemDone actualiza solo el punto indicado sin mutar el original", () => {
    const summary = {
      sessionId: "x",
      actionItems: [
        { id: "a", done: false, doneAt: null },
        { id: "b", done: false, doneAt: null }
      ]
    } as unknown as MeetingSummaryDto;

    const next = applyActionItemDone(summary, "b", true, "2026-11-26T10:00:00.000Z");

    expect(next.actionItems.map((i) => [i.id, i.done, i.doneAt])).toEqual([
      ["a", false, null],
      ["b", true, "2026-11-26T10:00:00.000Z"]
    ]);
    expect(summary.actionItems[1]!.done).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd frontend && npx vitest run src/tests/summaryHelpers.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar helpers y hook**

`frontend/src/features/library/summaryHelpers.ts`:

```ts
import type { MeetingSummaryDto } from "@audio-to-text/shared";

export function formatSeconds(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Segmento que contiene la cita textual de una tarea o decisión. */
export function findSegmentIdByQuote(segments: { id: string; content: string }[], quote: string): string | null {
  const needle = normalizeForMatch(quote);
  if (!needle) return null;
  const hit = segments.find((seg) => normalizeForMatch(seg.content).includes(needle));
  return hit ? hit.id : null;
}

/** Segmento en curso en un instante: el último que ya empezó (o el primero si aún no empezó ninguno). */
export function findSegmentIdAtSeconds(segments: { id: string; startTimeMs: number }[], sec: number): string | null {
  if (segments.length === 0) return null;
  const ms = sec * 1000;
  let found = segments[0]!;
  for (const seg of segments) {
    if (seg.startTimeMs <= ms) found = seg;
    else break;
  }
  return found.id;
}

export function applyActionItemDone(
  summary: MeetingSummaryDto,
  itemId: string,
  done: boolean,
  doneAt: string | null
): MeetingSummaryDto {
  return {
    ...summary,
    actionItems: summary.actionItems.map((item) => (item.id === itemId ? { ...item, done, doneAt } : item))
  };
}
```

`frontend/src/features/library/useMeetingSummary.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import type { ActionItemDto, MeetingSummaryDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { applyActionItemDone } from "./summaryHelpers.js";

export function useMeetingSummary(sessionId: string, enabled: boolean) {
  const [summary, setSummary] = useState<MeetingSummaryDto | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      return;
    }
    let active = true;
    api
      .get<{ success: boolean; data: MeetingSummaryDto | null }>(`/desktop/library/sessions/${sessionId}/meeting-summary`)
      .then((res) => {
        if (active && res.success) setSummary(res.data);
      })
      .catch(() => {
        // Sin resumen o sin conexión: la pestaña simplemente no aparece
      });
    return () => {
      active = false;
    };
  }, [sessionId, enabled]);

  const toggleActionItem = useCallback(
    async (itemId: string, done: boolean) => {
      // Optimista: se marca al instante y se revierte si el servidor falla
      setSummary((prev) => (prev ? applyActionItemDone(prev, itemId, done, done ? new Date().toISOString() : null) : prev));
      try {
        const res = await api.patch<{ success: boolean; data?: ActionItemDto }>(`/desktop/library/action-items/${itemId}`, { done });
        if (!res.success || !res.data) throw new Error("No se pudo actualizar");
        const saved = res.data;
        setSummary((prev) => (prev ? applyActionItemDone(prev, itemId, saved.done, saved.doneAt) : prev));
      } catch {
        setSummary((prev) => (prev ? applyActionItemDone(prev, itemId, !done, null) : prev));
      }
    },
    []
  );

  return { summary, toggleActionItem };
}
```

- [ ] **Step 4: Implementar el componente de la pestaña**

`frontend/src/features/library/MeetingSummaryTab.tsx`:

```tsx
import React from "react";
import { Alert, Box, Checkbox, Chip, LinearProgress, Link, Paper, Typography } from "@mui/material";
import type { MeetingSummaryDto } from "@audio-to-text/shared";
import { formatSeconds } from "./summaryHelpers.js";

interface MeetingSummaryTabProps {
  summary: MeetingSummaryDto;
  onToggleItem: (itemId: string, done: boolean) => void;
  /** Salta a la transcripción en el segmento que contiene esta cita. */
  onOpenQuote: (quote: string) => void;
  /** Salta a la transcripción en el segundo indicado. */
  onOpenChapter: (startSec: number) => void;
}

const Section: React.FC<{ title: string; empty?: boolean; children: React.ReactNode }> = ({ title, empty, children }) => (
  <Paper sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
      {title}
    </Typography>
    {empty ? (
      <Typography variant="body2" color="text.secondary">
        Sin elementos.
      </Typography>
    ) : (
      children
    )}
  </Paper>
);

const Quote: React.FC<{ text: string; onOpen: (quote: string) => void }> = ({ text, onOpen }) => (
  <Link
    component="button"
    type="button"
    underline="hover"
    onClick={() => onOpen(text)}
    sx={{ display: "block", textAlign: "left", fontStyle: "italic", color: "text.secondary", fontSize: "0.85rem", mt: 0.25 }}
  >
    “{text}”
  </Link>
);

export const MeetingSummaryTab: React.FC<MeetingSummaryTabProps> = ({ summary, onToggleItem, onOpenQuote, onOpenChapter }) => {
  return (
    <Box>
      {summary.note && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {summary.note}
        </Alert>
      )}

      <Section title="Resumen ejecutivo">
        <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
          {summary.executiveSummary}
        </Typography>
      </Section>

      <Section title={`Puntos de acción (${summary.actionItems.length})`} empty={summary.actionItems.length === 0}>
        {summary.actionItems.map((item) => (
          <Box key={item.id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1.5 }}>
            <Checkbox
              checked={item.done}
              onChange={(e) => onToggleItem(item.id, e.target.checked)}
              inputProps={{ "aria-label": `Marcar como hecha: ${item.task}` }}
              sx={{ p: 0.5 }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body1" fontWeight={600} sx={{ textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>
                {item.task}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", my: 0.5 }}>
                {item.owner && <Chip size="small" label={`Responsable: ${item.owner}`} />}
                {item.dueDate && <Chip size="small" variant="outlined" label={`Fecha: ${item.dueDate}`} />}
              </Box>
              <Quote text={item.evidence} onOpen={onOpenQuote} />
            </Box>
          </Box>
        ))}
      </Section>

      <Section title="Decisiones" empty={summary.decisions.length === 0}>
        {summary.decisions.map((d, i) => (
          <Box key={i} sx={{ mb: 1.5 }}>
            <Typography variant="body1">{d.text}</Typography>
            <Quote text={d.evidence} onOpen={onOpenQuote} />
          </Box>
        ))}
      </Section>

      <Section title="Temas" empty={summary.topics.length === 0}>
        {summary.topics.map((t, i) => (
          <Typography key={i} variant="body2" sx={{ mb: 1 }}>
            <strong>{t.title}:</strong> {t.summary}
          </Typography>
        ))}
      </Section>

      <Section title="Preguntas abiertas" empty={summary.openQuestions.length === 0}>
        {summary.openQuestions.map((q, i) => (
          <Typography key={i} variant="body2" sx={{ mb: 1 }}>
            {q.text}
            {q.askedBy ? ` (${q.askedBy})` : ""}
          </Typography>
        ))}
      </Section>

      <Section title="Participantes" empty={summary.participants.length === 0}>
        {summary.participants.map((p) => (
          <Box key={p.name} sx={{ mb: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="body2" fontWeight={600}>
                {p.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatSeconds(p.speakingSeconds)} · {p.speakingPercent}%
              </Typography>
            </Box>
            <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, p.speakingPercent))} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        ))}
      </Section>

      <Section title="Capítulos" empty={summary.chapters.length === 0}>
        {summary.chapters.map((c, i) => (
          <Link
            key={i}
            component="button"
            type="button"
            underline="hover"
            onClick={() => onOpenChapter(c.startSec)}
            sx={{ display: "block", textAlign: "left", mb: 0.75 }}
          >
            <strong>
              {formatSeconds(c.startSec)}–{formatSeconds(c.endSec)}
            </strong>{" "}
            {c.title}
          </Link>
        ))}
      </Section>
    </Box>
  );
};
```

- [ ] **Step 5: Integrar en la página de sesión**

`SegmentList.tsx`: en el `Paper` de cada segmento, junto a `key={seg.id}`, añadir la propiedad `id={`segment-${seg.id}`}`.

`SessionPage.tsx` (CRLF; ediciones dirigidas, conservando CRLF):
1. Imports: `import { MeetingSummaryTab } from "../features/library/MeetingSummaryTab.js";`, `import { useMeetingSummary } from "../features/library/useMeetingSummary.js";`, `import { findSegmentIdAtSeconds, findSegmentIdByQuote } from "../features/library/summaryHelpers.js";` y el icono `Summarize as SummaryIcon` añadido al import existente de `@mui/icons-material`.
2. Antes del componente: `type SessionTab = "summary" | "transcript" | "analysis";`
3. Reemplazar `const [activeTab, setActiveTab] = useState<number>(0);` por `const [activeTab, setActiveTab] = useState<SessionTab>("transcript");`
4. Justo después de `const activeSegment = useActiveSegment(...)` (antes de los `return` tempranos de carga/error, para respetar el orden de hooks) añadir:

```tsx
  const isBotSession = currentSession?.fileFormat === "bot";
  const { summary, toggleActionItem } = useMeetingSummary(sessionId, Boolean(isBotSession));

  // Cuando llega el resumen de una reunión del bot, esa pestaña pasa a ser la primera vista
  useEffect(() => {
    if (summary) setActiveTab("summary");
  }, [summary?.sessionId]);

  const jumpToSegment = (segmentId: string | null) => {
    if (!segmentId) return;
    setActiveTab("transcript");
    setTimeout(() => {
      document.getElementById(`segment-${segmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };
```

5. Antes de editar el bloque de pestañas, buscar con `grep -n "activeTab" frontend/src/pages/SessionPage.tsx` que no hay más usos que los de ese bloque. Reemplazar el bloque `{currentSession.status === SessionStatus.COMPLETED && ( ... )}` completo por:

```tsx
      {currentSession.status === SessionStatus.COMPLETED && (
        <Box sx={{ mt: 3 }}>
          <Paper sx={{ mb: 3, borderRadius: 2 }}>
            <Tabs
              value={activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              {summary && (
                <Tab
                  value="summary"
                  icon={<SummaryIcon />}
                  iconPosition="start"
                  label="Resumen de reunión"
                />
              )}
              <Tab
                value="transcript"
                icon={<TranscriptIcon />}
                iconPosition="start"
                label={`Transcripción (${currentSession.segments.length})`}
              />
              <Tab
                value="analysis"
                icon={<AiIcon />}
                iconPosition="start"
                label="Resumen & Issues IA"
              />
            </Tabs>
          </Paper>

          {activeTab === "summary" && summary && (
            <MeetingSummaryTab
              summary={summary}
              onToggleItem={toggleActionItem}
              onOpenQuote={(quote) => jumpToSegment(findSegmentIdByQuote(currentSession.segments, quote))}
              onOpenChapter={(startSec) => jumpToSegment(findSegmentIdAtSeconds(currentSession.segments, startSec))}
            />
          )}

          {activeTab === "transcript" && (
            <>
              <ExportPanel sessionId={sessionId} />
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>
                Segmentos Transcritos ({currentSession.segments.length})
              </Typography>
              <SegmentList
                sessionId={sessionId}
                segments={currentSession.segments}
                speakers={currentSession.speakers}
                activeSegmentId={activeSegment?.id || null}
              />
              {currentSession.fileFormat !== "bot" && <AudioPlayer />}
            </>
          )}

          {activeTab === "analysis" && (
            <MeetingAnalysisPanel sessionId={sessionId} />
          )}
        </Box>
      )}
```

Nota: el bloque anterior ya incluye el `fileFormat !== "bot"` de la Tarea 7; el reemplazo lo conserva.

- [ ] **Step 6: Ejecutar y verificar**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS (todos + 5 nuevos), `tsc` limpio. `SessionPage.tsx` sigue 100 % CRLF.

- [ ] **Step 7: Checkpoint F2 (sin commit)**

Verificación manual: abrir la reunión importada; la primera pestaña es "Resumen de reunión"; marcar una casilla, recargar y comprobar que sigue marcada; pulsar una cita y un capítulo y comprobar que salta a la transcripción y centra el segmento.

---

# FASE 3 — Búsqueda de texto

### Task 10: Normalización, fragmentos e índice perezoso

**Files:**
- Create: `backend/src/desktop/library/searchText.ts`, `backend/src/desktop/library/searchSnippet.ts`, `backend/src/desktop/library/SessionSearchIndexer.ts`
- Test: `backend/src/desktop/tests/SearchText.test.ts`, `backend/src/desktop/tests/SearchSnippet.test.ts`, `backend/src/desktop/tests/SessionSearchIndexer.test.ts`

**Interfaces:**
- Produces:
  - `normalizeSearchText(text: string): string` (conserva la longitud UTF-16), `parseSearchQuery(q: string | undefined): string[]`, `escapeLike(term: string): string`, `flattenJsonText(raw: unknown): string`
  - `buildSnippet(original: string, terms: string[]): { text: string; ranges: [number, number][] } | null`
  - `buildSessionTexts(db: DatabaseSync, sessionId: string): { title: string; body: string } | null`
  - `class SessionSearchIndexer { constructor(db, now?); reindexSession(sessionId): void; ensureIndexed(userId): number }`

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/SearchText.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { escapeLike, flattenJsonText, normalizeSearchText, parseSearchQuery } from "../library/searchText.js";

describe("searchText", () => {
  it("normaliza sin tildes y en minúsculas conservando la longitud (las posiciones valen para el original)", () => {
    expect(normalizeSearchText("Migración ÁÉÍÓÚ Ñandú")).toBe("migracion aeiou nandu");
    for (const sample of ["Reunión de migración", "😀 Ñandú café", "İstanbul ß straße", "á combinado"]) {
      expect(normalizeSearchText(sample).length).toBe(sample.length);
    }
  });

  it("parseSearchQuery normaliza, descarta términos de menos de 2 letras, deduplica y limita a 5", () => {
    expect(parseSearchQuery("  Migración   BASE ")).toEqual(["migracion", "base"]);
    expect(parseSearchQuery("a b cd")).toEqual(["cd"]);
    expect(parseSearchQuery("uno uno UNO dos")).toEqual(["uno", "dos"]);
    expect(parseSearchQuery("aa bb cc dd ee ff gg")).toEqual(["aa", "bb", "cc", "dd", "ee"]);
    expect(parseSearchQuery(undefined)).toEqual([]);
    expect(parseSearchQuery("   ")).toEqual([]);
    expect(parseSearchQuery("x")).toEqual([]);
  });

  it("escapeLike escapa %, _ y la barra invertida", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });

  it("flattenJsonText junta solo los valores de texto, no las claves", () => {
    const raw = JSON.stringify([{ text: "Migrar el viernes", evidence: "Vamos a migrar" }, "otro texto", 42, null]);
    const flat = flattenJsonText(raw);
    expect(flat).toContain("Migrar el viernes");
    expect(flat).toContain("Vamos a migrar");
    expect(flat).toContain("otro texto");
    expect(flat).not.toContain("evidence");
    expect(flattenJsonText("no es json")).toBe("");
    expect(flattenJsonText(null)).toBe("");
  });
});
```

`backend/src/desktop/tests/SearchSnippet.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSnippet } from "../library/searchSnippet.js";

describe("buildSnippet", () => {
  it("encuentra sin importar tildes y devuelve rangos sobre el texto ORIGINAL", () => {
    const s = buildSnippet("Hoy hablamos de la migración de la base", ["migracion"])!;
    expect(s.text).toBe("Hoy hablamos de la migración de la base");
    expect(s.ranges).toHaveLength(1);
    expect(s.text.slice(s.ranges[0]![0], s.ranges[0]![1])).toBe("migración");
  });

  it("recorta con contexto y marca el recorte con puntos suspensivos; los rangos incluyen el prefijo", () => {
    const original = `${"x".repeat(100)} migración ${"y".repeat(100)}`;
    const s = buildSnippet(original, ["migracion"])!;
    expect(s.text.startsWith("…")).toBe(true);
    expect(s.text.endsWith("…")).toBe(true);
    expect(s.text.length).toBeLessThan(original.length);
    expect(s.text.slice(s.ranges[0]![0], s.ranges[0]![1])).toBe("migración");
  });

  it("resalta todos los términos presentes en la ventana, ordenados y sin solaparse", () => {
    const s = buildSnippet("Revisar la migración y el presupuesto de la migración", ["presupuesto", "migracion", "mig"])!;
    const marked = s.ranges.map(([a, b]) => s.text.slice(a, b));
    expect(marked).toEqual(["migración", "presupuesto", "migración"]);
    for (let i = 1; i < s.ranges.length; i++) expect(s.ranges[i]![0]).toBeGreaterThanOrEqual(s.ranges[i - 1]![1]);
  });

  it("sin coincidencia devuelve null y los saltos de línea se convierten en espacios sin cambiar la longitud", () => {
    expect(buildSnippet("nada que ver", ["migracion"])).toBeNull();
    const s = buildSnippet("linea uno\nmigración\nlinea tres", ["migracion"])!;
    expect(s.text).toBe("linea uno migración linea tres");
    expect(s.text.slice(s.ranges[0]![0], s.ranges[0]![1])).toBe("migración");
  });
});
```

`backend/src/desktop/tests/SessionSearchIndexer.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SessionSearchIndexer, buildSessionTexts } from "../library/SessionSearchIndexer.js";
import { insertActionItem, insertMeetingSummary, insertSegment, insertSession, insertSpeaker, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SessionSearchIndexer", () => {
  let db: DatabaseSync;
  const body = (id: string) => (db.prepare("SELECT body_text FROM session_search WHERE session_id = ?").get(id) as any)?.body_text as string | undefined;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    insertSession(db, { id: "s1", name: "Reunión Google Meet", source: "BOT", fileFormat: "bot", externalId: "x1", updatedAt: "2026-11-26T09:00:00.000Z" });
    insertSpeaker(db, { id: "sp1", sessionId: "s1", label: "Ana" });
    insertSpeaker(db, { id: "sp2", sessionId: "s1", label: "Hablante 2", customName: "Luis Pérez" });
    insertSegment(db, { id: "g1", sessionId: "s1", speakerId: "sp1", startMs: 0, endMs: 5000, content: "Vamos a migrar la base de datos." });
    insertMeetingSummary(db, {
      sessionId: "s1",
      executiveSummary: "Se acordó la migración.",
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar" }]
    });
    insertActionItem(db, { id: "ai1", sessionId: "s1", task: "Preparar el script", owner: "Luis" });
    insertSession(db, { id: "pendiente", status: "PENDING" });
  });
  afterEach(() => db.close());

  it("indexa solo sesiones COMPLETED con título, hablantes, transcripción, resumen y puntos de acción, normalizados", () => {
    const indexer = new SessionSearchIndexer(db, () => new Date("2026-11-26T10:00:00.000Z"));
    expect(indexer.ensureIndexed(LOCAL_USER_ID)).toBe(1);

    const text = body("s1")!;
    expect(text).toContain("ana");
    expect(text).toContain("luis perez"); // nombre personalizado, sin tilde
    expect(text).toContain("vamos a migrar la base de datos");
    expect(text).toContain("se acordo la migracion");
    expect(text).toContain("migrar el viernes");
    expect(text).toContain("preparar el script");
    expect(body("pendiente")).toBeUndefined();
    expect((db.prepare("SELECT title_text FROM session_search WHERE session_id = 's1'").get() as any).title_text).toBe("reunion google meet");
  });

  it("es idempotente: sin cambios no reindexa", () => {
    const indexer = new SessionSearchIndexer(db, () => new Date("2026-11-26T10:00:00.000Z"));
    indexer.ensureIndexed(LOCAL_USER_ID);
    expect(indexer.ensureIndexed(LOCAL_USER_ID)).toBe(0);
  });

  it("reindexa cuando el análisis cambió después de indexar", () => {
    new SessionSearchIndexer(db, () => new Date("2026-11-26T10:00:00.000Z")).ensureIndexed(LOCAL_USER_ID);

    db.prepare(
      `INSERT INTO meeting_analyses (id, session_id, summary, key_decisions, topics_discussed, issues, created_at, updated_at)
       VALUES ('a1', 's1', 'Análisis nuevo sobre facturación', '[]', '[]', '[]', '2026-11-26T11:00:00.000Z', '2026-11-26T11:00:00.000Z')`
    ).run();

    const later = new SessionSearchIndexer(db, () => new Date("2026-11-26T11:30:00.000Z"));
    expect(later.ensureIndexed(LOCAL_USER_ID)).toBe(1);
    expect(body("s1")).toContain("analisis nuevo sobre facturacion");
  });

  it("solo indexa sesiones del usuario indicado y buildSessionTexts devuelve null si no existe", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    const indexer = new SessionSearchIndexer(db);
    indexer.ensureIndexed(LOCAL_USER_ID);
    expect(body("ajena")).toBeUndefined();
    expect(buildSessionTexts(db, "no-existe")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/desktop/tests/SearchText.test.ts src/desktop/tests/SearchSnippet.test.ts src/desktop/tests/SessionSearchIndexer.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`backend/src/desktop/library/searchText.ts`:

```ts
export const MIN_TERM_LENGTH = 2;
export const MAX_TERMS = 5;

/** Quita tildes y pasa a minúsculas un carácter; si el resultado cambia de longitud conserva el original. */
function foldCodePoint(cp: string): string {
  const folded = cp.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return folded.length === cp.length ? folded : cp;
}

/** Normaliza para buscar. Conserva la longitud UTF-16: una posición del texto normalizado vale para el original. */
export function normalizeSearchText(text: string): string {
  let out = "";
  for (const cp of text) out += foldCodePoint(cp);
  return out;
}

/** Términos de búsqueda: normalizados, de al menos 2 letras, sin repetir y como máximo 5. */
export function parseSearchQuery(q: string | undefined): string[] {
  if (!q) return [];
  const terms: string[] = [];
  for (const raw of normalizeSearchText(q).split(/\s+/)) {
    if (raw.length < MIN_TERM_LENGTH || terms.includes(raw)) continue;
    terms.push(raw);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/** Escapa los comodines de LIKE (usar con `ESCAPE '\'`). */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Junta todos los valores de texto de un JSON (no las claves). Devuelve "" si no es JSON válido. */
export function flattenJsonText(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "";
  }
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(parsed);
  return parts.join(" ");
}
```

`backend/src/desktop/library/searchSnippet.ts`:

```ts
import { normalizeSearchText } from "./searchText.js";

export interface SnippetResult {
  text: string;
  ranges: [number, number][];
}

const CONTEXT = 60;

/** Fragmento alrededor de la primera coincidencia, tomado del texto original, con los rangos a resaltar. */
export function buildSnippet(original: string, terms: string[]): SnippetResult | null {
  const normalized = normalizeSearchText(original);

  let first = -1;
  let firstLen = 0;
  for (const term of terms) {
    const i = normalized.indexOf(term);
    if (i !== -1 && (first === -1 || i < first)) {
      first = i;
      firstLen = term.length;
    }
  }
  if (first === -1) return null;

  let start = Math.max(0, first - CONTEXT);
  let end = Math.min(original.length, first + firstLen + CONTEXT);
  // no cortar un par sustituto (emoji) por la mitad
  if (start > 0 && original.charCodeAt(start) >= 0xdc00 && original.charCodeAt(start) <= 0xdfff) start++;
  if (end < original.length && original.charCodeAt(end - 1) >= 0xd800 && original.charCodeAt(end - 1) <= 0xdbff) end--;

  const prefix = start > 0 ? "…" : "";
  const suffix = end < original.length ? "…" : "";
  // los saltos de línea pasan a espacios 1 a 1 para no mover las posiciones
  const slice = original.slice(start, end).replace(/[\r\n\t]/g, " ");
  const windowNormalized = normalized.slice(start, end);

  const raw: [number, number][] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const i = windowNormalized.indexOf(term, from);
      if (i === -1) break;
      raw.push([i + prefix.length, i + term.length + prefix.length]);
      from = i + term.length;
    }
  }

  raw.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const ranges: [number, number][] = [];
  for (const r of raw) {
    const last = ranges[ranges.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else ranges.push([r[0], r[1]]);
  }

  return { text: `${prefix}${slice}${suffix}`, ranges };
}
```

`backend/src/desktop/library/SessionSearchIndexer.ts`:

```ts
import type { DatabaseSync } from "node:sqlite";
import { flattenJsonText, normalizeSearchText } from "./searchText.js";

export interface SessionTexts {
  title: string;
  body: string;
}

/** Texto original (sin normalizar) de una sesión: sirve para indexar y para construir fragmentos. */
export function buildSessionTexts(db: DatabaseSync, sessionId: string): SessionTexts | null {
  const session = db.prepare("SELECT original_file_name FROM transcription_sessions WHERE id = ?").get(sessionId) as any;
  if (!session) return null;

  const analysis = db
    .prepare("SELECT title, summary, key_decisions, topics_discussed FROM meeting_analyses WHERE session_id = ?")
    .get(sessionId) as any;
  const summary = db
    .prepare("SELECT executive_summary, topics, decisions, open_questions FROM meeting_summaries WHERE session_id = ?")
    .get(sessionId) as any;
  const speakers = db
    .prepare("SELECT COALESCE(custom_name, label) AS name FROM speakers WHERE session_id = ? ORDER BY label")
    .all(sessionId) as { name: string }[];
  const segments = db
    .prepare("SELECT content FROM transcription_segments WHERE session_id = ? ORDER BY start_time_ms")
    .all(sessionId) as { content: string }[];
  const items = db
    .prepare("SELECT task, owner, due_date FROM action_items WHERE session_id = ? ORDER BY position")
    .all(sessionId) as { task: string; owner: string | null; due_date: string | null }[];

  const title = [session.original_file_name, analysis?.title].filter(Boolean).join(" ");
  const body = [
    speakers.map((s) => s.name).join(" "),
    segments.map((s) => s.content).join("\n"),
    analysis?.summary,
    flattenJsonText(analysis?.key_decisions),
    flattenJsonText(analysis?.topics_discussed),
    summary?.executive_summary,
    flattenJsonText(summary?.topics),
    flattenJsonText(summary?.decisions),
    flattenJsonText(summary?.open_questions),
    items.map((i) => [i.task, i.owner, i.due_date].filter(Boolean).join(" ")).join("\n")
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");

  return { title, body };
}

export class SessionSearchIndexer {
  constructor(
    private db: DatabaseSync,
    private now: () => Date = () => new Date()
  ) {}

  public reindexSession(sessionId: string): void {
    const texts = buildSessionTexts(this.db, sessionId);
    if (!texts) return;
    this.db
      .prepare(
        `INSERT INTO session_search (session_id, title_text, body_text, indexed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           title_text = excluded.title_text, body_text = excluded.body_text, indexed_at = excluded.indexed_at`
      )
      .run(sessionId, normalizeSearchText(texts.title), normalizeSearchText(texts.body), this.now().toISOString());
  }

  /** Reindexa las sesiones COMPLETED del usuario sin fila o cuyo análisis/resumen cambió después. Devuelve cuántas. */
  public ensureIndexed(userId: string): number {
    const stale = this.db
      .prepare(
        `SELECT s.id FROM transcription_sessions s
         LEFT JOIN session_search ss ON ss.session_id = s.id
         LEFT JOIN meeting_analyses a ON a.session_id = s.id
         LEFT JOIN meeting_summaries ms ON ms.session_id = s.id
         WHERE s.user_id = ? AND s.status = 'COMPLETED'
           AND (ss.session_id IS NULL
                OR ss.indexed_at < MAX(s.updated_at, COALESCE(a.updated_at, ''), COALESCE(ms.generated_at, '')))`
      )
      .all(userId) as { id: string }[];

    for (const row of stale) this.reindexSession(row.id);
    return stale.length;
  }
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd backend && npx vitest run src/desktop/tests/SearchText.test.ts src/desktop/tests/SearchSnippet.test.ts src/desktop/tests/SessionSearchIndexer.test.ts && npx tsc --noEmit`
Expected: PASS (4 + 4 + 4 tests), `tsc` limpio. Si el caso `"İstanbul ß straße"` de longitud falla, comprobar que `foldCodePoint` devuelve el carácter original cuando el plegado cambia de longitud (es el comportamiento previsto).

- [ ] **Step 5: Checkpoint (sin commit)**

---

### Task 11: Consulta `q` en el repositorio y la API

**Files:**
- Modify: `packages/shared/src/dto/library.dto.ts`
- Modify: `backend/src/desktop/infrastructure/sqlite/SqliteLibraryRepository.ts`
- Test: `backend/src/desktop/tests/LibrarySearch.test.ts`, `backend/src/desktop/tests/LibraryRoutes.test.ts` (añadir)

**Interfaces:**
- Consumes: Task 10.
- Produces: `LibraryListQuery.q?: string`; `LibrarySessionItemDto.snippet?: SearchSnippetDto | null` y `matchCount?: number`; `SearchSnippetDto { text: string; ranges: [number, number][] }`; `q` en `LibrarySessionsQuerySchema`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/LibrarySearch.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { insertActionItem, insertMeetingSummary, insertSegment, insertSession, insertSpeaker, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository: búsqueda de texto", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;
  const ids = (q: string, extra: object = {}) =>
    repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, q, ...extra }).items.map((i) => i.id);

  function seed(id: string, content: string, opts: { speaker?: string; occurredAt?: string } = {}) {
    insertSession(db, { id, name: `Sesión ${id}`, occurredAt: opts.occurredAt ?? "2026-11-20T10:00:00.000Z", updatedAt: "2026-11-20T10:00:00.000Z" });
    insertSpeaker(db, { id: `sp-${id}`, sessionId: id, label: opts.speaker ?? "Hablante 1" });
    insertSegment(db, { id: `seg-${id}`, sessionId: id, speakerId: `sp-${id}`, startMs: 0, endMs: 5000, content });
  }

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    seed("a", "Hoy hablamos de la migración de la base de datos", { speaker: "Ana" });
    seed("b", "El presupuesto del trimestre sigue pendiente", { speaker: "Luis", occurredAt: "2026-11-21T10:00:00.000Z" });
    seed("c", "Migración y presupuesto: ambos temas, migración primero", { occurredAt: "2026-11-22T10:00:00.000Z" });
  });
  afterEach(() => db.close());

  it("encuentra sin importar tildes ni mayúsculas y devuelve fragmento con rangos sobre el texto original", () => {
    const { items } = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, q: "MIGRACION" });
    expect(items.map((i) => i.id).sort()).toEqual(["a", "c"]);
    const a = items.find((i) => i.id === "a")!;
    expect(a.snippet).not.toBeNull();
    const [from, to] = a.snippet!.ranges[0]!;
    expect(a.snippet!.text.slice(from, to)).toBe("migración");
  });

  it("exige que aparezcan TODOS los términos (AND)", () => {
    expect(ids("migracion presupuesto")).toEqual(["c"]);
  });

  it("busca también en nombres de hablantes, resúmenes y puntos de acción", () => {
    expect(ids("luis")).toEqual(["b"]);

    insertMeetingSummary(db, { sessionId: "b", executiveSummary: "Se discutió la facturación electrónica." });
    insertActionItem(db, { id: "ai1", sessionId: "a", task: "Enviar la propuesta al cliente" });
    expect(ids("facturacion")).toEqual(["b"]);
    expect(ids("propuesta cliente")).toEqual(["a"]);
  });

  it("ordena por número de coincidencias y luego por fecha", () => {
    // "c" repite "migración" 2 veces; "a" una
    expect(ids("migracion")).toEqual(["c", "a"]);
    const items = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, q: "migracion" }).items;
    expect(items[0]!.matchCount).toBeGreaterThan(items[1]!.matchCount!);
  });

  it("ignora términos de menos de 2 letras (equivale a no buscar) y respeta la paginación y el total", () => {
    expect(ids("a")).toHaveLength(3);
    const page = repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 1, q: "migracion" });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it("los comodines de LIKE se tratan como texto literal", () => {
    seed("d", "Subió un 100% el costo", { occurredAt: "2026-11-23T10:00:00.000Z" });
    seed("e", "Eran 100 pesos", { occurredAt: "2026-11-24T10:00:00.000Z" });
    expect(ids("100%")).toEqual(["d"]);
    expect(ids("100_")).toEqual([]);
  });

  it("reindexa de forma perezosa cuando el contenido cambia", () => {
    expect(ids("renegociacion")).toEqual([]);
    db.prepare("UPDATE transcription_segments SET content = 'Hubo una renegociación del contrato' WHERE id = 'seg-b'").run();
    db.prepare("UPDATE transcription_sessions SET updated_at = '2999-01-01T00:00:00.000Z' WHERE id = 'b'").run();
    expect(ids("renegociacion")).toEqual(["b"]);
  });

  it("solo busca en las sesiones del usuario", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    insertSpeaker(db, { id: "sp-ajena", sessionId: "ajena", label: "X" });
    insertSegment(db, { id: "seg-ajena", sessionId: "ajena", speakerId: "sp-ajena", startMs: 0, endMs: 1000, content: "migración secreta" });
    expect(ids("secreta")).toEqual([]);
  });
});
```

Añadir a `LibraryRoutes.test.ts`:

```ts
  it("GET /library/sessions?q= busca con fragmento y valida la longitud máxima", async () => {
    insertSession(db, { id: "s1", name: "Sesión s1" });
    const { insertSpeaker, insertSegment } = await import("./libraryTestUtils.js");
    insertSpeaker(db, { id: "sp1", sessionId: "s1", label: "Ana" });
    insertSegment(db, { id: "g1", sessionId: "s1", speakerId: "sp1", startMs: 0, endMs: 1000, content: "Hablamos de la migración" });

    const res = (await (await fetch(`${base}/library/sessions?q=migracion`)).json()) as any;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].snippet.text).toContain("migración");
    expect(res.data[0].matchCount).toBe(1);

    expect((await fetch(`${base}/library/sessions?q=${"x".repeat(201)}`)).status).toBe(400);
  });
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/desktop/tests/LibrarySearch.test.ts src/desktop/tests/LibraryRoutes.test.ts`
Expected: FAIL (`q` no se aplica).

- [ ] **Step 3: Implementar**

En `library.dto.ts`: añadir

```ts
export interface SearchSnippetDto {
  text: string;
  /** Pares [inicio, fin) sobre `text` que hay que resaltar. */
  ranges: [number, number][];
}
```

añadir a `LibrarySessionItemDto`: `snippet?: SearchSnippetDto | null;` y `matchCount?: number;`; y a `LibrarySessionsQuerySchema`: `q: z.string().trim().max(200).optional()` (con coma antes).

En `SqliteLibraryRepository.ts`: importar `buildSnippet` (`../../library/searchSnippet.js`), `buildSessionTexts`/`SessionSearchIndexer` (`../../library/SessionSearchIndexer.js`) y `escapeLike`, `parseSearchQuery` (`../../library/searchText.js`). Añadir `q?: string;` a `LibraryListQuery` y reemplazar `listSessions` completo por:

```ts
  public listSessions(query: LibraryListQuery): { items: LibrarySessionItemDto[]; total: number } {
    const where: string[] = ["s.user_id = ?"];
    const whereParams: (string | number)[] = [query.userId];
    let join = "";
    let matchSelect = "";
    const selectParams: string[] = [];

    if (query.source) {
      where.push("s.source = ?");
      whereParams.push(query.source);
    }

    const terms = parseSearchQuery(query.q);
    if (terms.length > 0) {
      new SessionSearchIndexer(this.db).ensureIndexed(query.userId);
      join = "JOIN session_search ss ON ss.session_id = s.id";
      for (const term of terms) {
        const like = `%${escapeLike(term)}%`;
        where.push("(ss.title_text LIKE ? ESCAPE '\\' OR ss.body_text LIKE ? ESCAPE '\\')");
        whereParams.push(like, like);
      }
      const counts = terms.map((t) => {
        selectParams.push(t, t);
        return `((LENGTH(ss.body_text) - LENGTH(REPLACE(ss.body_text, ?, ''))) / ${t.length} + (LENGTH(ss.title_text) - LENGTH(REPLACE(ss.title_text, ?, ''))) / ${t.length})`;
      });
      matchSelect = `, (${counts.join(" + ")}) AS match_count`;
    }

    const whereSql = where.join(" AND ");
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM transcription_sessions s ${join} WHERE ${whereSql}`)
      .get(...whereParams) as { count: number };

    const order = terms.length > 0 ? `match_count DESC, ${OCCURRED_AT} DESC, s.id DESC` : `${OCCURRED_AT} DESC, s.id DESC`;
    const rows = this.db
      .prepare(
        `SELECT s.id, s.original_file_name, s.file_format, s.project_folder_id, s.status, s.duration_seconds,
                s.file_size_bytes, s.audio_expires_at, s.is_audio_purged, s.created_at, s.source,
                ${OCCURRED_AT} AS occurred_at${matchSelect}
         FROM transcription_sessions s ${join}
         WHERE ${whereSql}
         ORDER BY ${order}
         LIMIT ? OFFSET ?`
      )
      .all(...selectParams, ...whereParams, query.limit, (query.page - 1) * query.limit) as any[];

    const items = rows.map((r) => {
      const item = this.toItem(r);
      if (terms.length > 0) {
        item.matchCount = Number(r.match_count);
        const texts = buildSessionTexts(this.db, r.id);
        item.snippet = texts ? buildSnippet(texts.body, terms) ?? buildSnippet(texts.title, terms) : null;
      }
      return item;
    });

    return { items, total: Number(totalRow.count) };
  }
```

(La ruta ya pasa `...query` completo al repositorio, así que `q` llega sin más cambios.)

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd packages/shared && npm run build && cd ../../backend && npx vitest run src/desktop/tests/LibrarySearch.test.ts src/desktop/tests/LibraryRoutes.test.ts src/desktop/tests/LibraryRepository.test.ts && npx tsc --noEmit`
Expected: PASS, `tsc` limpio. Si la comparación `ESCAPE '\'` falla en tu versión de SQLite, comprobar que en el SQL final aparece exactamente `ESCAPE '\'` (en el código JS es `'\\'`).

- [ ] **Step 5: Checkpoint (sin commit)**

---

### Task 12: Buscador en el Historial

**Files:**
- Create: `frontend/src/features/history/searchHelpers.ts`, `frontend/src/features/history/useDebouncedValue.ts`, `frontend/src/features/history/HistorySearchBar.tsx`
- Modify: `frontend/src/features/history/HistoryList.tsx`, `frontend/src/pages/HistoryPage.tsx`
- Test: `frontend/src/tests/searchHelpers.test.ts`

**Interfaces:**
- Consumes: `LibrarySessionItemDto.snippet`.
- Produces: `normalizeQueryInput(raw: string): string | undefined`, `splitHighlight(snippet: { text: string; ranges: [number, number][] }): { text: string; highlight: boolean }[]`, `useDebouncedValue<T>(value: T, delayMs: number): T`; `HistoryList` acepta `query?: string`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/tests/searchHelpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeQueryInput, splitHighlight } from "../features/history/searchHelpers.js";

describe("searchHelpers", () => {
  it("normalizeQueryInput recorta y solo busca con 2 o más letras", () => {
    expect(normalizeQueryInput("  migración ")).toBe("migración");
    expect(normalizeQueryInput("a")).toBeUndefined();
    expect(normalizeQueryInput("   ")).toBeUndefined();
    expect(normalizeQueryInput("")).toBeUndefined();
  });

  it("splitHighlight parte el texto en trozos resaltados y normales", () => {
    expect(splitHighlight({ text: "Hablamos de la migración hoy", ranges: [[15, 24]] })).toEqual([
      { text: "Hablamos de la ", highlight: false },
      { text: "migración", highlight: true },
      { text: " hoy", highlight: false }
    ]);
  });

  it("maneja rangos en los bordes y varios rangos", () => {
    expect(splitHighlight({ text: "abc def", ranges: [[0, 3], [4, 7]] })).toEqual([
      { text: "abc", highlight: true },
      { text: " ", highlight: false },
      { text: "def", highlight: true }
    ]);
  });

  it("sin rangos devuelve un solo trozo y recorta rangos inválidos", () => {
    expect(splitHighlight({ text: "hola", ranges: [] })).toEqual([{ text: "hola", highlight: false }]);
    expect(splitHighlight({ text: "hola", ranges: [[2, 99], [-5, -1], [3, 3]] })).toEqual([
      { text: "ho", highlight: false },
      { text: "la", highlight: true }
    ]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd frontend && npx vitest run src/tests/searchHelpers.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar helpers y componente**

`frontend/src/features/history/searchHelpers.ts`:

```ts
export const MIN_SEARCH_LENGTH = 2;

/** Texto a enviar como `q`, o undefined si es demasiado corto para buscar. */
export function normalizeQueryInput(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : undefined;
}

export interface HighlightPart {
  text: string;
  highlight: boolean;
}

/** Parte un fragmento en trozos normales y resaltados a partir de sus rangos [inicio, fin). Sin HTML. */
export function splitHighlight(snippet: { text: string; ranges: [number, number][] }): HighlightPart[] {
  const { text } = snippet;
  const ranges = snippet.ranges
    .map(([a, b]): [number, number] => [Math.max(0, Math.min(a, text.length)), Math.max(0, Math.min(b, text.length))])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const [a, b] of ranges) {
    if (a < cursor) continue;
    if (a > cursor) parts.push({ text: text.slice(cursor, a), highlight: false });
    parts.push({ text: text.slice(a, b), highlight: true });
    cursor = b;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlight: false });
  return parts.length > 0 ? parts : [{ text, highlight: false }];
}
```

`frontend/src/features/history/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

`frontend/src/features/history/HistorySearchBar.tsx`:

```tsx
import React from "react";
import { IconButton, InputAdornment, TextField } from "@mui/material";
import { Clear as ClearIcon, Search as SearchIcon } from "@mui/icons-material";

interface HistorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const HistorySearchBar: React.FC<HistorySearchBarProps> = ({ value, onChange }) => (
  <TextField
    fullWidth
    size="small"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="Buscar en transcripciones y resúmenes…"
    helperText={value.trim().length === 1 ? "Escribe al menos 2 letras para buscar." : undefined}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <SearchIcon fontSize="small" />
        </InputAdornment>
      ),
      endAdornment: value ? (
        <InputAdornment position="end">
          <IconButton size="small" aria-label="Borrar búsqueda" onClick={() => onChange("")}>
            <ClearIcon fontSize="small" />
          </IconButton>
        </InputAdornment>
      ) : undefined
    }}
  />
);
```

- [ ] **Step 4: Integrar en `HistoryPage.tsx` y `HistoryList.tsx`**

`HistoryPage.tsx`: importar `HistorySearchBar`, `useDebouncedValue`, `normalizeQueryInput`; añadir `const [searchInput, setSearchInput] = useState("");` y `const query = normalizeQueryInput(useDebouncedValue(searchInput, 300));`; mostrar, debajo del encabezado y solo en escritorio, `{isDesktopApp() && (<Box sx={{ mb: 2 }}><HistorySearchBar value={searchInput} onChange={setSearchInput} /></Box>)}`; pasar `query={query}` a `<HistoryList />`.

`HistoryList.tsx` (partiendo del estado tras la Tarea 7):
1. `HistoryListProps` gana `query?: string;` y se desestructura.
2. Importar `useRef`, `splitHighlight` (`./searchHelpers.js`).
3. Añadir `const requestCounter = useRef(0);` y sustituir `fetchHistory` por:

```tsx
  const fetchHistory = async (targetPage: number) => {
    const requestId = ++requestCounter.current;
    setIsLoading(true);
    try {
      const endpoint = isDesktopApp() ? "/desktop/library/sessions" : "/sessions";
      const response = await api.get<any>(endpoint, {
        params: { page: targetPage, limit, ...(query ? { q: query } : {}) }
      });
      // descarta respuestas de una búsqueda anterior que llegan tarde
      if (requestId !== requestCounter.current) return;
      if (response.success && response.data) {
        setSessions(response.data, response.meta.total);
      }
    } catch (err) {
      console.error("Error al cargar historial:", err);
    } finally {
      if (requestId === requestCounter.current) setIsLoading(false);
    }
  };
```

4. Reemplazar el `useEffect` de carga por:

```tsx
  // al cambiar la búsqueda se vuelve a la primera página
  useEffect(() => {
    if (page !== 1) setPage(1);
  }, [query]);

  useEffect(() => {
    fetchHistory(page);
  }, [page, refreshKey, query]);
```

5. Estado vacío: si `query` está definido, mostrar `Sin resultados para «{query}».` en lugar del texto de "no tienes transcripciones".
6. Bajo el texto secundario de cada fila (`ListItemText.secondary`), cuando `sess.snippet` exista, añadir una segunda línea:

```tsx
                  <>
                    <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
                      Fecha: {new Date(sess.occurredAt ?? sess.createdAt).toLocaleDateString()} | Duración:{" "}
                      {sess.durationSeconds ? `${sess.durationSeconds}s` : "N/A"}
                    </Typography>
                    {(sess as any).snippet && (
                      <Typography variant="body2" component="span" sx={{ display: "block", mt: 0.5 }}>
                        {splitHighlight((sess as any).snippet).map((part, i) =>
                          part.highlight ? (
                            <Box key={i} component="mark" sx={{ bgcolor: "warning.light", color: "inherit", borderRadius: 0.5, px: 0.25 }}>
                              {part.text}
                            </Box>
                          ) : (
                            <React.Fragment key={i}>{part.text}</React.Fragment>
                          )
                        )}
                      </Typography>
                    )}
                  </>
```

   (usar este fragmento como valor de `secondary` en lugar del `Typography` actual; el `as any` evita ampliar `TranscriptionSessionDto` con el campo del fragmento; si se prefiere tipado estricto, añadir `snippet?: { text: string; ranges: [number, number][] } | null;` a `TranscriptionSessionDto` en `packages/shared/src/dto/session.dto.ts`, reconstruir `shared` y quitar los `as any`).

- [ ] **Step 5: Ejecutar y verificar**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS (todos + 4 nuevos), `tsc` limpio.

- [ ] **Step 6: Checkpoint F3 (sin commit)**

Verificación manual: en el Historial buscar "migracion" (sin tilde) y comprobar que aparece "migración" resaltada en el fragmento; escribir una sola letra y comprobar el aviso; buscar algo inexistente y comprobar "Sin resultados"; borrar la búsqueda y volver al listado completo.

---

# FASE 4 — Filtros y pendientes

### Task 13: Filtros de fecha, participante y carpeta; lista de participantes

**Files:**
- Modify: `packages/shared/src/dto/library.dto.ts`
- Modify: `backend/src/desktop/infrastructure/sqlite/SqliteLibraryRepository.ts`
- Modify: `backend/src/desktop/http/routes/library.routes.ts`
- Test: `backend/src/desktop/tests/LibraryFilters.test.ts`, `backend/src/desktop/tests/LibraryRoutes.test.ts` (añadir)

**Interfaces:**
- Produces: `LibraryListQuery` gana `from?`, `to?` (instantes ISO), `participant?`, `folderId?`; `LibrarySessionsQuerySchema` los valida; `SqliteLibraryRepository.listParticipants(userId): string[]`; ruta `GET /library/participants` → `{ success, data: string[] }`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/LibraryFilters.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { insertSession, insertSpeaker, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository: filtros", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;
  const ids = (extra: object) => repo.listSessions({ userId: LOCAL_USER_ID, page: 1, limit: 20, ...extra }).items.map((i) => i.id);

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    db.prepare(
      "INSERT INTO project_folders (id, user_id, name, technical_context, created_at, updated_at) VALUES ('f1', ?, 'Proyecto uno', 'ctx', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')"
    ).run(LOCAL_USER_ID);

    insertSession(db, { id: "a", occurredAt: "2026-11-10T12:00:00.000Z", projectFolderId: "f1" });
    insertSpeaker(db, { id: "spa", sessionId: "a", label: "Hablante 1", customName: "Ana García" });
    insertSession(db, { id: "b", source: "BOT", fileFormat: "bot", externalId: "x", occurredAt: "2026-11-15T12:00:00.000Z" });
    insertSpeaker(db, { id: "spb", sessionId: "b", label: "Luis" });
    insertSession(db, { id: "c", createdAt: "2026-11-20T09:00:00.000Z" }); // sin occurred_at: usa created_at
    insertSpeaker(db, { id: "spc", sessionId: "c", label: "Hablante 1" });
  });
  afterEach(() => db.close());

  it("from y to filtran por la fecha de la reunión, con límites inclusivos y created_at como respaldo", () => {
    expect(ids({ from: "2026-11-12T00:00:00.000Z" })).toEqual(["c", "b"]);
    expect(ids({ to: "2026-11-12T23:59:59.999Z" })).toEqual(["a"]);
    expect(ids({ from: "2026-11-10T12:00:00.000Z", to: "2026-11-10T12:00:00.000Z" })).toEqual(["a"]);
    expect(ids({ from: "2026-11-11T00:00:00.000Z", to: "2026-11-16T00:00:00.000Z" })).toEqual(["b"]);
  });

  it("participant coincide por parte del nombre, sin tildes ni mayúsculas, y usa el nombre personalizado", () => {
    expect(ids({ participant: "garcia" })).toEqual(["a"]);
    expect(ids({ participant: "ANA" })).toEqual(["a"]);
    expect(ids({ participant: "lu" })).toEqual(["b"]);
    expect(ids({ participant: "nadie" })).toEqual([]);
  });

  it("folderId filtra por carpeta de proyecto", () => {
    expect(ids({ folderId: "f1" })).toEqual(["a"]);
    expect(ids({ folderId: "otra" })).toEqual([]);
  });

  it("los filtros se combinan entre sí y con source", () => {
    expect(ids({ source: "BOT", participant: "luis" })).toEqual(["b"]);
    expect(ids({ source: "AUDIO", participant: "luis" })).toEqual([]);
    expect(ids({ from: "2026-11-01T00:00:00.000Z", participant: "ana", folderId: "f1" })).toEqual(["a"]);
  });

  it("listParticipants devuelve nombres distintos y ordenados, sin etiquetas genéricas de diarización", () => {
    insertSession(db, { id: "d" });
    insertSpeaker(db, { id: "spd1", sessionId: "d", label: "SPEAKER_00" });
    insertSpeaker(db, { id: "spd2", sessionId: "d", label: "Luis" }); // repetido en otra sesión
    expect(repo.listParticipants(LOCAL_USER_ID)).toEqual(["Ana García", "Luis"]);
  });

  it("listParticipants solo incluye hablantes de sesiones del usuario", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    insertSpeaker(db, { id: "spx", sessionId: "ajena", label: "Zacarías" });
    expect(repo.listParticipants(LOCAL_USER_ID)).not.toContain("Zacarías");
  });
});
```

Añadir a `LibraryRoutes.test.ts`:

```ts
  it("valida from/to como fechas ISO y expone GET /library/participants", async () => {
    expect((await fetch(`${base}/library/sessions?from=ayer`)).status).toBe(400);
    expect((await fetch(`${base}/library/sessions?to=no-es-fecha`)).status).toBe(400);

    insertSession(db, { id: "s1" });
    const { insertSpeaker } = await import("./libraryTestUtils.js");
    insertSpeaker(db, { id: "sp1", sessionId: "s1", label: "Ana" });
    const res = (await (await fetch(`${base}/library/participants`)).json()) as any;
    expect(res).toEqual({ success: true, data: ["Ana"] });
  });
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/desktop/tests/LibraryFilters.test.ts src/desktop/tests/LibraryRoutes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `library.dto.ts`, antes de `LibrarySessionsQuerySchema` añadir `const isoInstant = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha ISO inválida");` y añadir al esquema (con comas): `from: isoInstant.optional(), to: isoInstant.optional(), participant: z.string().trim().max(100).optional(), folderId: z.string().trim().max(100).optional()`.

En `SqliteLibraryRepository.ts`: importar `normalizeSearchText` (`../../library/searchText.js`); añadir a `LibraryListQuery`: `from?: string; to?: string; participant?: string; folderId?: string;`; en `listSessions`, justo tras el bloque de `source` y antes del de búsqueda, insertar:

```ts
    if (query.from) {
      where.push(`${OCCURRED_AT} >= ?`);
      whereParams.push(new Date(query.from).toISOString());
    }
    if (query.to) {
      where.push(`${OCCURRED_AT} <= ?`);
      whereParams.push(new Date(query.to).toISOString());
    }
    if (query.folderId) {
      where.push("s.project_folder_id = ?");
      whereParams.push(query.folderId);
    }
    if (query.participant) {
      const names = this.matchingNames(this.speakerNames(query.userId), query.participant);
      if (names.length === 0) {
        where.push("0 = 1");
      } else {
        where.push(
          `EXISTS (SELECT 1 FROM speakers sp WHERE sp.session_id = s.id AND COALESCE(sp.custom_name, sp.label) IN (${names.map(() => "?").join(", ")}))`
        );
        whereParams.push(...names);
      }
    }
```

y añadir los métodos (los de `matchingNames` y `speakerNames` son reutilizados en la Tarea 14):

```ts
  /** Nombres distintos de hablantes del usuario (personalizado o etiqueta), sin etiquetas genéricas de diarización. */
  public listParticipants(userId: string): string[] {
    return this.speakerNames(userId)
      .filter((name) => !GENERIC_SPEAKER.test(name))
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  private speakerNames(userId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT COALESCE(sp.custom_name, sp.label) AS name
         FROM speakers sp JOIN transcription_sessions s ON s.id = sp.session_id
         WHERE s.user_id = ?`
      )
      .all(userId) as { name: string }[];
    return rows.map((r) => r.name);
  }

  /** Nombres que contienen el texto buscado, sin tildes ni mayúsculas. */
  private matchingNames(names: string[], needle: string): string[] {
    const n = normalizeSearchText(needle.trim());
    if (!n) return [];
    return names.filter((name) => normalizeSearchText(name).includes(n));
  }
```

y fuera de la clase: `const GENERIC_SPEAKER = /^(speaker[_ ]?\d+|hablante \d+|participante( \d+)?)$/i;`

En `library.routes.ts`, antes de `return router;`:

```ts
  router.get("/library/participants", (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: deps.libraryRepository.listParticipants(req.user!.userId) });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd packages/shared && npm run build && cd ../../backend && npx vitest run src/desktop/tests/LibraryFilters.test.ts src/desktop/tests/LibraryRoutes.test.ts src/desktop/tests/LibrarySearch.test.ts src/desktop/tests/LibraryRepository.test.ts && npx tsc --noEmit`
Expected: PASS, `tsc` limpio.

- [ ] **Step 5: Checkpoint (sin commit)**

---

### Task 14: Puntos de acción entre reuniones

**Files:**
- Modify: `packages/shared/src/dto/library.dto.ts`
- Modify: `backend/src/desktop/infrastructure/sqlite/SqliteLibraryRepository.ts`
- Modify: `backend/src/desktop/http/routes/library.routes.ts`
- Test: `backend/src/desktop/tests/LibraryActionItems.test.ts`, `backend/src/desktop/tests/LibraryRoutes.test.ts` (añadir)

**Interfaces:**
- Produces: `ActionItemWithMeetingDto`, `ActionItemsQuerySchema`; `SqliteLibraryRepository.listActionItems(q): { items: ActionItemWithMeetingDto[]; total: number; openTotal: number }`; `listOwners(userId): string[]`; rutas `GET /library/action-items` (meta con `openTotal`) y `GET /library/action-items/owners`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/LibraryActionItems.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openSqliteDatabase } from "../infrastructure/sqlite/db.js";
import { SqliteLibraryRepository } from "../infrastructure/sqlite/SqliteLibraryRepository.js";
import { insertActionItem, insertSession, LOCAL_USER_ID } from "./libraryTestUtils.js";

describe("SqliteLibraryRepository.listActionItems", () => {
  let db: DatabaseSync;
  let repo: SqliteLibraryRepository;
  const list = (extra: object = {}) =>
    repo.listActionItems({ userId: LOCAL_USER_ID, page: 1, limit: 50, status: "open", ...extra });

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteLibraryRepository(db);
    insertSession(db, { id: "viejo", name: "Reunión vieja", source: "BOT", fileFormat: "bot", externalId: "v", occurredAt: "2026-11-10T10:00:00.000Z" });
    insertSession(db, { id: "nuevo", name: "Reunión nueva", source: "BOT", fileFormat: "bot", externalId: "n", occurredAt: "2026-11-20T10:00:00.000Z" });
    insertActionItem(db, { id: "v0", sessionId: "viejo", position: 0, task: "Vieja 1", owner: "Luis" });
    insertActionItem(db, { id: "v1", sessionId: "viejo", position: 1, task: "Vieja 2 hecha", owner: "Ana García", done: true });
    insertActionItem(db, { id: "n0", sessionId: "nuevo", position: 0, task: "Nueva 1", owner: "Ana García" });
    insertActionItem(db, { id: "n1", sessionId: "nuevo", position: 1, task: "Nueva 2", owner: null });
  });
  afterEach(() => db.close());

  it("lista por defecto los pendientes, de la reunión más reciente a la más antigua y por posición", () => {
    const { items, total, openTotal } = list();
    expect(items.map((i) => i.id)).toEqual(["n0", "n1", "v0"]);
    expect(total).toBe(3);
    expect(openTotal).toBe(3);
    expect(items[0]).toMatchObject({ sessionId: "nuevo", sessionTitle: "Reunión nueva", occurredAt: "2026-11-20T10:00:00.000Z", done: false });
  });

  it("filtra por estado: done y all", () => {
    expect(list({ status: "done" }).items.map((i) => i.id)).toEqual(["v1"]);
    // orden: reunión más reciente primero y, dentro de cada una, por posición
    expect(list({ status: "all" }).items.map((i) => i.id)).toEqual(["n0", "n1", "v0", "v1"]);
  });

  it("openTotal cuenta los pendientes del usuario sin importar los filtros", () => {
    expect(list({ status: "done" }).openTotal).toBe(3);
    expect(list({ owner: "luis" }).openTotal).toBe(3);
  });

  it("filtra por responsable (parte del nombre, sin tildes) y por sesión", () => {
    expect(list({ owner: "garcia" }).items.map((i) => i.id)).toEqual(["n0"]);
    expect(list({ owner: "nadie" }).items).toEqual([]);
    expect(list({ sessionId: "viejo" }).items.map((i) => i.id)).toEqual(["v0"]);
  });

  it("pagina con el total sin paginar", () => {
    const p = list({ page: 2, limit: 2 });
    expect(p.items.map((i) => i.id)).toEqual(["v0"]);
    expect(p.total).toBe(3);
  });

  it("listOwners devuelve responsables distintos y ordenados", () => {
    expect(repo.listOwners(LOCAL_USER_ID)).toEqual(["Ana García", "Luis"]);
  });

  it("solo incluye puntos de acción de sesiones del usuario", () => {
    db.prepare("INSERT INTO users (id, email, auth_provider, status, created_at, updated_at) VALUES ('otro', 'o@x.com', 'LOCAL', 'ACTIVE', '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')").run();
    insertSession(db, { id: "ajena", userId: "otro" });
    insertActionItem(db, { id: "x0", sessionId: "ajena", owner: "Zacarías" });
    expect(list().items.map((i) => i.id)).not.toContain("x0");
    expect(repo.listOwners(LOCAL_USER_ID)).not.toContain("Zacarías");
    expect(list().openTotal).toBe(3);
  });
});
```

Añadir a `LibraryRoutes.test.ts`:

```ts
  it("GET /library/action-items lista pendientes con meta.openTotal y valida la consulta; /owners lista responsables", async () => {
    insertSession(db, { id: "s1", name: "Reunión uno", source: "BOT", fileFormat: "bot", externalId: "x" });
    insertActionItem(db, { id: "ai1", sessionId: "s1", owner: "Luis" });
    insertActionItem(db, { id: "ai2", sessionId: "s1", position: 1, owner: "Ana", done: true });

    const open = (await (await fetch(`${base}/library/action-items`)).json()) as any;
    expect(open.data.map((i: any) => i.id)).toEqual(["ai1"]);
    expect(open.meta).toMatchObject({ total: 1, page: 1, limit: 20, openTotal: 1 });

    const all = (await (await fetch(`${base}/library/action-items?status=all&owner=ana`)).json()) as any;
    expect(all.data.map((i: any) => i.id)).toEqual(["ai2"]);

    expect((await fetch(`${base}/library/action-items?status=otro`)).status).toBe(400);

    const owners = (await (await fetch(`${base}/library/action-items/owners`)).json()) as any;
    expect(owners).toEqual({ success: true, data: ["Ana", "Luis"] });
  });
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd backend && npx vitest run src/desktop/tests/LibraryActionItems.test.ts src/desktop/tests/LibraryRoutes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `library.dto.ts`:

```ts
export interface ActionItemWithMeetingDto extends ActionItemDto {
  sessionTitle: string;
  /** Fecha real de la reunión a la que pertenece. */
  occurredAt: string;
}

export const ActionItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["open", "done", "all"]).default("open"),
  owner: z.string().trim().max(100).optional(),
  sessionId: z.string().trim().max(100).optional()
});
export type ActionItemsQuery = z.infer<typeof ActionItemsQuerySchema>;
```

En `SqliteLibraryRepository.ts` (importar `ActionItemWithMeetingDto`, `ActionItemsQuery`), añadir:

```ts
  public listActionItems(
    q: { userId: string; page: number; limit: number; status: "open" | "done" | "all"; owner?: string; sessionId?: string }
  ): { items: ActionItemWithMeetingDto[]; total: number; openTotal: number } {
    const where: string[] = ["s.user_id = ?"];
    const params: (string | number)[] = [q.userId];

    if (q.status === "open") where.push("a.done = 0");
    if (q.status === "done") where.push("a.done = 1");
    if (q.sessionId) {
      where.push("a.session_id = ?");
      params.push(q.sessionId);
    }
    if (q.owner) {
      const names = this.matchingNames(this.listOwners(q.userId), q.owner);
      if (names.length === 0) where.push("0 = 1");
      else {
        where.push(`a.owner IN (${names.map(() => "?").join(", ")})`);
        params.push(...names);
      }
    }

    const whereSql = where.join(" AND ");
    const total = Number(
      (
        this.db
          .prepare(`SELECT COUNT(*) AS count FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id WHERE ${whereSql}`)
          .get(...params) as { count: number }
      ).count
    );
    const openTotal = Number(
      (
        this.db
          .prepare(
            "SELECT COUNT(*) AS count FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id WHERE s.user_id = ? AND a.done = 0"
          )
          .get(q.userId) as { count: number }
      ).count
    );

    const rows = this.db
      .prepare(
        `SELECT a.*, s.original_file_name AS session_title, ${OCCURRED_AT} AS occurred_at
         FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id
         WHERE ${whereSql}
         ORDER BY ${OCCURRED_AT} DESC, s.id DESC, a.position ASC
         LIMIT ? OFFSET ?`
      )
      .all(...params, q.limit, (q.page - 1) * q.limit) as any[];

    const items = rows.map((r) => ({ ...toActionItem(r), sessionTitle: r.session_title, occurredAt: r.occurred_at }));
    return { items, total, openTotal };
  }

  /** Responsables distintos de los puntos de acción del usuario, ordenados. */
  public listOwners(userId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT a.owner AS owner FROM action_items a JOIN transcription_sessions s ON s.id = a.session_id
         WHERE s.user_id = ? AND a.owner IS NOT NULL AND TRIM(a.owner) <> ''`
      )
      .all(userId) as { owner: string }[];
    return rows.map((r) => r.owner).sort((a, b) => a.localeCompare(b, "es"));
  }
```

En `library.routes.ts` (importar `ActionItemsQuerySchema`, `ActionItemsQuery`), antes de `return router;`:

```ts
  router.get(
    "/library/action-items",
    validateQuery(ActionItemsQuerySchema),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = req.query as unknown as ActionItemsQuery;
        const { items, total, openTotal } = deps.libraryRepository.listActionItems({ userId: req.user!.userId, ...query });
        res.json({
          success: true,
          data: items,
          meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit), openTotal }
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get("/library/action-items/owners", (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: deps.libraryRepository.listOwners(req.user!.userId) });
    } catch (err) {
      next(err);
    }
  });
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd packages/shared && npm run build && cd ../../backend && npx vitest run src/desktop/tests && npx tsc --noEmit`
Expected: PASS (todos los tests de `src/desktop/tests`), `tsc` limpio.

- [ ] **Step 5: Checkpoint (sin commit)**

---

### Task 15: Filtros del Historial, página Pendientes y contador

**Files:**
- Create: `frontend/src/features/history/historyFilters.ts`, `frontend/src/features/history/HistoryFiltersBar.tsx`, `frontend/src/features/library/pendingHelpers.ts`, `frontend/src/pages/PendientesPage.tsx`
- Modify: `frontend/src/features/history/HistoryList.tsx`, `frontend/src/pages/HistoryPage.tsx`, `frontend/src/components/AppShell.tsx`, `frontend/src/App.tsx`
- Test: `frontend/src/tests/historyFilters.test.ts`, `frontend/src/tests/pendingHelpers.test.ts`

**Interfaces:**
- Consumes: `ActionItemWithMeetingDto`; endpoints `GET /desktop/library/participants`, `GET /desktop/library/action-items`, `GET /desktop/library/action-items/owners`, `PATCH /desktop/library/action-items/:id`, `GET /project-folders`.
- Produces: `HistoryFilters`, `EMPTY_FILTERS`, `hasActiveFilters(f)`, `buildLibraryParams(filters, query, page, limit)`, `groupBySession(items)`; `Page` gana `"pendientes"`.

- [ ] **Step 1: Escribir los tests que fallan**

`frontend/src/tests/historyFilters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildLibraryParams, EMPTY_FILTERS, hasActiveFilters } from "../features/history/historyFilters.js";

describe("historyFilters", () => {
  it("sin filtros ni búsqueda solo manda page y limit", () => {
    expect(buildLibraryParams(EMPTY_FILTERS, undefined, 2, 20)).toEqual({ page: 2, limit: 20 });
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("manda solo los filtros con valor y la búsqueda", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, source: "BOT", participant: "Ana", folderId: "f1" }, "migracion", 1, 20);
    expect(params).toEqual({ page: 1, limit: 20, q: "migracion", source: "BOT", participant: "Ana", folderId: "f1" });
  });

  it("convierte las fechas (día local) en instantes ISO: desde = inicio del día, hasta = fin del día", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, from: "2026-11-10", to: "2026-11-12" }, undefined, 1, 20);
    expect(params["from"]).toBe(new Date(2026, 10, 10, 0, 0, 0, 0).toISOString());
    expect(params["to"]).toBe(new Date(2026, 10, 12, 23, 59, 59, 999).toISOString());
  });

  it("ignora fechas mal formadas y detecta filtros activos", () => {
    const params = buildLibraryParams({ ...EMPTY_FILTERS, from: "10/11/2026", to: "" }, undefined, 1, 20);
    expect(params).toEqual({ page: 1, limit: 20 });
    expect(hasActiveFilters({ ...EMPTY_FILTERS, from: "2026-11-10" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, source: "AUDIO" })).toBe(true);
  });
});
```

`frontend/src/tests/pendingHelpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupBySession } from "../features/library/pendingHelpers.js";
import type { ActionItemWithMeetingDto } from "@audio-to-text/shared";

const item = (id: string, sessionId: string, title: string, occurredAt: string): ActionItemWithMeetingDto => ({
  id, sessionId, task: `Tarea ${id}`, owner: null, dueDate: null, evidence: "cita", done: false, doneAt: null,
  sessionTitle: title, occurredAt
});

describe("groupBySession", () => {
  it("agrupa por reunión conservando el orden de aparición", () => {
    const groups = groupBySession([
      item("a", "s2", "Reunión nueva", "2026-11-20T10:00:00.000Z"),
      item("b", "s2", "Reunión nueva", "2026-11-20T10:00:00.000Z"),
      item("c", "s1", "Reunión vieja", "2026-11-10T10:00:00.000Z")
    ]);
    expect(groups.map((g) => [g.sessionId, g.sessionTitle, g.items.map((i) => i.id)])).toEqual([
      ["s2", "Reunión nueva", ["a", "b"]],
      ["s1", "Reunión vieja", ["c"]]
    ]);
    expect(groups[0]!.occurredAt).toBe("2026-11-20T10:00:00.000Z");
  });

  it("sin elementos devuelve una lista vacía", () => {
    expect(groupBySession([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que fallan**

Run: `cd frontend && npx vitest run src/tests/historyFilters.test.ts src/tests/pendingHelpers.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar los helpers**

`frontend/src/features/history/historyFilters.ts`:

```ts
export interface HistoryFilters {
  source: "ALL" | "AUDIO" | "BOT";
  /** yyyy-mm-dd (día local) o "" */
  from: string;
  to: string;
  participant: string;
  folderId: string;
}

export const EMPTY_FILTERS: HistoryFilters = { source: "ALL", from: "", to: "", participant: "", folderId: "" };

export function hasActiveFilters(f: HistoryFilters): boolean {
  return f.source !== "ALL" || Boolean(f.from || f.to || f.participant || f.folderId);
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayToInstant(day: string, endOfDay: boolean): string | undefined {
  const m = DAY.exec(day);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = endOfDay ? new Date(y, mo - 1, d, 23, 59, 59, 999) : new Date(y, mo - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Parámetros de `GET /desktop/library/sessions`: solo los filtros con valor. Los días locales pasan a instantes ISO. */
export function buildLibraryParams(
  filters: HistoryFilters,
  query: string | undefined,
  page: number,
  limit: number
): Record<string, string | number> {
  const params: Record<string, string | number> = { page, limit };
  if (query) params["q"] = query;
  if (filters.source !== "ALL") params["source"] = filters.source;
  const from = dayToInstant(filters.from, false);
  const to = dayToInstant(filters.to, true);
  if (from) params["from"] = from;
  if (to) params["to"] = to;
  if (filters.participant) params["participant"] = filters.participant;
  if (filters.folderId) params["folderId"] = filters.folderId;
  return params;
}
```

`frontend/src/features/library/pendingHelpers.ts`:

```ts
import type { ActionItemWithMeetingDto } from "@audio-to-text/shared";

export interface PendingGroup {
  sessionId: string;
  sessionTitle: string;
  occurredAt: string;
  items: ActionItemWithMeetingDto[];
}

/** Agrupa los puntos de acción por reunión conservando el orden de aparición. */
export function groupBySession(items: ActionItemWithMeetingDto[]): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const item of items) {
    let group = groups.get(item.sessionId);
    if (!group) {
      group = { sessionId: item.sessionId, sessionTitle: item.sessionTitle, occurredAt: item.occurredAt, items: [] };
      groups.set(item.sessionId, group);
    }
    group.items.push(item);
  }
  return Array.from(groups.values());
}
```

- [ ] **Step 4: Barra de filtros y su integración en el Historial**

`frontend/src/features/history/HistoryFiltersBar.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField } from "@mui/material";
import { api } from "../../lib/api.js";
import { EMPTY_FILTERS, hasActiveFilters, type HistoryFilters } from "./historyFilters.js";

interface HistoryFiltersBarProps {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
}

export const HistoryFiltersBar: React.FC<HistoryFiltersBarProps> = ({ filters, onChange }) => {
  const [participants, setParticipants] = useState<string[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api
      .get<{ success: boolean; data: string[] }>("/desktop/library/participants")
      .then((res) => res.success && setParticipants(res.data))
      .catch(() => {});
    api
      .get<{ success: boolean; data: { id: string; name: string }[] }>("/project-folders")
      .then((res) => res.success && Array.isArray(res.data) && setFolders(res.data.map((f) => ({ id: f.id, name: f.name }))))
      .catch(() => {});
  }, []);

  const set = (patch: Partial<HistoryFilters>) => onChange({ ...filters, ...patch });

  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 2 }}>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel id="filtro-origen">Origen</InputLabel>
        <Select labelId="filtro-origen" label="Origen" value={filters.source} onChange={(e) => set({ source: e.target.value as HistoryFilters["source"] })}>
          <MenuItem value="ALL">Todos</MenuItem>
          <MenuItem value="AUDIO">Audio</MenuItem>
          <MenuItem value="BOT">Bot</MenuItem>
        </Select>
      </FormControl>

      <TextField size="small" type="date" label="Desde" InputLabelProps={{ shrink: true }} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
      <TextField size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={filters.to} onChange={(e) => set({ to: e.target.value })} />

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="filtro-participante">Participante</InputLabel>
        <Select labelId="filtro-participante" label="Participante" value={filters.participant} onChange={(e) => set({ participant: e.target.value })}>
          <MenuItem value="">Todos</MenuItem>
          {participants.map((p) => (
            <MenuItem key={p} value={p}>
              {p}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {folders.length > 0 && (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="filtro-carpeta">Carpeta</InputLabel>
          <Select labelId="filtro-carpeta" label="Carpeta" value={filters.folderId} onChange={(e) => set({ folderId: e.target.value })}>
            <MenuItem value="">Todas</MenuItem>
            {folders.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {hasActiveFilters(filters) && (
        <Button size="small" onClick={() => onChange(EMPTY_FILTERS)}>
          Limpiar filtros
        </Button>
      )}
    </Box>
  );
};
```

Antes de dar por buena la barra, abrir `frontend/src/features/projectFolders/` y comprobar la forma real de la respuesta de `GET /project-folders` (un arreglo en `data` con `id` y `name`); si difiere, ajustar solo el `.then` del selector de carpeta.

`HistoryPage.tsx`: importar `EMPTY_FILTERS`, `HistoryFilters` y `HistoryFiltersBar`; añadir `const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS);`; mostrar, bajo el buscador y solo en escritorio, `<HistoryFiltersBar filters={filters} onChange={setFilters} />`; pasar `filters={filters}` a `<HistoryList />`.

`HistoryList.tsx`: `HistoryListProps` gana `filters?: HistoryFilters;` (valor por defecto `EMPTY_FILTERS`); importar `buildLibraryParams`, `EMPTY_FILTERS`, `HistoryFilters`; en `fetchHistory` reemplazar los `params` por `params: isDesktopApp() ? buildLibraryParams(filters, query, targetPage, limit) : { page: targetPage, limit }`; los efectos pasan a depender de la clave `const filtersKey = JSON.stringify(filters);`: el de "volver a la primera página" con `[query, filtersKey]` y el de carga con `[page, refreshKey, query, filtersKey]`. El estado vacío con filtros activos muestra "No hay resultados con estos filtros." (usar `hasActiveFilters(filters) || query`).

- [ ] **Step 5: Página Pendientes, navegación y contador**

`frontend/src/pages/PendientesPage.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from "react";
import { Box, Checkbox, Chip, CircularProgress, FormControl, InputLabel, Link, MenuItem, Paper, Select, Typography } from "@mui/material";
import type { ActionItemWithMeetingDto } from "@audio-to-text/shared";
import { api } from "../lib/api.js";
import { groupBySession } from "../features/library/pendingHelpers.js";

interface PendientesPageProps {
  onSelectSession: (sessionId: string) => void;
}

type Status = "open" | "done" | "all";

export const PendientesPage: React.FC<PendientesPageProps> = ({ onSelectSession }) => {
  const [status, setStatus] = useState<Status>("open");
  const [owner, setOwner] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [items, setItems] = useState<ActionItemWithMeetingDto[]>([]);
  const [openTotal, setOpenTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<any>("/desktop/library/action-items", {
        params: { status, limit: 100, ...(owner ? { owner } : {}) }
      });
      if (res.success) {
        setItems(res.data);
        setOpenTotal(res.meta?.openTotal ?? 0);
      }
    } catch (err) {
      console.error("Error al cargar los pendientes:", err);
    } finally {
      setLoading(false);
    }
  }, [status, owner]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get<{ success: boolean; data: string[] }>("/desktop/library/action-items/owners")
      .then((res) => res.success && setOwners(res.data))
      .catch(() => {});
  }, []);

  const toggle = async (item: ActionItemWithMeetingDto, done: boolean) => {
    try {
      await api.patch(`/desktop/library/action-items/${item.id}`, { done });
      await load();
    } catch (err) {
      console.error("Error al actualizar el punto de acción:", err);
    }
  };

  const groups = groupBySession(items);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Pendientes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Puntos de acción de tus reuniones. {openTotal === 1 ? "Tienes 1 pendiente." : `Tienes ${openTotal} pendientes.`}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="pend-estado">Estado</InputLabel>
          <Select labelId="pend-estado" label="Estado" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <MenuItem value="open">Pendientes</MenuItem>
            <MenuItem value="done">Hechas</MenuItem>
            <MenuItem value="all">Todas</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="pend-responsable">Responsable</InputLabel>
          <Select labelId="pend-responsable" label="Responsable" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <MenuItem value="">Todos</MenuItem>
            {owners.map((o) => (
              <MenuItem key={o} value={o}>
                {o}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {loading && items.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : groups.length === 0 ? (
        <Typography variant="body1" color="text.secondary" sx={{ textAlign: "center", py: 6 }}>
          {status === "open" ? "No tienes puntos de acción pendientes." : "No hay puntos de acción con este filtro."}
        </Typography>
      ) : (
        groups.map((group) => (
          <Paper key={group.sessionId} sx={{ p: 2.5, mb: 2, borderRadius: 2 }}>
            <Link component="button" type="button" underline="hover" onClick={() => onSelectSession(group.sessionId)} sx={{ fontWeight: 700, textAlign: "left" }}>
              {group.sessionTitle}
            </Link>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              {new Date(group.occurredAt).toLocaleDateString()}
            </Typography>
            {group.items.map((item) => (
              <Box key={item.id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, mb: 1 }}>
                <Checkbox
                  checked={item.done}
                  onChange={(e) => toggle(item, e.target.checked)}
                  inputProps={{ "aria-label": `Marcar como hecha: ${item.task}` }}
                  sx={{ p: 0.5 }}
                />
                <Box>
                  <Typography variant="body1" sx={{ textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>
                    {item.task}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.25 }}>
                    {item.owner && <Chip size="small" label={`Responsable: ${item.owner}`} />}
                    {item.dueDate && <Chip size="small" variant="outlined" label={`Fecha: ${item.dueDate}`} />}
                  </Box>
                </Box>
              </Box>
            ))}
          </Paper>
        ))
      )}
    </Box>
  );
};
```

`App.tsx`: ampliar `type Page = ... | "pendientes";`; importar `PendientesPage`; dentro del `ErrorBoundary` de páginas añadir `{currentPage === "pendientes" && <PendientesPage onSelectSession={handleSelectSession} />}`.

`AppShell.tsx`: importar `Badge` de `@mui/material`; ampliar los dos tipos `"home" | "history" | "session" | "login" | "settings"` con `| "pendientes"`; añadir el estado y el efecto del contador:

```tsx
  const [openCount, setOpenCount] = useState(0);

  // Contador de pendientes del menú: se refresca al cambiar de pantalla
  useEffect(() => {
    if (!isDesktop) return;
    api
      .get<any>("/desktop/library/action-items", { params: { status: "open", limit: 1 } })
      .then((res) => {
        if (res.success) setOpenCount(res.meta?.openTotal ?? 0);
      })
      .catch(() => {});
  }, [isDesktop, currentPage]);
```

y, tras el botón "Historial" (dentro del bloque `isAuthenticated`), añadir el botón:

```tsx
              {isDesktop && (
                <Button
                  color={currentPage === "pendientes" ? "primary" : "inherit"}
                  onClick={() => onNavigate("pendientes")}
                  size="small"
                >
                  <Badge badgeContent={openCount} color="error" max={99} sx={{ "& .MuiBadge-badge": { right: -14, top: 2 } }}>
                    Pendientes
                  </Badge>
                </Button>
              )}
```

(Colocarlo fuera del `isAuthenticated`, ya que en escritorio la sesión local siempre está autenticada; comprobar que `isAuthenticated` es `true` en modo escritorio, y si no, dejarlo en el mismo bloque que "Historial".)

- [ ] **Step 6: Ejecutar y verificar**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: PASS (todos + 6 nuevos), `tsc` limpio.

- [ ] **Step 7: Checkpoint F4 (sin commit)**

Verificación manual: filtrar el Historial por origen Bot, por fechas y por participante; combinar con la búsqueda; abrir Pendientes, marcar una casilla y comprobar que baja el contador del menú al cambiar de pantalla; abrir una reunión desde su título.

---

# CIERRE

### Task 16: Verificación final e informe

**Files:** ninguno nuevo.

- [ ] **Step 1: Suites completas**

Run (cada una desde su carpeta):
- `cd packages/shared && npm run build` → sin errores.
- `cd backend && npx tsc --noEmit && npx vitest run` → todo en verde (388 originales + los nuevos de biblioteca).
- `cd frontend && npx tsc --noEmit && npx vitest run` → todo en verde (69 + nuevos).
- `cd algorithm-manager-bot && npx tsc --noEmit && npx vitest run` → todo en verde (44 + 4).

- [ ] **Step 2: Compilación de la app de escritorio**

Run: `cd desktop && npm run predist`
Expected: compila `shared`, el frontend y `main.cjs` sin errores. Comprobar que `desktop/dist/main.cjs` contiene `library/import` (p. ej. `grep -c "library/import" desktop/dist/main.cjs` ≥ 1) y que `frontend/dist/assets/index-*.js` contiene `desktop/library/sessions`.

- [ ] **Step 3: Recorrido manual de extremo a extremo**

1. `npm run bot -- --file <txt con líneas "Nombre: texto">` → aparece `output/reunion_<id>.json` y no queda ningún `.tmp`.
2. Abrir la app (modo desarrollo o instalador regenerado con `npm run dist:win` en `desktop/`), pulsar "Importar reuniones del bot" → mensaje con el recuento; reimportar → "ya estaba importada".
3. La reunión aparece con etiqueta Bot, fecha real y sin reproductor; su primera pestaña es "Resumen de reunión".
4. Marcar un punto de acción, recargar la página: sigue marcado. Pulsar una cita y un capítulo: salta a la transcripción.
5. Buscar por una palabra de la reunión sin tilde: aparece con el fragmento resaltado.
6. Filtrar por origen, fechas y participante; abrir Pendientes y comprobar el contador del menú.
7. Borrar la sesión importada desde el Historial y reimportar: vuelve a crearse (los archivos de origen no se tocaron).

- [ ] **Step 4: Informe de archivos para el usuario (sin commits)**

Ejecutar `git status --short` y entregar al usuario la lista agrupada por área (shared, bot, backend, frontend, docs) y destacar los archivos ⚠ que mezclan su trabajo previo (`packages/shared/src/index.ts`, `botSettings.dto.ts`, `bot.routes.ts`, `desktop.routes.ts`, `MeetingBotSettingsSection.tsx`). Preguntar cómo quiere commitear (una fase por commit o todo junto). No commitear nada sin esa respuesta.
