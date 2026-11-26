# Control del bot desde la app de escritorio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entrar a una llamada de Meet o Teams con el bot desde la app de escritorio (pegar enlace, ver estado, terminar), con login de Google verificable, lista de sitios permitidos, fin automático, notificaciones y bandeja.

**Architecture:** El motor del bot (`algorithm-manager-bot`) reporta estados y errores reales mediante callbacks. El backend de escritorio define un puerto `BotEngine` y un `BotSessionService` (máquina de estados, una sesión activa) que no importa Electron ni el paquete del bot. `desktop/src` (capa de composición) implementa el puerto con `AutonomousMeetingBotService` y conecta notificaciones y bandeja. La interfaz consulta `/api/desktop/bot/session` cada 2 s.

**Tech Stack:** TypeScript (NodeNext), Express, Vitest, puppeteer-core 25, Electron 45, React + MUI, Zod.

**Spec:** `docs/superpowers/specs/2026-11-25-bot-desktop-control-design.md`.

## Global Constraints

- Responder, comentar y escribir textos de interfaz en español.
- El backend (`backend/src`) NO importa `electron` ni `@audio-to-text/algorithm-manager-bot`: tiene `rootDir: ./src`. Solo `desktop/src` importa el código del bot (rutas relativas `../../algorithm-manager-bot/src/...`).
- Ningún archivo supera 500 líneas.
- Constantes de fin automático (spec 3.5): el bot sale tras 2 minutos a solas (`ALONE_LIMIT_MS = 120_000`); espera de admisión máxima de 10 minutos (`ADMISSION_LIMIT_MS = 600_000`); el driver comprueba cada 5 s (`END_POLL_MS = 5000`); la interfaz consulta la sesión cada 2 s.
- Dominios permitidos por defecto: `meet.google.com`, `teams.microsoft.com`, `teams.live.com`. Plataformas con driver: `GOOGLE_MEET`, `MICROSOFT_TEAMS` (Zoom no tiene driver y se rechaza).
- Datos del bot en `<userData>/bot/`: `profile/`, `settings.json`, `output/`.
- El CLI (`npm run bot`, `npm run bot:login`) debe seguir funcionando sin cambios de uso.
- No hacer commits durante la ejecución: el usuario decide al final cómo commitear. Nunca `git add -A`, stash, checkout ni reset.
- Archivos con cambios previos del usuario (solo adiciones puntuales): `packages/shared/src/index.ts`, `packages/shared/src/dto/botSettings.dto.ts`, `backend/src/interfaces/http/routes/bot.routes.ts`, `backend/src/desktop/http/desktop.routes.ts`, `frontend/src/pages/settings/components/MeetingBotSettingsSection.tsx`.
- Finales de línea: antes de editar un archivo existente compara `tr -cd '\r' < F | wc -c` con `wc -l < F` y conserva su estilo (CRLF en `composition-root.desktop.ts`, `server.ts`, `migrations.ts`, `SessionPage.tsx`, `MeetingAnalysisPanel.tsx`; el resto suele ser LF). Acentos en UTF-8.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/shared/src/dto/botSettings.dto.ts` (mod) | Tipos de config con lista de permitidos |
| `packages/shared/src/dto/botSession.dto.ts` (nuevo) | Estado de sesión, login, petición de entrada |
| `algorithm-manager-bot/src/domain/models/LiveSession.ts` (nuevo) | `LiveState`, `BotJoinError`, callbacks |
| `algorithm-manager-bot/src/domain/services/MeetingEndDetector.ts` (nuevo) | Detección pura de fin de reunión |
| `algorithm-manager-bot/src/infrastructure/connectors/live/LiveRoomMonitor.ts` (nuevo) | Espera de admisión y vigilancia de fin, sobre un `RoomProbe` |
| `algorithm-manager-bot/src/infrastructure/connectors/live/PuppeteerRoomProbe.ts` (nuevo) | `RoomProbe` real con puppeteer |
| `.../live/GoogleMeetLiveDriver.ts`, `TeamsLiveDriver.ts`, `BrowserLauncher.ts` (mod) | Estados reales, errores, perfil inyectado |
| `.../connectors/HeadlessMeetingBotConnector.ts` (mod) | Propaga errores; drivers inyectables |
| `.../application/AutonomousMeetingBotService.ts`, `cli.ts` (mod) | Ajustes inyectados, `abort`, `skipConnection` |
| `backend/src/desktop/bot/BotPaths.ts`, `BotSettingsStore.ts` (nuevos) | Rutas y ajustes en userData |
| `backend/src/desktop/bot/meetingUrlPolicy.ts` (nuevo) | Validación de enlace y lista de permitidos |
| `backend/src/desktop/bot/BotLoginService.ts` (nuevo) | Abrir login, verificar, desvincular |
| `backend/src/desktop/bot/BotSessionService.ts` (nuevo) | Máquina de estados y puerto `BotEngine` |
| `backend/src/desktop/bot/botNotifications.ts` (nuevo) | Avisos y texto de bandeja (puros) |
| `backend/src/desktop/http/routes/bot.routes.ts` (nuevo) | API `/api/desktop/bot/*` |
| `backend/src/desktop/server.ts`, `composition-root.desktop.ts`, `http/desktop.routes.ts` (mod) | Cableado |
| `desktop/src/botEngine.ts`, `desktop/src/botTray.ts`, `desktop/src/main.ts` (mod/nuevos) | Motor real, bandeja, notificaciones |
| `frontend/src/features/bot/*`, `MeetingBotSettingsSection.tsx` (mod) | Interfaz |

---

### Task 1: Tipos compartidos

**Files:**
- Modify: `packages/shared/src/dto/botSettings.dto.ts`
- Create: `packages/shared/src/dto/botSession.dto.ts`
- Modify: `packages/shared/src/index.ts` (solo añadir un export)

**Interfaces:**
- Produces: `BotPlatform`, `BOT_PLATFORMS`, `DEFAULT_BOT_ALLOWED_DOMAINS`, campos `botAllowedPlatforms?`/`botAllowedDomains?` en `MeetingBotConfigDto`, `loginChecked?` en `MeetingBotStatusDto`, `BOT_SESSION_STATES`, `BotSessionState`, `BotSessionDto`, `BotSessionResultDto`, `BotLoginCheckDto`, `BotJoinRequestDto`.

- [ ] **Step 1: Ampliar `botSettings.dto.ts`**

Añadir al principio del archivo (antes de `MeetingBotConfigDto`):

```ts
export type BotPlatform = "GOOGLE_MEET" | "MICROSOFT_TEAMS";

/** Plataformas con driver de entrada automática. Zoom no tiene driver. */
export const BOT_PLATFORMS: readonly BotPlatform[] = ["GOOGLE_MEET", "MICROSOFT_TEAMS"];

export const DEFAULT_BOT_ALLOWED_DOMAINS: readonly string[] = [
  "meet.google.com",
  "teams.microsoft.com",
  "teams.live.com"
];
```

Dentro de `MeetingBotConfigDto`, tras `botOutputDir?`, añadir:

```ts
  /** Plataformas a las que el bot puede entrar; ausente = todas las soportadas. */
  botAllowedPlatforms?: BotPlatform[];
  /** Dominios permitidos (host exacto o subdominio); ausente = DEFAULT_BOT_ALLOWED_DOMAINS. */
  botAllowedDomains?: string[];
```

Dentro de `MeetingBotStatusDto`, tras `isMeetingActive: boolean;`, añadir `  /** true si ya se verificó el login en esta ejecución de la app. */\n  loginChecked?: boolean;`.

- [ ] **Step 2: Crear `botSession.dto.ts`**

```ts
import type { BotPlatform } from "./botSettings.dto.js";

export const BOT_SESSION_STATES = [
  "IDLE",
  "OPENING",
  "NEEDS_LOGIN",
  "WAITING_ADMISSION",
  "LISTENING",
  "ENDING",
  "ENDED",
  "FAILED"
] as const;

export type BotSessionState = (typeof BOT_SESSION_STATES)[number];

export interface BotSessionResultDto {
  /** Reuniones nuevas importadas a la biblioteca. */
  imported: number;
  /** Intervenciones captadas. */
  utterances: number;
  /** Archivo reunion_*.json escrito, o null si no hubo transcripción. */
  deliveryFile: string | null;
  /** Por qué terminó, en español. */
  reason: string;
}

export interface BotSessionDto {
  state: BotSessionState;
  message: string;
  meetingUrl: string | null;
  platform: BotPlatform | null;
  startedAt: string | null;
  error: string | null;
  result: BotSessionResultDto | null;
}

export interface BotLoginCheckDto {
  linked: boolean;
  email: string | null;
  message: string;
}

export interface BotJoinRequestDto {
  url: string;
}
```

- [ ] **Step 3: Exportar desde `index.ts`**

Añadir una sola línea junto a los otros exports de DTOs: `export * from "./dto/botSession.dto.js";` (comprueba cómo exporta `botSettings.dto` y sigue el mismo estilo).

- [ ] **Step 4: Compilar**

Run: `cd packages/shared && npm run build`
Expected: sin errores.

---

### Task 2: Detector de fin de reunión y tipos del motor (bot)

**Files:**
- Create: `algorithm-manager-bot/src/domain/models/LiveSession.ts`
- Create: `algorithm-manager-bot/src/domain/services/MeetingEndDetector.ts`
- Test: `algorithm-manager-bot/src/tests/MeetingEndDetector.test.ts`

**Interfaces:**
- Produces: `LiveState`, `LiveStatusCallback`, `BotJoinError` (con `code`), `EndReason`, `RoomSnapshot`, `MeetingEndDetector.evaluate(snapshot)`, constantes `ALONE_LIMIT_MS`, `ADMISSION_LIMIT_MS`, `END_POLL_MS`.

- [ ] **Step 1: Escribir el test que falla**

`algorithm-manager-bot/src/tests/MeetingEndDetector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MeetingEndDetector,
  ALONE_LIMIT_MS,
  type RoomSnapshot
} from "../domain/services/MeetingEndDetector.js";

const base: RoomSnapshot = {
  browserOpen: true,
  urlStillInRoom: true,
  pageText: "Reunión en curso",
  participantCount: 3,
  nowMs: 0
};

describe("MeetingEndDetector", () => {
  it("no termina mientras todo sigue normal", () => {
    expect(new MeetingEndDetector().evaluate(base)).toBeNull();
  });

  it("termina si el navegador se cerró", () => {
    expect(new MeetingEndDetector().evaluate({ ...base, browserOpen: false })).toBe("BROWSER_CLOSED");
  });

  it("termina si la URL salió de la sala", () => {
    expect(new MeetingEndDetector().evaluate({ ...base, urlStillInRoom: false })).toBe("LEFT_ROOM");
  });

  it.each([
    "Saliste de la llamada",
    "Has salido de la reunión",
    "La reunión ha terminado",
    "You've left the meeting",
    "The meeting has ended",
    "Te han expulsado de la llamada"
  ])("reconoce el texto de fin: %s", (pageText) => {
    expect(new MeetingEndDetector().evaluate({ ...base, pageText })).toBe("MEETING_ENDED_TEXT");
  });

  it("solo termina por soledad tras ALONE_LIMIT_MS seguidos", () => {
    const d = new MeetingEndDetector();
    expect(d.evaluate({ ...base, participantCount: 1, nowMs: 1000 })).toBeNull();
    expect(d.evaluate({ ...base, participantCount: 1, nowMs: 1000 + ALONE_LIMIT_MS - 1 })).toBeNull();
    expect(d.evaluate({ ...base, participantCount: 1, nowMs: 1000 + ALONE_LIMIT_MS })).toBe("ALONE_TIMEOUT");
  });

  it("si alguien vuelve, el contador de soledad se reinicia", () => {
    const d = new MeetingEndDetector();
    d.evaluate({ ...base, participantCount: 1, nowMs: 0 });
    d.evaluate({ ...base, participantCount: 2, nowMs: ALONE_LIMIT_MS - 1 });
    expect(d.evaluate({ ...base, participantCount: 1, nowMs: ALONE_LIMIT_MS + 5 })).toBeNull();
  });

  it("si no se puede leer el conteo (null) nunca termina por soledad", () => {
    const d = new MeetingEndDetector();
    expect(d.evaluate({ ...base, participantCount: null, nowMs: 0 })).toBeNull();
    expect(d.evaluate({ ...base, participantCount: null, nowMs: ALONE_LIMIT_MS * 10 })).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd algorithm-manager-bot && npx vitest run src/tests/MeetingEndDetector.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Step 3: Crear `LiveSession.ts`**

```ts
export type LiveState = "OPENING" | "NEEDS_LOGIN" | "WAITING_ADMISSION" | "LISTENING";

export type LiveStatusCallback = (state: LiveState, message: string) => void;

export type BotJoinErrorCode = "NEEDS_LOGIN" | "ADMISSION_TIMEOUT" | "ROOM_UNAVAILABLE" | "BROWSER_FAILED";

/** Fallo real al entrar a la sala; el mensaje está en español y se muestra tal cual al usuario. */
export class BotJoinError extends Error {
  constructor(
    public readonly code: BotJoinErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BotJoinError";
  }
}
```

- [ ] **Step 4: Crear `MeetingEndDetector.ts`**

```ts
export type EndReason = "LEFT_ROOM" | "MEETING_ENDED_TEXT" | "BROWSER_CLOSED" | "ALONE_TIMEOUT";

export interface RoomSnapshot {
  browserOpen: boolean;
  urlStillInRoom: boolean;
  pageText: string;
  /** null si no se pudo leer el número de participantes. */
  participantCount: number | null;
  nowMs: number;
}

/** El bot sale si lleva solo en la sala más de 2 minutos. */
export const ALONE_LIMIT_MS = 120_000;
/** Máxima espera para que el anfitrión admita al bot. */
export const ADMISSION_LIMIT_MS = 600_000;
/** Cada cuánto comprueba el driver si la reunión terminó. */
export const END_POLL_MS = 5000;

const END_TEXT: RegExp[] = [
  /saliste de la llamada/i,
  /has salido de la (llamada|reuni[oó]n)/i,
  /la reuni[oó]n ha terminado/i,
  /el anfitri[oó]n (ha )?(finaliz[oó]|termin[oó])/i,
  /you(?:'|’)?ve left the (call|meeting)/i,
  /the meeting has ended/i,
  /you were removed/i,
  /te han (expulsado|eliminado)/i,
  /has sido eliminado/i
];

export class MeetingEndDetector {
  private aloneSince: number | null = null;

  public evaluate(s: RoomSnapshot): EndReason | null {
    if (!s.browserOpen) return "BROWSER_CLOSED";
    if (!s.urlStillInRoom) return "LEFT_ROOM";
    if (END_TEXT.some((r) => r.test(s.pageText))) return "MEETING_ENDED_TEXT";

    if (s.participantCount !== null && s.participantCount <= 1) {
      if (this.aloneSince === null) this.aloneSince = s.nowMs;
      if (s.nowMs - this.aloneSince >= ALONE_LIMIT_MS) return "ALONE_TIMEOUT";
    } else {
      this.aloneSince = null;
    }
    return null;
  }
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cd algorithm-manager-bot && npx vitest run src/tests/MeetingEndDetector.test.ts && npx tsc --noEmit`
Expected: 12 tests PASS, tsc limpio.

---

### Task 3: LiveRoomMonitor y sonda de puppeteer (bot)

**Files:**
- Create: `algorithm-manager-bot/src/infrastructure/connectors/live/LiveRoomMonitor.ts`
- Create: `algorithm-manager-bot/src/infrastructure/connectors/live/PuppeteerRoomProbe.ts`
- Test: `algorithm-manager-bot/src/tests/LiveRoomMonitor.test.ts`

**Interfaces:**
- Consumes: `MeetingEndDetector`, `EndReason`, `BotJoinError`, `END_POLL_MS`.
- Produces: `RoomProbe` (interface), `LiveRoomMonitor` con `waitForAdmission(limitMs, rejectedPattern, pollMs?)`, `checkOnce()`, `startEndWatch(onEnded, pollMs?)`, `stop()`; `createPuppeteerProbe(browser, page, selectors)`.

- [ ] **Step 1: Escribir el test que falla**

`algorithm-manager-bot/src/tests/LiveRoomMonitor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { LiveRoomMonitor, type RoomProbe } from "../infrastructure/connectors/live/LiveRoomMonitor.js";
import { BotJoinError } from "../domain/models/LiveSession.js";

function fakeProbe(over: Partial<RoomProbe> = {}): RoomProbe {
  return {
    isBrowserOpen: () => true,
    currentUrl: () => "https://meet.google.com/abc-defg-hij",
    pageText: async () => "En la llamada",
    participantCount: async () => 3,
    hasAdmittedMarker: async () => false,
    ...over
  };
}

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

describe("LiveRoomMonitor.waitForAdmission", () => {
  it("resuelve en cuanto aparece el marcador de admitido", async () => {
    let calls = 0;
    const m = new LiveRoomMonitor(fakeProbe({ hasAdmittedMarker: async () => ++calls >= 3 }), "abc-defg-hij", clock());
    await expect(m.waitForAdmission(60_000, /rechaz/i)).resolves.toBeUndefined();
    expect(calls).toBe(3);
  });

  it("lanza ADMISSION_TIMEOUT si nadie lo admite a tiempo", async () => {
    const m = new LiveRoomMonitor(fakeProbe(), "abc-defg-hij", clock());
    await expect(m.waitForAdmission(10_000, /rechaz/i, 2000)).rejects.toMatchObject({
      name: "BotJoinError",
      code: "ADMISSION_TIMEOUT"
    });
  });

  it("lanza ROOM_UNAVAILABLE si el anfitrión rechaza", async () => {
    const m = new LiveRoomMonitor(
      fakeProbe({ pageText: async () => "Se rechazó tu solicitud para unirte" }),
      "abc-defg-hij",
      clock()
    );
    const err = await m.waitForAdmission(60_000, /rechaz/i).catch((e) => e);
    expect(err).toBeInstanceOf(BotJoinError);
    expect(err.code).toBe("ROOM_UNAVAILABLE");
  });

  it("lanza ROOM_UNAVAILABLE si el navegador se cierra mientras espera", async () => {
    const m = new LiveRoomMonitor(fakeProbe({ isBrowserOpen: () => false }), "abc-defg-hij", clock());
    await expect(m.waitForAdmission(60_000, /rechaz/i)).rejects.toMatchObject({ code: "ROOM_UNAVAILABLE" });
  });
});

describe("LiveRoomMonitor.checkOnce", () => {
  it("devuelve null en una sala normal", async () => {
    const m = new LiveRoomMonitor(fakeProbe(), "abc-defg-hij", clock());
    expect(await m.checkOnce()).toBeNull();
  });

  it("detecta que la URL ya no contiene el código de la sala", async () => {
    const m = new LiveRoomMonitor(fakeProbe({ currentUrl: () => "https://meet.google.com/landing" }), "abc-defg-hij", clock());
    expect(await m.checkOnce()).toBe("LEFT_ROOM");
  });

  it("detecta el texto de fin", async () => {
    const m = new LiveRoomMonitor(fakeProbe({ pageText: async () => "Saliste de la llamada" }), "abc-defg-hij", clock());
    expect(await m.checkOnce()).toBe("MEETING_ENDED_TEXT");
  });

  it("detecta navegador cerrado sin leer la página", async () => {
    const m = new LiveRoomMonitor(
      fakeProbe({
        isBrowserOpen: () => false,
        pageText: async () => { throw new Error("no debe leerse"); }
      }),
      "abc-defg-hij",
      clock()
    );
    expect(await m.checkOnce()).toBe("BROWSER_CLOSED");
  });

  it("si leer la página falla (se está cerrando) cuenta como navegador cerrado", async () => {
    const m = new LiveRoomMonitor(fakeProbe({ pageText: async () => { throw new Error("Target closed"); } }), "abc-defg-hij", clock());
    expect(await m.checkOnce()).toBe("BROWSER_CLOSED");
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd algorithm-manager-bot && npx vitest run src/tests/LiveRoomMonitor.test.ts`
Expected: FAIL (no existe el módulo).

- [ ] **Step 3: Crear `LiveRoomMonitor.ts`**

```ts
import { BotJoinError } from "../../../domain/models/LiveSession.js";
import {
  END_POLL_MS,
  MeetingEndDetector,
  type EndReason
} from "../../../domain/services/MeetingEndDetector.js";

/** Lo mínimo que el monitor necesita saber de la sala; la implementación real usa puppeteer. */
export interface RoomProbe {
  isBrowserOpen(): boolean;
  currentUrl(): string;
  pageText(): Promise<string>;
  /** null si no se puede leer. */
  participantCount(): Promise<number | null>;
  /** true cuando ya se ve la barra de la llamada (botón de salir). */
  hasAdmittedMarker(): Promise<boolean>;
}

export interface MonitorClock {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class LiveRoomMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private detector = new MeetingEndDetector();
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private ended = false;

  constructor(
    private probe: RoomProbe,
    private roomMarker: string,
    clock: MonitorClock = {}
  ) {
    this.now = clock.now ?? (() => Date.now());
    this.sleep = clock.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Espera a que el anfitrión admita al bot. Lanza BotJoinError si no entra. */
  public async waitForAdmission(limitMs: number, rejectedPattern: RegExp, pollMs = 2000): Promise<void> {
    const started = this.now();
    while (true) {
      if (!this.probe.isBrowserOpen()) {
        throw new BotJoinError("ROOM_UNAVAILABLE", "El navegador se cerró antes de que el bot entrara a la sala.");
      }
      if (await this.probe.hasAdmittedMarker().catch(() => false)) return;
      const text = await this.probe.pageText().catch(() => "");
      if (rejectedPattern.test(text)) {
        throw new BotJoinError("ROOM_UNAVAILABLE", "El anfitrión rechazó la solicitud de entrada del bot.");
      }
      if (this.now() - started >= limitMs) {
        throw new BotJoinError(
          "ADMISSION_TIMEOUT",
          "Nadie admitió al bot en la sala a tiempo. Pide al anfitrión que lo admita e inténtalo de nuevo."
        );
      }
      await this.sleep(pollMs);
    }
  }

  /** Una comprobación de fin de reunión. */
  public async checkOnce(): Promise<EndReason | null> {
    if (!this.probe.isBrowserOpen()) return this.detector.evaluate(this.snapshot(false, "", null));
    try {
      const [pageText, participantCount] = await Promise.all([this.probe.pageText(), this.probe.participantCount()]);
      return this.detector.evaluate(this.snapshot(true, pageText, participantCount));
    } catch {
      return "BROWSER_CLOSED";
    }
  }

  public startEndWatch(onEnded: (reason: EndReason) => void, pollMs = END_POLL_MS): void {
    this.stop();
    this.ended = false;
    this.timer = setInterval(() => {
      void this.checkOnce().then((reason) => {
        if (reason && !this.ended) {
          this.ended = true;
          this.stop();
          onEnded(reason);
        }
      });
    }, pollMs);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private snapshot(browserOpen: boolean, pageText: string, participantCount: number | null) {
    return {
      browserOpen,
      urlStillInRoom: this.roomMarker === "" || this.probe.currentUrl().includes(this.roomMarker),
      pageText,
      participantCount,
      nowMs: this.now()
    };
  }
}
```

- [ ] **Step 4: Crear `PuppeteerRoomProbe.ts`**

```ts
import type { Browser, Page } from "puppeteer-core";
import type { RoomProbe } from "./LiveRoomMonitor.js";

export interface ProbeSelectors {
  /** Selector CSS del botón de salir de la llamada (presente solo si el bot ya entró). */
  admittedSelector: string;
  /** Selector CSS del botón/contador de participantes, cuyo aria-label o texto lleva el número. */
  countSelector: string;
}

export function createPuppeteerProbe(browser: Browser, page: Page, selectors: ProbeSelectors): RoomProbe {
  return {
    isBrowserOpen: () => browser.connected,
    currentUrl: () => page.url(),
    pageText: () => page.evaluate(() => document.body?.innerText ?? ""),
    participantCount: async () => {
      const raw = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}` : null;
      }, selectors.countSelector);
      if (raw === null) return null;
      const m = raw.match(/\d+/);
      return m ? Number(m[0]) : null;
    },
    hasAdmittedMarker: async () => (await page.$(selectors.admittedSelector)) !== null
  };
}
```

- [ ] **Step 5: Ejecutar tests y tsc**

Run: `cd algorithm-manager-bot && npx vitest run src/tests/LiveRoomMonitor.test.ts && npx tsc --noEmit`
Expected: 9 tests PASS, tsc limpio. Si `browser.connected` no existe en la versión de puppeteer-core instalada, usa `browser.isConnected()` (comprueba el tipo con tsc).

---

### Task 4: Drivers, conector y servicio del bot con estados reales

**Files:**
- Modify: `algorithm-manager-bot/src/infrastructure/connectors/live/BrowserLauncher.ts`
- Modify (reescribir): `algorithm-manager-bot/src/infrastructure/connectors/live/GoogleMeetLiveDriver.ts`
- Modify (reescribir): `algorithm-manager-bot/src/infrastructure/connectors/live/TeamsLiveDriver.ts`
- Modify: `algorithm-manager-bot/src/infrastructure/connectors/HeadlessMeetingBotConnector.ts`
- Modify: `algorithm-manager-bot/src/application/AutonomousMeetingBotService.ts`
- Modify: `algorithm-manager-bot/src/cli.ts`
- Modify: `algorithm-manager-bot/src/index.ts` (exports nuevos)
- Test: `algorithm-manager-bot/src/tests/BotConnectorStatus.test.ts`

**Interfaces:**
- Consumes: Tasks 2 y 3.
- Produces:
  - `BrowserLaunchConfig` ampliada: `profileDir?`, `onStatus?`, `onEnded?`, `admissionLimitMs?`.
  - `LiveDriver` (`joinAndListen(url, config, onUtterance): Promise<void>`, `leave(): Promise<void>`).
  - `HeadlessMeetingBotConnector` con constructor `(drivers?: { meet?: () => LiveDriver; teams?: () => LiveDriver })` y `connectToMeeting(config, onUtterance?, options?: { headless?, profileDir?, onStatus?, onEnded?, admissionLimitMs? })`. Ya no traga errores.
  - `AutonomousBotConfig` ampliada: `settings?: { botDisplayName?: string; autoRecord?: boolean }`, `profileDir?`, `onStatus?`, `onEnded?`, `skipConnection?`.
  - `AutonomousMeetingBotService` con 6.º parámetro de constructor `connector` y método `abort(): Promise<void>`.
  - `BrowserLauncher.findSystemBrowserExecutable(preferred?: string)`.

- [ ] **Step 1: Escribir el test que falla**

`algorithm-manager-bot/src/tests/BotConnectorStatus.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { HeadlessMeetingBotConnector, type LiveDriver } from "../infrastructure/connectors/HeadlessMeetingBotConnector.js";
import { AutonomousMeetingBotService } from "../application/AutonomousMeetingBotService.js";
import { BotJoinError } from "../domain/models/LiveSession.js";

const cfg = (url: string) => ({
  mode: "HEADLESS_BOT" as const,
  meetingUrl: url,
  platform: "GOOGLE_MEET" as const,
  botDisplayName: "Bot",
  autoRecord: true
});

function fakeDriver(over: Partial<LiveDriver> = {}): LiveDriver {
  return { joinAndListen: vi.fn(async () => {}), leave: vi.fn(async () => {}), ...over };
}

describe("HeadlessMeetingBotConnector", () => {
  it("propaga el error real del driver en vez de simular éxito", async () => {
    const driver = fakeDriver({
      joinAndListen: async () => { throw new BotJoinError("NEEDS_LOGIN", "Falta iniciar sesión"); }
    });
    const c = new HeadlessMeetingBotConnector({ meet: () => driver });
    await expect(c.connectToMeeting(cfg("https://meet.google.com/abc-defg-hij"), () => {})).rejects.toMatchObject({
      code: "NEEDS_LOGIN"
    });
  });

  it("pasa perfil, callbacks y límite al driver", async () => {
    const driver = fakeDriver();
    const c = new HeadlessMeetingBotConnector({ meet: () => driver });
    const onStatus = vi.fn();
    const onEnded = vi.fn();
    await c.connectToMeeting(cfg("https://meet.google.com/abc-defg-hij"), () => {}, {
      headless: false,
      profileDir: "C:/datos/bot/profile",
      onStatus,
      onEnded,
      admissionLimitMs: 1234
    });
    const passed = (driver.joinAndListen as any).mock.calls[0][1];
    expect(passed).toMatchObject({ headless: false, profileDir: "C:/datos/bot/profile", onStatus, onEnded, admissionLimitMs: 1234 });
  });

  it("rechaza plataformas sin driver (Zoom) con un mensaje claro", async () => {
    const c = new HeadlessMeetingBotConnector({});
    await expect(
      c.connectToMeeting({ ...cfg("https://zoom.us/j/123"), platform: "ZOOM" }, () => {})
    ).rejects.toThrow(/no.*soport/i);
  });

  it("leaveMeeting cierra el driver activo", async () => {
    const driver = fakeDriver();
    const c = new HeadlessMeetingBotConnector({ meet: () => driver });
    await c.connectToMeeting(cfg("https://meet.google.com/abc-defg-hij"), () => {});
    await c.leaveMeeting("x");
    expect(driver.leave).toHaveBeenCalledTimes(1);
  });
});

describe("AutonomousMeetingBotService", () => {
  const classifier = { classify: async () => ({ type: "INTERNAL_TECHNICAL", reason: "t", confidence: 1 }) } as any;
  const proposal = {} as any;

  it("skipConnection no abre ninguna conexión", async () => {
    const connector = { connectToMeeting: vi.fn(), leaveMeeting: vi.fn(async () => ({ success: true })) } as any;
    const svc = new AutonomousMeetingBotService(classifier, proposal, undefined, undefined, undefined, connector);
    await svc.startAutonomousMeeting({ meetingUrl: "https://meet.google.com/abc-defg-hij", skipConnection: true });
    expect(connector.connectToMeeting).not.toHaveBeenCalled();
  });

  it("usa los ajustes inyectados y reenvía perfil y callbacks al conector", async () => {
    const connector = {
      connectToMeeting: vi.fn(async () => ({ status: "CONNECTED_AND_RECORDING" })),
      leaveMeeting: vi.fn(async () => ({ success: true }))
    } as any;
    const svc = new AutonomousMeetingBotService(classifier, proposal, undefined, undefined, undefined, connector);
    const onStatus = vi.fn();
    const onEnded = vi.fn();
    await svc.startAutonomousMeeting({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      headless: false,
      settings: { botDisplayName: "Mi Bot", autoRecord: false },
      profileDir: "C:/p",
      onStatus,
      onEnded
    });
    const [connCfg, , opts] = connector.connectToMeeting.mock.calls[0];
    expect(connCfg.botDisplayName).toBe("Mi Bot");
    expect(connCfg.autoRecord).toBe(false);
    expect(opts).toMatchObject({ headless: false, profileDir: "C:/p", onStatus, onEnded });
  });

  it("abort cierra el conector", async () => {
    const connector = { connectToMeeting: vi.fn(), leaveMeeting: vi.fn(async () => ({ success: true })) } as any;
    const svc = new AutonomousMeetingBotService(classifier, proposal, undefined, undefined, undefined, connector);
    await svc.abort();
    expect(connector.leaveMeeting).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd algorithm-manager-bot && npx vitest run src/tests/BotConnectorStatus.test.ts`
Expected: FAIL.

- [ ] **Step 3: `BrowserLauncher.ts`**

(a) Ampliar la interfaz `BrowserLaunchConfig`:

```ts
import type { LiveStatusCallback } from "../../../domain/models/LiveSession.js";
import type { EndReason } from "../../../domain/services/MeetingEndDetector.js";

export interface BrowserLaunchConfig {
  headless?: boolean;
  chromePath?: string;
  botDisplayName?: string;
  /** Carpeta del perfil del navegador (sesión de Google). Por defecto, la de la raíz del repo (CLI). */
  profileDir?: string;
  onStatus?: LiveStatusCallback;
  onEnded?: (reason: EndReason) => void;
  admissionLimitMs?: number;
}
```

(b) Cambiar la firma de `findSystemBrowserExecutable` a `(preferred?: string)`. En el bloque "0. Revisar preferencia guardada", sustituir la lectura del JSON por: `const pref = preferred ?? readSavedPreference();` donde `readSavedPreference()` es una función privada estática con el `try/catch` actual que lee `.bot-settings.json` y devuelve `cfg.botPreferredBrowser` (o `undefined`). El resto de la lógica (`brave`/`chrome`/`msedge` → ruta) usa `pref`. Con `preferred === "auto"` se ignora la preferencia y sigue con el flujo actual (variable de entorno → navegador predeterminado → candidatos).

- [ ] **Step 4: Reescribir `GoogleMeetLiveDriver.ts`**

```ts
import fs from "node:fs";
import puppeteer, { Browser, Page } from "puppeteer-core";
import { BrowserLauncher, BrowserLaunchConfig } from "./BrowserLauncher.js";
import { ExtractedUtterance, PlatformSpeakerExtractor } from "../PlatformSpeakerExtractor.js";
import { BotJoinError } from "../../../domain/models/LiveSession.js";
import { ADMISSION_LIMIT_MS } from "../../../domain/services/MeetingEndDetector.js";
import { LiveRoomMonitor } from "./LiveRoomMonitor.js";
import { createPuppeteerProbe } from "./PuppeteerRoomProbe.js";

const LOGIN_BLOCK = /no puedes unirte a esta videollamada|you can(?:'|’)?t join this video call/i;
const REJECTED = /se rechaz[oó] tu solicitud|denegaron|no te han permitido|denied your request|someone in the call denied/i;
const ADMITTED_SELECTOR = 'button[aria-label*="Salir de la llamada" i], button[aria-label*="Leave call" i]';
const COUNT_SELECTOR = 'button[aria-label*="Mostrar a todos" i], button[aria-label*="Show everyone" i]';
const LOGIN_WAIT_MS = 90_000;

export class GoogleMeetLiveDriver {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private monitor: LiveRoomMonitor | null = null;
  private profileDir: string;

  constructor(profileDir?: string) {
    this.profileDir = profileDir ?? BrowserLauncher.getProfileDir();
    if (!fs.existsSync(this.profileDir)) {
      fs.mkdirSync(this.profileDir, { recursive: true });
    }
  }

  public async joinAndListen(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void> {
    try {
      await this.run(meetingUrl, config, onUtterance);
    } catch (err) {
      await this.leave();
      throw err;
    }
  }

  private async run(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void> {
    const status = config.onStatus ?? (() => {});
    const isHeadless = config.headless ?? false;
    const botName = config.botDisplayName || "Algorithm Assistant Bot";
    const executablePath = config.chromePath || BrowserLauncher.findSystemBrowserExecutable();

    status("OPENING", `Abriendo ${BrowserLauncher.getBrowserDisplayName(executablePath)}…`);
    BrowserLauncher.killOrphanedBotChrome();
    BrowserLauncher.cleanStaleLocks(this.profileDir);

    try {
      this.browser = await puppeteer.launch({
        executablePath,
        headless: isHeadless,
        userDataDir: this.profileDir,
        args: [...BrowserLauncher.getChromeArgs(), "--no-first-run", "--no-default-browser-check"],
        ignoreDefaultArgs: ["--enable-automation"],
        defaultViewport: null
      });
    } catch (err) {
      throw new BotJoinError(
        "BROWSER_FAILED",
        `No se pudo abrir el navegador del bot: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());
    const page = this.page;

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await this.browser.defaultBrowserContext().overridePermissions("https://meet.google.com", ["microphone", "camera"]);

    await page.goto(meetingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.exposeFunction("__emitMeetUtterance", (rawSpeaker: string, text: string) => {
      const parsed = PlatformSpeakerExtractor.parseMeetCaption(`${rawSpeaker}: ${text}`);
      onUtterance(
        parsed ?? {
          speakerName: PlatformSpeakerExtractor.sanitizeSpeakerName(rawSpeaker),
          content: text,
          timestamp: new Date().toLocaleTimeString(),
          platform: "GOOGLE_MEET"
        }
      );
    });

    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.innerText || "").includes("Continuar sin"));
      if (btn) (btn as HTMLButtonElement).click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    const url = page.url();
    if (url.includes("workspace.google.com") || url.includes("/unsupported")) {
      throw new BotJoinError(
        "ROOM_UNAVAILABLE",
        "Google Meet redirigió fuera de la sala: el código caducó, la sala no existe o el anfitrión cerró la llamada."
      );
    }

    await this.ensureLoggedIn(page, meetingUrl, isHeadless, status);

    // Apagar micrófono y cámara antes de entrar.
    try {
      await page.keyboard.down("Control");
      await page.keyboard.press("KeyD");
      await page.keyboard.press("KeyE");
      await page.keyboard.up("Control");
    } catch {}

    try {
      const nameInput = await page.$('input[type="text"], input[aria-label*="nombre" i], input[placeholder*="nombre" i]');
      if (nameInput) {
        await nameInput.click();
        await nameInput.type(botName, { delay: 30 });
      }
    } catch {}

    const clicked = await this.clickJoin(page);
    if (!clicked) {
      throw new BotJoinError("ROOM_UNAVAILABLE", "No se encontró el botón para unirse a la reunión en la página de Meet.");
    }

    status("WAITING_ADMISSION", "Solicitud enviada. Pide al anfitrión que admita al bot en la sala.");
    const roomMarker = new URL(meetingUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    this.monitor = new LiveRoomMonitor(
      createPuppeteerProbe(this.browser, page, { admittedSelector: ADMITTED_SELECTOR, countSelector: COUNT_SELECTOR }),
      roomMarker
    );
    await this.monitor.waitForAdmission(config.admissionLimitMs ?? ADMISSION_LIMIT_MS, REJECTED);

    // Subtítulos y observador de diálogo.
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", code: "KeyC", bubbles: true }));
      const observer = new MutationObserver(() => {
        const captionNodes = document.querySelectorAll('div[jscontroller="D1tHje"], div[class*="zsFvd"], div[class*="T4LgNb"]');
        captionNodes.forEach((node) => {
          const speakerElem = node.querySelector('div[class*="zsFvd"], div[class*="bj4zb"], span[class*="zsFvd"]') || node;
          const textElem = node.querySelector('span[class*="ygThBe"], span');
          if (speakerElem && textElem) {
            const speaker = speakerElem.textContent?.trim() || "Participante";
            const text = textElem.textContent?.trim() || "";
            if (text.length > 2 && (window as any).__lastReportedText !== text) {
              (window as any).__lastReportedText = text;
              (window as any).__emitMeetUtterance(speaker, text);
            }
          }
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    status("LISTENING", "El bot está en la reunión y captando la conversación.");
    if (config.onEnded) this.monitor.startEndWatch(config.onEnded);
  }

  /** Si Meet exige cuenta de Google: en modo visible espera el login; sin ventana falla de inmediato. */
  private async ensureLoggedIn(
    page: Page,
    meetingUrl: string,
    isHeadless: boolean,
    status: NonNullable<BrowserLaunchConfig["onStatus"]>
  ): Promise<void> {
    const text = () => page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (!LOGIN_BLOCK.test(await text())) return;

    const help = "Inicia sesión en Ajustes → Cuenta de Google del bot y vuelve a intentarlo.";
    status("NEEDS_LOGIN", "Google Meet exige iniciar sesión con una cuenta de Google.");
    if (isHeadless) {
      throw new BotJoinError("NEEDS_LOGIN", `Google Meet exige iniciar sesión con una cuenta de Google. ${help}`);
    }

    const deadline = Date.now() + LOGIN_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const current = page.url();
      if (current.includes("workspace.google.com") || current.includes("/unsupported")) {
        await page.goto(meetingUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
      }
      if (!LOGIN_BLOCK.test(await text())) return;
    }
    throw new BotJoinError("NEEDS_LOGIN", `No se detectó el inicio de sesión de Google. ${help}`);
  }

  private async clickJoin(page: Page): Promise<boolean> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button, div[role='button']")).find((b) => {
          const t = (b.textContent || "").toLowerCase();
          return (
            t.includes("pedir unirse") || t.includes("unirse ahora") || t.includes("solicitar unirse") ||
            t.includes("ask to join") || t.includes("join now")
          );
        });
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
        return false;
      });
      if (clicked) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  public async leave(): Promise<void> {
    this.monitor?.stop();
    this.monitor = null;
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}
```

- [ ] **Step 5: Reescribir `TeamsLiveDriver.ts`**

Misma forma que Meet. Conserva tal cual del archivo actual: el `puppeteer.launch` (sin `userDataDir`), `overridePermissions("https://teams.microsoft.com", …)`, el `goto` con `networkidle2`, el `exposeFunction("__emitTeamsUtterance", …)` con `PlatformSpeakerExtractor.parseTeamsCaption`, el clic en `joinOnWeb`, el nombre del bot y el observador de subtítulos. Cambios obligatorios:

1. Envolver `joinAndListen` como en Meet: `try { await this.run(...) } catch (err) { await this.leave(); throw err; }`.
2. Reportar estados con `config.onStatus`: `OPENING` al lanzar; tras el clic en `prejoin-join-button`, `WAITING_ADMISSION` ("Solicitud enviada. Pide al anfitrión que admita al bot en la sala."); al estar admitido, `LISTENING`.
3. Si `puppeteer.launch` falla, lanzar `BotJoinError("BROWSER_FAILED", …)` con el mismo texto que en Meet.
4. Si no se encontró `button[data-tid="prejoin-join-button"]`, lanzar `BotJoinError("ROOM_UNAVAILABLE", "No se encontró el botón para unirse a la reunión en la página de Teams.")` (hoy el clic falla en silencio).
5. Tras el clic, `new LiveRoomMonitor(createPuppeteerProbe(browser, page, { admittedSelector: 'button[data-tid="hangup-button"], button#hangup-button', countSelector: 'button[data-tid="calling-roster-button"], button[id="roster-button"]' }), roomMarker)` donde `roomMarker` es `""` (Teams cambia la URL al entrar) y `await monitor.waitForAdmission(config.admissionLimitMs ?? ADMISSION_LIMIT_MS, /rechaz|denied|no se permiti/i)`.
6. Después de inyectar el observador de subtítulos: `if (config.onEnded) monitor.startEndWatch(config.onEnded)`.
7. `leave()` detiene el monitor y cierra el navegador, igual que Meet. Todos los `console.*` informativos pueden quedarse.

- [ ] **Step 6: Reescribir `HeadlessMeetingBotConnector.ts`**

Sustituir la clase manteniendo `BotJoinResult` y `detectPlatform` tal cual:

```ts
import { MeetingBotConnectionConfig, MeetingPlatform } from "../../domain/models/MeetingTypes.js";
import { GoogleMeetLiveDriver } from "./live/GoogleMeetLiveDriver.js";
import { TeamsLiveDriver } from "./live/TeamsLiveDriver.js";
import { ExtractedUtterance } from "./PlatformSpeakerExtractor.js";
import type { BrowserLaunchConfig } from "./live/BrowserLauncher.js";
import type { LiveStatusCallback } from "../../domain/models/LiveSession.js";
import type { EndReason } from "../../domain/services/MeetingEndDetector.js";

export interface LiveDriver {
  joinAndListen(
    meetingUrl: string,
    config: BrowserLaunchConfig,
    onUtterance: (utterance: ExtractedUtterance) => void
  ): Promise<void>;
  leave(): Promise<void>;
}

export interface LiveDriverFactories {
  meet?: (profileDir?: string) => LiveDriver;
  teams?: () => LiveDriver;
}

export interface ConnectOptions {
  headless?: boolean;
  profileDir?: string;
  onStatus?: LiveStatusCallback;
  onEnded?: (reason: EndReason) => void;
  admissionLimitMs?: number;
}

export interface BotJoinResult {
  sessionId: string;
  platform: MeetingPlatform;
  connectedAt: string;
  status: "CONNECTED_AND_RECORDING" | "WAITING_IN_LOBBY" | "FAILED";
  message: string;
}

export class HeadlessMeetingBotConnector {
  private active: LiveDriver | null = null;

  constructor(private drivers: LiveDriverFactories = {}) {}

  public static detectPlatform(url: string): MeetingPlatform {
    const lower = url.toLowerCase();
    if (lower.includes("meet.google.com")) return "GOOGLE_MEET";
    if (lower.includes("teams.microsoft.com") || lower.includes("teams.live.com")) return "MICROSOFT_TEAMS";
    if (lower.includes("zoom.us")) return "ZOOM";
    return "LOCAL_DESKTOP";
  }

  public async connectToMeeting(
    config: MeetingBotConnectionConfig,
    onUtterance?: (utterance: ExtractedUtterance) => void,
    options: ConnectOptions = {}
  ): Promise<BotJoinResult> {
    if (!config.meetingUrl) {
      throw new Error("Se requiere una URL válida de reunión (Google Meet, MS Teams o Zoom) para el modo bot remoto.");
    }

    const platform = HeadlessMeetingBotConnector.detectPlatform(config.meetingUrl);
    const sessionId = `bot-session-${Date.now()}`;
    console.info(`[HeadlessMeetingBot] Conectando asistente '${config.botDisplayName}' hacia ${platform} (${config.meetingUrl})`);

    if (onUtterance) {
      const driver = this.createDriver(platform, options.profileDir);
      const launchConfig: BrowserLaunchConfig = {
        headless: options.headless ?? true,
        botDisplayName: config.botDisplayName,
        profileDir: options.profileDir,
        onStatus: options.onStatus,
        onEnded: options.onEnded,
        admissionLimitMs: options.admissionLimitMs
      };
      this.active = driver;
      await driver.joinAndListen(config.meetingUrl, launchConfig, onUtterance);
    }

    return {
      sessionId,
      platform,
      connectedAt: new Date().toISOString(),
      status: "CONNECTED_AND_RECORDING",
      message: `El bot '${config.botDisplayName}' está en la sala de ${platform} y capta la conversación.`
    };
  }

  private createDriver(platform: MeetingPlatform, profileDir?: string): LiveDriver {
    if (platform === "GOOGLE_MEET") return (this.drivers.meet ?? ((p) => new GoogleMeetLiveDriver(p)))(profileDir);
    if (platform === "MICROSOFT_TEAMS") return (this.drivers.teams ?? (() => new TeamsLiveDriver()))();
    throw new Error(`La entrada automática no está soportada para la plataforma ${platform}.`);
  }

  public async leaveMeeting(sessionId: string): Promise<{ success: boolean; recordedAudioPath?: string }> {
    console.info(`[HeadlessMeetingBot] Cerrando sesión para: ${sessionId}`);
    if (this.active) {
      await this.active.leave();
      this.active = null;
    }
    return { success: true, recordedAudioPath: `temp/audio-capture-${sessionId}.wav` };
  }
}
```

- [ ] **Step 7: `AutonomousMeetingBotService.ts`**

(a) Ampliar `AutonomousBotConfig` con:

```ts
  /** Ajustes inyectados; si se pasan no se lee `.bot-settings.json` de la raíz. */
  settings?: { botDisplayName?: string; autoRecord?: boolean };
  profileDir?: string;
  onStatus?: LiveStatusCallback;
  onEnded?: (reason: EndReason) => void;
  /** Solo inicia la sesión de captura sin abrir ningún navegador (modo simulación del CLI). */
  skipConnection?: boolean;
```

e importar `LiveStatusCallback` (de `../domain/models/LiveSession.js`) y `EndReason` (de `../domain/services/MeetingEndDetector.js`).

(b) Convertir el campo `connector` en parámetro del constructor: quitar `private connector: HeadlessMeetingBotConnector = new HeadlessMeetingBotConnector();` y añadir como 6.º parámetro `private connector: HeadlessMeetingBotConnector = new HeadlessMeetingBotConnector()`.

(c) En `startAutonomousMeeting`: tras calcular `platform` y `sessionId`, si `config.skipConnection` hacer `return sessionId;` (después de los `console.info` de arranque). Sustituir la lectura de `.bot-settings.json` por `const savedConfig = config.settings ?? this.readLegacySettings();` y mover el bloque `try { …readFileSync… } catch {}` actual a un método privado `readLegacySettings(): any` (con `rootDir` calculado dentro). Pasar a `connectToMeeting` el cuarto argumento `{ headless: config.headless ?? false, profileDir: config.profileDir, onStatus: config.onStatus, onEnded: config.onEnded }`.

(d) Añadir:

```ts
  /** Cierra el navegador sin generar entregables (fallo al entrar o cancelación). */
  public async abort(): Promise<void> {
    this.isRunning = false;
    await this.connector.leaveMeeting("abort");
  }
```

- [ ] **Step 8: `cli.ts`**

En `runAutonomousBot`, pasar `skipConnection: !isLive` a `startAutonomousMeeting`. Mover el mensaje `"🚀 El bot se ha unido a la sala como invitado y ha iniciado la captura..."` a después del `await` de `startAutonomousMeeting` y solo cuando `isLive`. Resultado: `--file` y los modos de demostración dejan de abrir un navegador a una sala falsa.

- [ ] **Step 9: Exports**

En `algorithm-manager-bot/src/index.ts` añadir `export * from "./domain/models/LiveSession.js";` y `export * from "./domain/services/MeetingEndDetector.js";`.

- [ ] **Step 10: Ejecutar suite y tsc**

Run: `cd algorithm-manager-bot && npx tsc --noEmit && npx vitest run`
Expected: tsc limpio; todos los tests pasan (49 anteriores + 12 + 9 + 7 nuevos). Si `ProcessMeetingSession.test.ts` u otro usa `stubConnector()` (spy sobre el prototipo), debe seguir pasando sin cambios.

---

### Task 5: Rutas, ajustes y política de enlaces (backend)

**Files:**
- Create: `backend/src/desktop/bot/BotPaths.ts`
- Create: `backend/src/desktop/bot/BotSettingsStore.ts`
- Create: `backend/src/desktop/bot/meetingUrlPolicy.ts`
- Test: `backend/src/desktop/tests/BotSettingsStore.test.ts`
- Test: `backend/src/desktop/tests/MeetingUrlPolicy.test.ts`

**Interfaces:**
- Consumes: tipos de la Task 1.
- Produces: `BotPaths`, `resolveBotPaths(userDataDir)`, `BotSettingsStore` (`get()`, `update(partial)`, `effectiveOutputDir()`, `normalizeDomains`), `checkMeetingUrl(raw, { allowedPlatforms, allowedDomains })` → `UrlCheck`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/MeetingUrlPolicy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkMeetingUrl } from "../bot/meetingUrlPolicy.js";

const allow = {
  allowedPlatforms: ["GOOGLE_MEET", "MICROSOFT_TEAMS"] as const,
  allowedDomains: ["meet.google.com", "teams.microsoft.com", "teams.live.com"]
};
const cfg = { allowedPlatforms: [...allow.allowedPlatforms], allowedDomains: allow.allowedDomains };

describe("checkMeetingUrl", () => {
  it("acepta un enlace de Meet", () => {
    expect(checkMeetingUrl("https://meet.google.com/abc-defg-hij", cfg)).toEqual({
      ok: true,
      platform: "GOOGLE_MEET",
      url: "https://meet.google.com/abc-defg-hij"
    });
  });

  it("acepta Teams con subdominio y detecta la plataforma", () => {
    const r = checkMeetingUrl("https://teams.microsoft.com/l/meetup-join/abc", cfg);
    expect(r).toMatchObject({ ok: true, platform: "MICROSOFT_TEAMS" });
  });

  it("rechaza http", () => {
    expect(checkMeetingUrl("http://meet.google.com/abc-defg-hij", cfg)).toMatchObject({ ok: false });
  });

  it("rechaza credenciales dentro de la URL", () => {
    expect(checkMeetingUrl("https://user:pw@meet.google.com/abc-defg-hij", cfg)).toMatchObject({ ok: false });
  });

  it.each([
    "https://meet.google.com.evil.com/abc-defg-hij",
    "https://evilmeet.google.com/abc",
    "https://evil.com/meet.google.com",
    "https://notmeet.google.com.attacker.io/x"
  ])("rechaza hosts parecidos: %s", (url) => {
    expect(checkMeetingUrl(url, cfg)).toMatchObject({ ok: false });
  });

  it("rechaza Zoom con un mensaje claro", () => {
    const r = checkMeetingUrl("https://zoom.us/j/123456", cfg);
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/zoom/i);
  });

  it("rechaza si la plataforma está desactivada", () => {
    const r = checkMeetingUrl("https://meet.google.com/abc-defg-hij", { ...cfg, allowedPlatforms: ["MICROSOFT_TEAMS"] });
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza si el dominio no está en la lista aunque la plataforma sea válida", () => {
    const r = checkMeetingUrl("https://teams.live.com/meet/123", { ...cfg, allowedDomains: ["meet.google.com"] });
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza todo si la lista de dominios está vacía", () => {
    expect(checkMeetingUrl("https://meet.google.com/abc-defg-hij", { ...cfg, allowedDomains: [] })).toMatchObject({ ok: false });
  });

  it("rechaza texto que no es una URL", () => {
    expect(checkMeetingUrl("abc-defg-hij", cfg)).toMatchObject({ ok: false });
    expect(checkMeetingUrl("", cfg)).toMatchObject({ ok: false });
  });
});
```

`backend/src/desktop/tests/BotSettingsStore.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveBotPaths } from "../bot/BotPaths.js";
import { BotSettingsStore, normalizeDomains } from "../bot/BotSettingsStore.js";
import { DEFAULT_BOT_ALLOWED_DOMAINS } from "@audio-to-text/shared";

describe("BotSettingsStore", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "botset-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("resolveBotPaths cuelga todo de <userData>/bot", () => {
    const p = resolveBotPaths(dir);
    expect(p.dir).toBe(path.join(dir, "bot"));
    expect(p.profileDir).toBe(path.join(dir, "bot", "profile"));
    expect(p.settingsFile).toBe(path.join(dir, "bot", "settings.json"));
    expect(p.outputDir).toBe(path.join(dir, "bot", "output"));
  });

  it("sin archivo devuelve los valores por defecto con lista de permitidos", () => {
    const s = new BotSettingsStore(resolveBotPaths(dir)).get();
    expect(s.botDisplayName).toBeTruthy();
    expect(s.botAllowedDomains).toEqual([...DEFAULT_BOT_ALLOWED_DOMAINS]);
    expect(s.botAllowedPlatforms).toEqual(["GOOGLE_MEET", "MICROSOFT_TEAMS"]);
  });

  it("update persiste y get lo recupera en otra instancia", () => {
    const paths = resolveBotPaths(dir);
    new BotSettingsStore(paths).update({ botDisplayName: "Mi Bot", botAllowedDomains: ["Meet.Google.com", "meet.google.com"] });
    const again = new BotSettingsStore(paths).get();
    expect(again.botDisplayName).toBe("Mi Bot");
    expect(again.botAllowedDomains).toEqual(["meet.google.com"]);
  });

  it("un archivo corrupto vuelve a los valores por defecto sin lanzar", () => {
    const paths = resolveBotPaths(dir);
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.settingsFile, "{no es json", "utf-8");
    expect(new BotSettingsStore(paths).get().botDisplayName).toBeTruthy();
  });

  it("effectiveOutputDir usa botOutputDir si está y si no la carpeta output", () => {
    const paths = resolveBotPaths(dir);
    const store = new BotSettingsStore(paths);
    expect(store.effectiveOutputDir()).toBe(paths.outputDir);
    store.update({ botOutputDir: path.join(dir, "otra") });
    expect(store.effectiveOutputDir()).toBe(path.resolve(dir, "otra"));
  });

  it("normalizeDomains limpia esquema, ruta, mayúsculas, duplicados e inválidos", () => {
    expect(normalizeDomains(["https://Teams.Microsoft.com/path", "  meet.google.com ", "meet.google.com", "no valido", "", "a_b.com"]))
      .toEqual(["teams.microsoft.com", "meet.google.com"]);
  });

  it("las plataformas desconocidas se descartan; una lista vacía se respeta", () => {
    const store = new BotSettingsStore(resolveBotPaths(dir));
    store.update({ botAllowedPlatforms: ["GOOGLE_MEET", "ZOOM" as any] });
    expect(store.get().botAllowedPlatforms).toEqual(["GOOGLE_MEET"]);
    store.update({ botAllowedPlatforms: [] });
    expect(store.get().botAllowedPlatforms).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd backend && npx vitest run src/desktop/tests/MeetingUrlPolicy.test.ts src/desktop/tests/BotSettingsStore.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Crear `BotPaths.ts`**

```ts
import path from "node:path";

export interface BotPaths {
  dir: string;
  profileDir: string;
  settingsFile: string;
  outputDir: string;
}

/** Todo lo del bot vive en <userData>/bot, igual en desarrollo y en el instalador. */
export function resolveBotPaths(userDataDir: string): BotPaths {
  const dir = path.join(userDataDir, "bot");
  return {
    dir,
    profileDir: path.join(dir, "profile"),
    settingsFile: path.join(dir, "settings.json"),
    outputDir: path.join(dir, "output")
  };
}
```

- [ ] **Step 4: Crear `meetingUrlPolicy.ts`**

```ts
import type { BotPlatform } from "@audio-to-text/shared";

export type UrlCheck =
  | { ok: true; platform: BotPlatform; url: string }
  | { ok: false; reason: string };

export interface UrlPolicy {
  allowedPlatforms: BotPlatform[];
  allowedDomains: string[];
}

const PLATFORM_HOSTS: Array<{ platform: BotPlatform; hosts: string[] }> = [
  { platform: "GOOGLE_MEET", hosts: ["meet.google.com"] },
  { platform: "MICROSOFT_TEAMS", hosts: ["teams.microsoft.com", "teams.live.com"] }
];

/** true si host es exactamente `domain` o un subdominio real de él. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function checkMeetingUrl(raw: string, policy: UrlPolicy): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "El enlace no es una dirección válida. Pega el enlace completo de la reunión." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "El enlace debe empezar con https://." };
  if (u.username || u.password) return { ok: false, reason: "El enlace no puede incluir usuario ni contraseña." };

  const host = u.hostname.toLowerCase();
  const match = PLATFORM_HOSTS.find((p) => p.hosts.some((h) => hostMatches(host, h)));
  if (!match) {
    if (hostMatches(host, "zoom.us")) return { ok: false, reason: "Zoom aún no tiene soporte para entrada automática." };
    return { ok: false, reason: "Plataforma no soportada. El bot solo entra a Google Meet y Microsoft Teams." };
  }
  if (!policy.allowedPlatforms.includes(match.platform)) {
    return { ok: false, reason: "Esa plataforma está desactivada en la lista de sitios permitidos del bot." };
  }
  if (!policy.allowedDomains.some((d) => hostMatches(host, d.toLowerCase()))) {
    return { ok: false, reason: `El dominio ${host} no está en la lista de sitios permitidos del bot.` };
  }
  return { ok: true, platform: match.platform, url: u.toString() };
}
```

- [ ] **Step 5: Crear `BotSettingsStore.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import {
  BOT_PLATFORMS,
  DEFAULT_BOT_ALLOWED_DOMAINS,
  type BotPlatform,
  type MeetingBotConfigDto
} from "@audio-to-text/shared";
import type { BotPaths } from "./BotPaths.js";

const DEFAULTS: MeetingBotConfigDto = {
  botDisplayName: "Algorithm Assistant Bot",
  botAvatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=algorithm-bot",
  botPreferredBrowser: "auto",
  botGoogleAccountEmail: "",
  botAutoRecord: true,
  botMuteOnJoin: true,
  botGenerateDocx: true,
  botGenerateExcel: true,
  botDefaultPlatform: "AUTO",
  botLanguage: "es",
  botOutputDir: "",
  botAllowedPlatforms: [...BOT_PLATFORMS],
  botAllowedDomains: [...DEFAULT_BOT_ALLOWED_DOMAINS]
};

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Minúsculas, sin esquema ni ruta, sin duplicados y descartando lo que no sea un dominio. */
export function normalizeDomains(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const host = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0] ?? "";
    if (DOMAIN_RE.test(host) && !out.includes(host)) out.push(host);
  }
  return out;
}

function normalizePlatforms(input: unknown[]): BotPlatform[] {
  return BOT_PLATFORMS.filter((p) => input.includes(p));
}

export class BotSettingsStore {
  constructor(private paths: BotPaths) {}

  public get(): MeetingBotConfigDto {
    let stored: Partial<MeetingBotConfigDto> = {};
    try {
      if (fs.existsSync(this.paths.settingsFile)) {
        stored = JSON.parse(fs.readFileSync(this.paths.settingsFile, "utf-8")) as Partial<MeetingBotConfigDto>;
      }
    } catch {
      stored = {};
    }
    return this.normalize({ ...DEFAULTS, ...stored });
  }

  public update(partial: Partial<MeetingBotConfigDto>): MeetingBotConfigDto {
    const next = this.normalize({ ...this.get(), ...partial });
    fs.mkdirSync(path.dirname(this.paths.settingsFile), { recursive: true });
    fs.writeFileSync(this.paths.settingsFile, JSON.stringify(next, null, 2), "utf-8");
    return next;
  }

  /** Carpeta de salida configurada o, si está vacía, <userData>/bot/output. */
  public effectiveOutputDir(): string {
    const configured = this.get().botOutputDir?.trim();
    return configured ? path.resolve(configured) : this.paths.outputDir;
  }

  private normalize(c: MeetingBotConfigDto): MeetingBotConfigDto {
    return {
      ...c,
      botAllowedDomains: normalizeDomains(c.botAllowedDomains ?? [...DEFAULT_BOT_ALLOWED_DOMAINS]),
      botAllowedPlatforms: normalizePlatforms(c.botAllowedPlatforms ?? [...BOT_PLATFORMS])
    };
  }
}
```

- [ ] **Step 6: Ejecutar tests y tsc**

Run: `cd backend && npx vitest run src/desktop/tests/MeetingUrlPolicy.test.ts src/desktop/tests/BotSettingsStore.test.ts && npx tsc --noEmit`
Expected: 17 tests PASS, tsc limpio.

---

### Task 6: BotLoginService (login verificable)

**Files:**
- Create: `backend/src/desktop/bot/BotLoginService.ts`
- Test: `backend/src/desktop/tests/BotLoginService.test.ts`

**Interfaces:**
- Consumes: `BotPaths`, `BotLoginCheckDto`.
- Produces:
  - `interpretAccountPage(url, text)`.
  - `BotLoginService` con `openLoginBrowser()`, `verify()`, `unlink()`, `lastCheck()`, `browserInfo()`.
  - `BotLoginDeps`: `{ paths, getPreferredBrowser(): string, locateBrowser(preferred): string, displayName(path): string, spawn?, probeAccount?, killBotBrowser?, exists? }`.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/desktop/tests/BotLoginService.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BotLoginService, interpretAccountPage } from "../bot/BotLoginService.js";
import { resolveBotPaths } from "../bot/BotPaths.js";

describe("interpretAccountPage", () => {
  it("con correo visible y sin redirección al login: vinculada", () => {
    expect(interpretAccountPage("https://myaccount.google.com/?pli=1", "Hola, Ana\nana.bot@gmail.com\nCuenta")).toEqual({
      linked: true,
      email: "ana.bot@gmail.com"
    });
  });

  it("redirigida a accounts.google.com: no vinculada aunque haya un correo en el texto", () => {
    expect(interpretAccountPage("https://accounts.google.com/signin/v2", "Usar otra cuenta x@y.com")).toEqual({
      linked: false,
      email: null
    });
  });

  it("en myaccount sin correo legible: no vinculada", () => {
    expect(interpretAccountPage("https://myaccount.google.com/", "Cargando")).toEqual({ linked: false, email: null });
  });
});

describe("BotLoginService", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "botlogin-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function make(over: Record<string, unknown> = {}) {
    const paths = resolveBotPaths(dir);
    const spawn = vi.fn(() => ({ unref: () => {} }));
    const killBotBrowser = vi.fn();
    const deps = {
      paths,
      getPreferredBrowser: () => "auto",
      locateBrowser: () => "C:/Brave/brave.exe",
      displayName: () => "Brave Browser",
      spawn: spawn as any,
      killBotBrowser,
      exists: () => true,
      probeAccount: async () => ({ url: "https://myaccount.google.com/", text: "ana@gmail.com" }),
      ...over
    };
    return { svc: new BotLoginService(deps as any), paths, spawn, killBotBrowser };
  }

  it("openLoginBrowser lanza el navegador visible con el perfil del bot", () => {
    const { svc, paths, spawn, killBotBrowser } = make();
    const r = svc.openLoginBrowser();
    expect(r.success).toBe(true);
    expect(killBotBrowser).toHaveBeenCalled();
    const [exe, args] = spawn.mock.calls[0] as any;
    expect(exe).toBe("C:/Brave/brave.exe");
    expect(args).toContain(`--user-data-dir=${paths.profileDir}`);
    expect(args).toContain("https://accounts.google.com");
    expect(fs.existsSync(paths.profileDir)).toBe(true);
  });

  it("openLoginBrowser falla con mensaje claro si no hay navegador", () => {
    const { svc } = make({ exists: () => false });
    expect(() => svc.openLoginBrowser()).toThrow(/navegador/i);
  });

  it("verify devuelve el correo real y lo recuerda en lastCheck", async () => {
    const { svc } = make();
    expect(svc.lastCheck()).toBeNull();
    const r = await svc.verify();
    expect(r).toMatchObject({ linked: true, email: "ana@gmail.com" });
    expect(svc.lastCheck()).toMatchObject({ linked: true });
  });

  it("verify sin sesión informa que falta iniciar sesión", async () => {
    const { svc } = make({ probeAccount: async () => ({ url: "https://accounts.google.com/signin", text: "" }) });
    const r = await svc.verify();
    expect(r.linked).toBe(false);
    expect(r.message).toMatch(/inicia sesi/i);
  });

  it("verify captura fallos del navegador y no lanza", async () => {
    const { svc } = make({ probeAccount: async () => { throw new Error("boom"); } });
    const r = await svc.verify();
    expect(r.linked).toBe(false);
    expect(r.message).toMatch(/no se pudo verificar/i);
  });

  it("unlink borra el contenido del perfil y olvida la verificación", async () => {
    const { svc, paths } = make();
    fs.mkdirSync(path.join(paths.profileDir, "Default"), { recursive: true });
    fs.writeFileSync(path.join(paths.profileDir, "Default", "Cookies"), "x");
    await svc.verify();
    const r = svc.unlink();
    expect(r.success).toBe(true);
    expect(fs.readdirSync(paths.profileDir)).toEqual([]);
    expect(svc.lastCheck()).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd backend && npx vitest run src/desktop/tests/BotLoginService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Crear `BotLoginService.ts`**

```ts
import fs from "node:fs";
import childProcess from "node:child_process";
import type { BotLoginCheckDto } from "@audio-to-text/shared";
import type { BotPaths } from "./BotPaths.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Decide si la página de cuenta de Google corresponde a una sesión iniciada. */
export function interpretAccountPage(url: string, text: string): { linked: boolean; email: string | null } {
  if (url.includes("accounts.google.com")) return { linked: false, email: null };
  const email = text.match(EMAIL_RE)?.[0] ?? null;
  return email ? { linked: true, email } : { linked: false, email: null };
}

export interface AccountProbeInput {
  profileDir: string;
  browserPath: string;
}

export interface BotLoginDeps {
  paths: BotPaths;
  getPreferredBrowser: () => string;
  locateBrowser: (preferred: string) => string;
  displayName: (browserPath: string) => string;
  /** Abre el perfil sin ventana, entra a myaccount.google.com y devuelve URL final y texto. */
  probeAccount: (input: AccountProbeInput) => Promise<{ url: string; text: string }>;
  spawn?: typeof childProcess.spawn;
  /** Cierra cualquier navegador que use el perfil del bot (libera el bloqueo del perfil). */
  killBotBrowser?: () => void;
  exists?: (p: string) => boolean;
}

export class BotLoginService {
  private last: BotLoginCheckDto | null = null;

  constructor(private deps: BotLoginDeps) {}

  public lastCheck(): BotLoginCheckDto | null {
    return this.last;
  }

  public browserInfo(): { name: string; path: string } {
    const p = this.deps.locateBrowser(this.deps.getPreferredBrowser());
    return { name: this.deps.displayName(p), path: p };
  }

  /** Abre el navegador visible con el perfil del bot para que el usuario inicie sesión. */
  public openLoginBrowser(): { success: boolean; message: string } {
    const exists = this.deps.exists ?? fs.existsSync;
    const info = this.browserInfo();
    if (!exists(info.path)) {
      throw new Error(`No se encontró el navegador (${info.name}). Instala Chrome, Edge o Brave, o elige otro en Ajustes.`);
    }
    fs.mkdirSync(this.deps.paths.profileDir, { recursive: true });
    this.deps.killBotBrowser?.();

    const spawn = this.deps.spawn ?? childProcess.spawn;
    const child = spawn(
      info.path,
      [`--user-data-dir=${this.deps.paths.profileDir}`, "--no-first-run", "--no-default-browser-check", "https://accounts.google.com"],
      { detached: true, stdio: "ignore" }
    );
    child.unref();
    this.last = null;
    return {
      success: true,
      message: `Se abrió ${info.name}. Inicia sesión con la cuenta de Google del bot, ciérralo y pulsa "Verificar sesión".`
    };
  }

  /** Comprueba de verdad si el perfil tiene una sesión de Google iniciada. */
  public async verify(): Promise<BotLoginCheckDto> {
    try {
      this.deps.killBotBrowser?.();
      const info = this.browserInfo();
      const page = await this.deps.probeAccount({ profileDir: this.deps.paths.profileDir, browserPath: info.path });
      const { linked, email } = interpretAccountPage(page.url, page.text);
      this.last = linked
        ? { linked: true, email, message: `Sesión de Google activa${email ? ` (${email})` : ""}.` }
        : { linked: false, email: null, message: "No hay una sesión de Google iniciada. Inicia sesión con el botón de arriba." };
    } catch (err) {
      this.last = {
        linked: false,
        email: null,
        message: `No se pudo verificar la sesión: ${err instanceof Error ? err.message : String(err)}`
      };
    }
    return this.last;
  }

  public unlink(): { success: boolean; message: string } {
    this.deps.killBotBrowser?.();
    fs.mkdirSync(this.deps.paths.profileDir, { recursive: true });
    for (const entry of fs.readdirSync(this.deps.paths.profileDir)) {
      try {
        fs.rmSync(`${this.deps.paths.profileDir}/${entry}`, { recursive: true, force: true });
      } catch {
        /* un archivo bloqueado no impide borrar el resto */
      }
    }
    this.last = null;
    return { success: true, message: "Sesión de Google del bot eliminada." };
  }
}
```

- [ ] **Step 4: Ejecutar tests y tsc**

Run: `cd backend && npx vitest run src/desktop/tests/BotLoginService.test.ts && npx tsc --noEmit`
Expected: 9 tests PASS, tsc limpio.

---

### Task 7: BotSessionService (máquina de estados)

**Files:**
- Create: `backend/src/desktop/bot/BotSessionService.ts`
- Test: `backend/src/desktop/tests/BotSessionService.test.ts`

**Interfaces:**
- Consumes: `checkMeetingUrl`, `BotSessionDto`, `MeetingBotConfigDto`, `ImportBotMeetingsResultDto`.
- Produces: `BotEngine` (puerto), `BotEngineStartInput`, `BotEngineResult`, `EndReason`, `BotSessionError` (con `code: "BUSY" | "URL_NOT_ALLOWED" | "NOT_ACTIVE"`), `BotSessionService` con `current()`, `isActive()`, `join(url)`, `leave()`, `dispose()`.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/desktop/tests/BotSessionService.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  BotSessionService,
  BotSessionError,
  type BotEngine,
  type BotEngineStartInput
} from "../bot/BotSessionService.js";

const URL_OK = "https://meet.google.com/abc-defg-hij";
const config = {
  botDisplayName: "Bot",
  botAvatarUrl: "",
  botPreferredBrowser: "auto",
  botGoogleAccountEmail: "",
  botAutoRecord: true,
  botMuteOnJoin: true,
  botGenerateDocx: true,
  botGenerateExcel: true,
  botDefaultPlatform: "AUTO",
  botLanguage: "es",
  botAllowedPlatforms: ["GOOGLE_MEET", "MICROSOFT_TEAMS"],
  botAllowedDomains: ["meet.google.com", "teams.microsoft.com"]
} as any;

interface Harness {
  svc: BotSessionService;
  engine: BotEngine;
  input: () => BotEngineStartInput;
  events: Array<[string, string]>;
  importMeetings: ReturnType<typeof vi.fn>;
  release: () => void;
}

function harness(opts: { startFails?: Error; utterances?: number; hold?: boolean } = {}): Harness {
  let captured!: BotEngineStartInput;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const engine: BotEngine = {
    start: vi.fn(async (i: BotEngineStartInput) => {
      captured = i;
      if (opts.hold) await gate;
      if (opts.startFails) throw opts.startFails;
      i.onStatus("LISTENING", "ok");
      return "sess-1";
    }),
    finalize: vi.fn(async () => ({ utterances: opts.utterances ?? 5, deliveryFile: "C:/out/reunion_x.json" })),
    abort: vi.fn(async () => {})
  };
  const importMeetings = vi.fn(() => ({ imported: 1, alreadyImported: 0, failed: [], folderMissing: false, folder: "C:/out" }));
  const events: Array<[string, string]> = [];
  const svc = new BotSessionService({
    engine,
    getConfig: () => config,
    resolveBrowserPath: () => "C:/brave.exe",
    profileDir: "C:/profile",
    outputDir: () => "C:/out",
    importMeetings,
    onEvent: (s, prev) => events.push([prev, s.state])
  });
  return { svc, engine, input: () => captured, events, importMeetings, release };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("BotSessionService", () => {
  it("empieza en IDLE", () => {
    expect(harness().svc.current().state).toBe("IDLE");
  });

  it("join valida el enlace con la lista de permitidos", async () => {
    const h = harness();
    await expect(h.svc.join("https://zoom.us/j/1")).rejects.toMatchObject({ code: "URL_NOT_ALLOWED" });
    expect(h.engine.start).not.toHaveBeenCalled();
  });

  it("join devuelve de inmediato OPENING y luego llega a LISTENING", async () => {
    const h = harness();
    const s = await h.svc.join(URL_OK);
    expect(s.state).toBe("OPENING");
    expect(s.platform).toBe("GOOGLE_MEET");
    await flush();
    expect(h.svc.current().state).toBe("LISTENING");
    expect(h.input()).toMatchObject({
      meetingUrl: URL_OK,
      botDisplayName: "Bot",
      profileDir: "C:/profile",
      browserPath: "C:/brave.exe",
      headless: false
    });
  });

  it("no permite una segunda sesión mientras hay una activa", async () => {
    const h = harness();
    await h.svc.join(URL_OK);
    await expect(h.svc.join(URL_OK)).rejects.toMatchObject({ code: "BUSY" });
  });

  it("los estados del motor se reflejan (login y admisión)", async () => {
    const h = harness({ hold: true });
    await h.svc.join(URL_OK);
    await flush();
    h.input().onStatus("NEEDS_LOGIN", "inicia sesión");
    expect(h.svc.current()).toMatchObject({ state: "NEEDS_LOGIN", message: "inicia sesión" });
    h.input().onStatus("WAITING_ADMISSION", "espera");
    expect(h.svc.current().state).toBe("WAITING_ADMISSION");
    h.release();
    await flush();
    expect(h.svc.current().state).toBe("LISTENING");
  });

  it("si el motor falla al entrar: FAILED con el motivo y se aborta el navegador", async () => {
    const h = harness({ startFails: new Error("Nadie admitió al bot") });
    await h.svc.join(URL_OK);
    await flush();
    expect(h.svc.current()).toMatchObject({ state: "FAILED", error: "Nadie admitió al bot" });
    expect(h.engine.abort).toHaveBeenCalled();
    expect(h.importMeetings).not.toHaveBeenCalled();
    expect(h.svc.isActive()).toBe(false);
  });

  it("leave genera la reunión, la importa y termina en ENDED con el resultado", async () => {
    const h = harness();
    await h.svc.join(URL_OK);
    await flush();
    const s = await h.svc.leave();
    expect(s.state).toBe("ENDED");
    expect(s.result).toMatchObject({ imported: 1, utterances: 5, deliveryFile: "C:/out/reunion_x.json" });
    expect(h.engine.finalize).toHaveBeenCalledWith("sess-1", URL_OK, "C:/out");
    expect(h.importMeetings).toHaveBeenCalledTimes(1);
    expect(h.events.map((e) => e[1])).toEqual(["OPENING", "LISTENING", "ENDING", "ENDED"]);
  });

  it("el fin automático hace lo mismo que leave, una sola vez", async () => {
    const h = harness();
    await h.svc.join(URL_OK);
    await flush();
    h.input().onEnded("MEETING_ENDED_TEXT");
    h.input().onEnded("LEFT_ROOM");
    await flush();
    await flush();
    expect(h.svc.current().state).toBe("ENDED");
    expect(h.engine.finalize).toHaveBeenCalledTimes(1);
    expect(h.svc.current().result?.reason).toMatch(/termin/i);
  });

  it("sin transcripción no se importa y se explica", async () => {
    const h = harness({ utterances: 0 });
    h.engine.finalize = vi.fn(async () => ({ utterances: 0, deliveryFile: null }));
    await h.svc.join(URL_OK);
    await flush();
    const s = await h.svc.leave();
    expect(s.state).toBe("ENDED");
    expect(s.result).toMatchObject({ imported: 0, deliveryFile: null });
    expect(s.message).toMatch(/sin transcripci/i);
  });

  it("navegador cerrado sin transcripción es un fallo, no una reunión", async () => {
    const h = harness();
    h.engine.finalize = vi.fn(async () => ({ utterances: 0, deliveryFile: null }));
    await h.svc.join(URL_OK);
    await flush();
    h.input().onEnded("BROWSER_CLOSED");
    await flush();
    await flush();
    expect(h.svc.current().state).toBe("FAILED");
  });

  it("si finalize falla queda FAILED y se puede volver a entrar", async () => {
    const h = harness();
    h.engine.finalize = vi.fn(async () => { throw new Error("sin modelo"); });
    await h.svc.join(URL_OK);
    await flush();
    const s = await h.svc.leave();
    expect(s.state).toBe("FAILED");
    expect(s.error).toBe("sin modelo");
    await expect(h.svc.join(URL_OK)).resolves.toMatchObject({ state: "OPENING" });
  });

  it("leave sin sesión activa lanza NOT_ACTIVE", async () => {
    await expect(harness().svc.leave()).rejects.toMatchObject({ code: "NOT_ACTIVE" });
  });

  it("cancelar antes de entrar aborta el navegador y no genera reunión", async () => {
    const h = harness({ hold: true });
    await h.svc.join(URL_OK);
    await flush();
    const s = await h.svc.leave();
    expect(s.state).toBe("ENDED");
    expect(h.engine.abort).toHaveBeenCalled();
    expect(h.engine.finalize).not.toHaveBeenCalled();
    h.release();
    await flush();
    expect(h.svc.current().state).toBe("ENDED");
  });

  it("BotSessionError lleva su código", () => {
    expect(new BotSessionError("BUSY", "x").code).toBe("BUSY");
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd backend && npx vitest run src/desktop/tests/BotSessionService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Crear `BotSessionService.ts`**

```ts
import {
  BOT_PLATFORMS,
  DEFAULT_BOT_ALLOWED_DOMAINS,
  type BotPlatform,
  type BotSessionDto,
  type BotSessionState,
  type ImportBotMeetingsResultDto,
  type MeetingBotConfigDto
} from "@audio-to-text/shared";
import { checkMeetingUrl } from "./meetingUrlPolicy.js";

export type EndReason = "USER" | "LEFT_ROOM" | "MEETING_ENDED_TEXT" | "BROWSER_CLOSED" | "ALONE_TIMEOUT";
export type EngineState = "OPENING" | "NEEDS_LOGIN" | "WAITING_ADMISSION" | "LISTENING";

export interface BotEngineStartInput {
  meetingUrl: string;
  platform: BotPlatform;
  botDisplayName: string;
  autoRecord: boolean;
  headless: false;
  /** Ejecutable del navegador elegido en los ajustes (el mismo que usa el login). */
  browserPath: string;
  profileDir: string;
  onStatus: (state: EngineState, message: string) => void;
  onEnded: (reason: Exclude<EndReason, "USER">) => void;
}

export interface BotEngineResult {
  utterances: number;
  deliveryFile: string | null;
}

/** Puerto hacia el bot real; lo implementa desktop/src/botEngine.ts. */
export interface BotEngine {
  /** Entra a la sala; resuelve cuando el bot ya está escuchando. Devuelve el id de sesión del motor. */
  start(input: BotEngineStartInput): Promise<string>;
  finalize(sessionId: string, meetingUrl: string, outputDir: string): Promise<BotEngineResult>;
  /** Cierra el navegador sin generar nada. */
  abort(): Promise<void>;
}

export class BotSessionError extends Error {
  constructor(
    public readonly code: "BUSY" | "URL_NOT_ALLOWED" | "NOT_ACTIVE",
    message: string
  ) {
    super(message);
    this.name = "BotSessionError";
  }
}

export interface BotSessionServiceDeps {
  engine: BotEngine;
  getConfig: () => MeetingBotConfigDto;
  /** Ruta del navegador según la preferencia de los ajustes ('auto', 'brave', 'chrome', 'msedge'). */
  resolveBrowserPath: (preferred: string) => string;
  profileDir: string;
  outputDir: () => string;
  importMeetings: () => ImportBotMeetingsResultDto;
  onEvent?: (session: BotSessionDto, previous: BotSessionState) => void;
  now?: () => Date;
}

const ACTIVE: BotSessionState[] = ["OPENING", "NEEDS_LOGIN", "WAITING_ADMISSION", "LISTENING", "ENDING"];

const END_TEXT: Record<EndReason, string> = {
  USER: "Terminaste la reunión.",
  LEFT_ROOM: "El bot salió de la sala.",
  MEETING_ENDED_TEXT: "La reunión terminó.",
  BROWSER_CLOSED: "Se cerró el navegador del bot.",
  ALONE_TIMEOUT: "El bot se quedó solo en la sala y salió."
};

function idle(): BotSessionDto {
  return { state: "IDLE", message: "El bot no está en ninguna reunión.", meetingUrl: null, platform: null, startedAt: null, error: null, result: null };
}

export class BotSessionService {
  private session: BotSessionDto = idle();
  private engineSessionId: string | null = null;
  private startPromise: Promise<void> = Promise.resolve();
  private finishing: Promise<BotSessionDto> | null = null;
  private cancelled = false;

  constructor(private deps: BotSessionServiceDeps) {}

  public current(): BotSessionDto {
    return { ...this.session };
  }

  public isActive(): boolean {
    return ACTIVE.includes(this.session.state);
  }

  public async join(rawUrl: string): Promise<BotSessionDto> {
    if (this.isActive()) throw new BotSessionError("BUSY", "El bot ya está en una reunión. Termínala antes de entrar a otra.");
    const cfg = this.deps.getConfig();
    const check = checkMeetingUrl(rawUrl, {
      allowedPlatforms: cfg.botAllowedPlatforms ?? [...BOT_PLATFORMS],
      allowedDomains: cfg.botAllowedDomains ?? [...DEFAULT_BOT_ALLOWED_DOMAINS]
    });
    if (!check.ok) throw new BotSessionError("URL_NOT_ALLOWED", check.reason);

    this.engineSessionId = null;
    this.finishing = null;
    this.cancelled = false;
    this.session = {
      ...idle(),
      state: "IDLE",
      meetingUrl: check.url,
      platform: check.platform,
      startedAt: (this.deps.now ?? (() => new Date()))().toISOString()
    };
    this.setState("OPENING", "Abriendo el navegador…");
    this.startPromise = this.run(check.url, check.platform, cfg);
    return this.current();
  }

  public async leave(): Promise<BotSessionDto> {
    if (!this.isActive()) throw new BotSessionError("NOT_ACTIVE", "El bot no está en ninguna reunión.");
    if (this.engineSessionId === null) {
      // Todavía no entró: se cancela sin generar nada.
      this.cancelled = true;
      await this.deps.engine.abort().catch(() => {});
      this.setState("ENDED", "Cancelaste la entrada del bot.");
      this.session.result = { imported: 0, utterances: 0, deliveryFile: null, reason: "Cancelado antes de entrar." };
      return this.current();
    }
    return this.finish("USER");
  }

  /** Cierra la sesión activa al apagar la app. */
  public async dispose(): Promise<void> {
    if (this.isActive()) await this.leave().catch(() => {});
  }

  private async run(url: string, platform: BotPlatform, cfg: MeetingBotConfigDto): Promise<void> {
    try {
      const id = await this.deps.engine.start({
        meetingUrl: url,
        platform,
        botDisplayName: cfg.botDisplayName,
        autoRecord: cfg.botAutoRecord,
        headless: false,
        browserPath: this.deps.resolveBrowserPath(cfg.botPreferredBrowser),
        profileDir: this.deps.profileDir,
        onStatus: (state, message) => {
          if (this.cancelled || !this.isActive() || this.session.state === "ENDING") return;
          this.setState(state, message);
        },
        onEnded: (reason) => {
          void this.finish(reason);
        }
      });
      if (this.cancelled) return;
      this.engineSessionId = id;
      if (this.session.state !== "LISTENING" && this.isActive() && this.session.state !== "ENDING") {
        this.setState("LISTENING", "El bot está en la reunión y captando la conversación.");
      }
    } catch (err) {
      if (this.cancelled) return;
      await this.fail(err);
    }
  }

  private finish(reason: EndReason): Promise<BotSessionDto> {
    if (this.finishing) return this.finishing;
    this.finishing = (async () => {
      await this.startPromise.catch(() => {});
      if (!this.isActive() || this.engineSessionId === null) return this.current();
      this.setState("ENDING", "Generando la reunión…");
      try {
        const res = await this.deps.engine.finalize(this.engineSessionId, this.session.meetingUrl ?? "", this.deps.outputDir());
        if (reason === "BROWSER_CLOSED" && res.utterances === 0) {
          this.session.error = "El navegador se cerró antes de captar la reunión.";
          this.setState("FAILED", this.session.error);
          return this.current();
        }
        const imported = res.deliveryFile ? this.deps.importMeetings().imported : 0;
        this.session.result = { imported, utterances: res.utterances, deliveryFile: res.deliveryFile, reason: END_TEXT[reason] };
        this.setState(
          "ENDED",
          res.deliveryFile
            ? `${END_TEXT[reason]} La reunión ya está en tu biblioteca.`
            : `${END_TEXT[reason]} Terminó sin transcripción: no se creó la reunión en la biblioteca.`
        );
      } catch (err) {
        await this.fail(err);
      }
      return this.current();
    })();
    return this.finishing;
  }

  private async fail(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.deps.engine.abort().catch(() => {});
    this.session.error = message;
    this.setState("FAILED", message);
  }

  private setState(state: BotSessionState, message: string): void {
    const previous = this.session.state;
    this.session = { ...this.session, state, message };
    this.deps.onEvent?.(this.current(), previous);
  }
}
```

- [ ] **Step 4: Ejecutar tests y tsc**

Run: `cd backend && npx vitest run src/desktop/tests/BotSessionService.test.ts && npx tsc --noEmit`
Expected: 14 tests PASS, tsc limpio. Si algún test falla por orden de microtareas, ajusta `flush` en el test (no la lógica) a dos `await` encadenados; no cambies los asserts.

---

### Task 8: Avisos del escritorio y rutas HTTP (backend)

**Files:**
- Create: `backend/src/desktop/bot/botNotifications.ts`
- Create: `backend/src/desktop/http/routes/bot.routes.ts`
- Test: `backend/src/desktop/tests/BotNotifications.test.ts`
- Test: `backend/src/desktop/tests/BotRoutes.test.ts`

**Interfaces:**
- Consumes: `BotSessionService`, `BotSettingsStore`, `BotLoginService`, `BotSessionError`.
- Produces: `noticeFor(session, previous)`, `trayInfo(session)`, `createDesktopBotRoutes({ sessions, settings, login })`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/src/desktop/tests/BotNotifications.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { noticeFor, trayInfo } from "../bot/botNotifications.js";
import type { BotSessionDto } from "@audio-to-text/shared";

const s = (over: Partial<BotSessionDto>): BotSessionDto => ({
  state: "IDLE", message: "", meetingUrl: null, platform: null, startedAt: null, error: null, result: null, ...over
});

describe("noticeFor", () => {
  it("avisa cuando el bot entra a la reunión", () => {
    expect(noticeFor(s({ state: "LISTENING" }), "WAITING_ADMISSION")).toMatchObject({ title: expect.stringMatching(/entró/i) });
  });
  it("avisa cuando necesita iniciar sesión", () => {
    expect(noticeFor(s({ state: "NEEDS_LOGIN", message: "x" }), "OPENING")).toMatchObject({ title: expect.stringMatching(/sesión/i) });
  });
  it("avisa que la reunión quedó guardada con el resultado", () => {
    const n = noticeFor(s({ state: "ENDED", message: "fin", result: { imported: 1, utterances: 4, deliveryFile: "a", reason: "r" } }), "ENDING");
    expect(n?.title).toMatch(/guardada/i);
    expect(n?.body).toMatch(/biblioteca/i);
  });
  it("si terminó sin transcripción usa el mensaje de la sesión", () => {
    const n = noticeFor(s({ state: "ENDED", message: "Terminó sin transcripción", result: { imported: 0, utterances: 0, deliveryFile: null, reason: "r" } }), "ENDING");
    expect(n?.body).toBe("Terminó sin transcripción");
  });
  it("avisa los fallos con el motivo", () => {
    expect(noticeFor(s({ state: "FAILED", error: "Nadie admitió al bot" }), "WAITING_ADMISSION")).toMatchObject({ body: "Nadie admitió al bot" });
  });
  it("no avisa si el estado no cambió ni en estados intermedios", () => {
    expect(noticeFor(s({ state: "LISTENING" }), "LISTENING")).toBeNull();
    expect(noticeFor(s({ state: "WAITING_ADMISSION" }), "OPENING")).toBeNull();
    expect(noticeFor(s({ state: "ENDING" }), "LISTENING")).toBeNull();
  });
});

describe("trayInfo", () => {
  it("permite terminar solo con sesión activa y describe el estado", () => {
    expect(trayInfo(s({ state: "LISTENING" }))).toMatchObject({ canLeave: true, tooltip: expect.stringMatching(/escuchando/i) });
    expect(trayInfo(s({ state: "IDLE" }))).toMatchObject({ canLeave: false });
    expect(trayInfo(s({ state: "ENDED" })).canLeave).toBe(false);
  });
});
```

`backend/src/desktop/tests/BotRoutes.test.ts`:

```ts
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDesktopBotRoutes } from "../http/routes/bot.routes.js";
import { BotSessionService, type BotEngine } from "../bot/BotSessionService.js";
import { BotSettingsStore } from "../bot/BotSettingsStore.js";
import { resolveBotPaths } from "../bot/BotPaths.js";
import { errorHandler } from "../../interfaces/http/middlewares/errorHandler.js";

describe("bot.routes (escritorio)", () => {
  let dir: string;
  let server: http.Server;
  let base: string;
  let engine: BotEngine;
  let login: any;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "botroutes-"));
    const paths = resolveBotPaths(dir);
    const settings = new BotSettingsStore(paths);
    engine = {
      start: vi.fn(async (i) => { i.onStatus("LISTENING", "ok"); return "s1"; }),
      finalize: vi.fn(async () => ({ utterances: 3, deliveryFile: "C:/out/r.json" })),
      abort: vi.fn(async () => {})
    };
    const sessions = new BotSessionService({
      engine,
      getConfig: () => settings.get(),
      resolveBrowserPath: () => "C:/brave.exe",
      profileDir: paths.profileDir,
      outputDir: () => settings.effectiveOutputDir(),
      importMeetings: () => ({ imported: 1, alreadyImported: 0, failed: [], folderMissing: false, folder: "C:/out" })
    });
    login = {
      openLoginBrowser: vi.fn(() => ({ success: true, message: "abierto" })),
      verify: vi.fn(async () => ({ linked: true, email: "a@b.com", message: "ok" })),
      unlink: vi.fn(() => ({ success: true, message: "borrado" })),
      lastCheck: vi.fn(() => null),
      browserInfo: vi.fn(() => ({ name: "Brave", path: "C:/brave.exe" }))
    };
    const app = express();
    app.use(express.json());
    app.use("/bot", createDesktopBotRoutes({ sessions, settings, login }));
    app.use(errorHandler);
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as any).port}/bot`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const call = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(base + p, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  const flush = () => new Promise((r) => setTimeout(r, 5));

  it("GET /session devuelve IDLE al inicio", async () => {
    const r = await call("GET", "/session");
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe("IDLE");
  });

  it("POST /join con enlace válido responde la sesión y luego queda escuchando", async () => {
    const r = await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe("OPENING");
    await flush();
    expect((await call("GET", "/session")).json.data.state).toBe("LISTENING");
  });

  it("POST /join con enlace no permitido responde 400 con el motivo", async () => {
    const r = await call("POST", "/join", { url: "https://zoom.us/j/1" });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/zoom/i);
  });

  it("POST /join sin url responde 400", async () => {
    expect((await call("POST", "/join", {})).status).toBe(400);
  });

  it("POST /join con el bot ocupado responde 409", async () => {
    await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    const r = await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    expect(r.status).toBe(409);
  });

  it("POST /leave termina y devuelve ENDED; sin sesión responde 409", async () => {
    expect((await call("POST", "/leave")).status).toBe(409);
    await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    await flush();
    const r = await call("POST", "/leave");
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe("ENDED");
  });

  it("login, verify y unlink responden; con el bot ocupado responden 409", async () => {
    expect((await call("POST", "/login")).json.message).toBe("abierto");
    expect((await call("POST", "/login/verify")).json.data).toMatchObject({ linked: true, email: "a@b.com" });
    expect((await call("POST", "/unlink")).json.message).toBe("borrado");

    await call("POST", "/join", { url: "https://meet.google.com/abc-defg-hij" });
    await flush();
    for (const p of ["/login", "/login/verify", "/unlink"]) {
      expect((await call("POST", p)).status).toBe(409);
    }
  });

  it("GET /status mantiene la forma que ya usa la interfaz", async () => {
    const r = await call("GET", "/status");
    expect(r.json.data).toMatchObject({
      isGoogleAccountLinked: false,
      loginChecked: false,
      detectedBrowserName: "Brave",
      isMeetingActive: false
    });
    expect(r.json.data.config.botAllowedDomains).toContain("meet.google.com");
  });

  it("PUT /config persiste y normaliza la lista de permitidos", async () => {
    const r = await call("PUT", "/config", { botAllowedDomains: ["Meet.Google.com", "meet.google.com"], botAllowedPlatforms: ["GOOGLE_MEET"] });
    expect(r.status).toBe(200);
    expect(r.json.data.botAllowedDomains).toEqual(["meet.google.com"]);
    expect((await call("GET", "/config")).json.data.botAllowedPlatforms).toEqual(["GOOGLE_MEET"]);
  });

  it("PUT /config rechaza plataformas inválidas con 400", async () => {
    expect((await call("PUT", "/config", { botAllowedPlatforms: ["ZOOM"] })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd backend && npx vitest run src/desktop/tests/BotNotifications.test.ts src/desktop/tests/BotRoutes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Crear `botNotifications.ts`**

```ts
import type { BotSessionDto, BotSessionState } from "@audio-to-text/shared";

export interface BotNotice {
  title: string;
  body: string;
}

/** Aviso del sistema para una transición de estado; null si no merece aviso. */
export function noticeFor(session: BotSessionDto, previous: BotSessionState): BotNotice | null {
  if (session.state === previous) return null;
  switch (session.state) {
    case "LISTENING":
      return { title: "El bot entró a la reunión", body: "Ya está captando la conversación." };
    case "NEEDS_LOGIN":
      return { title: "El bot necesita iniciar sesión", body: session.message };
    case "ENDED":
      return session.result && session.result.imported > 0
        ? { title: "Reunión guardada", body: "Ya está en tu biblioteca." }
        : { title: "La reunión terminó", body: session.message };
    case "FAILED":
      return { title: "El bot no pudo completar la reunión", body: session.error ?? session.message };
    default:
      return null;
  }
}

const TRAY_LABEL: Record<BotSessionState, string> = {
  IDLE: "Bot en espera",
  OPENING: "Bot abriendo el navegador",
  NEEDS_LOGIN: "Bot necesita iniciar sesión",
  WAITING_ADMISSION: "Bot esperando que lo admitan",
  LISTENING: "Bot escuchando la reunión",
  ENDING: "Bot generando la reunión",
  ENDED: "Reunión guardada",
  FAILED: "El bot falló"
};

export function trayInfo(session: BotSessionDto): { tooltip: string; canLeave: boolean } {
  const label = TRAY_LABEL[session.state];
  const canLeave = ["OPENING", "NEEDS_LOGIN", "WAITING_ADMISSION", "LISTENING"].includes(session.state);
  return { tooltip: `Audio2Text — ${label}`, canLeave };
}
```

- [ ] **Step 4: Crear `bot.routes.ts` (escritorio)**

```ts
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BOT_PLATFORMS, type MeetingBotStatusDto } from "@audio-to-text/shared";
import { BotSessionError, type BotSessionService } from "../../bot/BotSessionService.js";
import type { BotSettingsStore } from "../../bot/BotSettingsStore.js";
import type { BotLoginService } from "../../bot/BotLoginService.js";

const JoinSchema = z.object({ url: z.string().min(1).max(2000) });

const ConfigSchema = z.object({
  botDisplayName: z.string().min(1).max(100).optional(),
  botAvatarUrl: z.string().min(1).optional(),
  botPreferredBrowser: z.enum(["auto", "brave", "chrome", "msedge"]).optional(),
  botGoogleAccountEmail: z.string().optional(),
  botAutoRecord: z.boolean().optional(),
  botMuteOnJoin: z.boolean().optional(),
  botGenerateDocx: z.boolean().optional(),
  botGenerateExcel: z.boolean().optional(),
  botDefaultPlatform: z.enum(["AUTO", "GOOGLE_MEET", "MICROSOFT_TEAMS", "ZOOM"]).optional(),
  botLanguage: z.string().optional(),
  botOutputDir: z.string().max(500).optional(),
  botAllowedPlatforms: z.array(z.enum(BOT_PLATFORMS as unknown as [string, ...string[]])).optional(),
  botAllowedDomains: z.array(z.string().max(255)).max(50).optional()
});

export interface DesktopBotRoutesDeps {
  sessions: BotSessionService;
  settings: BotSettingsStore;
  login: BotLoginService;
}

export function createDesktopBotRoutes(deps: DesktopBotRoutesDeps): Router {
  const router = Router();
  const { sessions, settings, login } = deps;

  const fail = (res: Response, err: unknown, next: NextFunction) => {
    if (err instanceof BotSessionError) {
      const status = err.code === "URL_NOT_ALLOWED" ? 400 : 409;
      return res.status(status).json({ success: false, error: err.message, code: err.code });
    }
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.issues.map((i) => i.message).join("; ") });
    }
    return next(err);
  };

  const busy = (res: Response): boolean => {
    if (!sessions.isActive()) return false;
    res.status(409).json({ success: false, error: "El bot está en una reunión. Termínala antes de cambiar la sesión de Google.", code: "BUSY" });
    return true;
  };

  router.get("/session", (_req, res) => {
    res.json({ success: true, data: sessions.current() });
  });

  router.post("/join", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = JoinSchema.parse(req.body ?? {});
      res.json({ success: true, data: await sessions.join(url) });
    } catch (err) {
      fail(res, err, next);
    }
  });

  router.post("/leave", async (_req, res, next) => {
    try {
      res.json({ success: true, data: await sessions.leave() });
    } catch (err) {
      fail(res, err, next);
    }
  });

  router.get("/status", (_req, res) => {
    const config = settings.get();
    const browser = login.browserInfo();
    const check = login.lastCheck();
    const session = sessions.current();
    const data: MeetingBotStatusDto = {
      config,
      isGoogleAccountLinked: check?.linked ?? false,
      linkedGoogleEmail: check?.email ?? null,
      loginChecked: check !== null,
      detectedBrowserName: browser.name,
      detectedBrowserPath: browser.path,
      isMeetingActive: sessions.isActive(),
      activeSessionId: null,
      activeMeetingUrl: sessions.isActive() ? session.meetingUrl : null
    };
    res.json({ success: true, data });
  });

  router.get("/config", (_req, res) => {
    res.json({ success: true, data: settings.get() });
  });

  router.put("/config", (req, res, next) => {
    try {
      const parsed = ConfigSchema.parse(req.body ?? {});
      res.json({ success: true, data: settings.update(parsed as Parameters<BotSettingsStore["update"]>[0]) });
    } catch (err) {
      fail(res, err, next);
    }
  });

  router.post("/login", (_req, res) => {
    if (busy(res)) return;
    try {
      res.json({ success: true, message: login.openLoginBrowser().message });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.post("/login/verify", async (_req, res, next) => {
    if (busy(res)) return;
    try {
      res.json({ success: true, data: await login.verify() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/unlink", (_req, res) => {
    if (busy(res)) return;
    res.json({ success: true, message: login.unlink().message });
  });

  return router;
}
```

- [ ] **Step 5: Ejecutar tests y tsc**

Run: `cd backend && npx vitest run src/desktop/tests/BotNotifications.test.ts src/desktop/tests/BotRoutes.test.ts && npx tsc --noEmit`
Expected: 17 tests PASS, tsc limpio. Si `errorHandler` responde de otra forma ante un `ZodError`, el test "sin url responde 400" ya lo cubre por el `fail` local; no cambies el `errorHandler`.

---

### Task 9: Cableado del backend de escritorio

**Files:**
- Modify: `backend/src/desktop/composition-root.desktop.ts`
- Modify: `backend/src/desktop/http/desktop.routes.ts`
- Modify: `backend/src/desktop/server.ts`
- Test: `backend/src/desktop/tests/BotWiring.test.ts`

**Interfaces:**
- Consumes: Tasks 5-8.
- Produces:
  - `StartDesktopServerOptions` ampliado con `botEngine: BotEngine`, `locateBrowser(preferred): string`, `browserDisplayName(path): string`, `probeAccount(input): Promise<{url; text}>`, `killBotBrowser(): void`, `onBotEvent?(session, previous): void`.
  - `DesktopServerInstance.bot: { current(): BotSessionDto; leave(): Promise<BotSessionDto>; isActive(): boolean }`.

- [ ] **Step 1: Escribir el test que falla**

`backend/src/desktop/tests/BotWiring.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { startDesktopServer, type DesktopServerInstance } from "../server.js";
import { InMemorySecretVault } from "../infrastructure/settings/ISecretVault.js";

describe("cableado del bot en el servidor de escritorio", () => {
  let server: DesktopServerInstance | null = null;
  let dir = "";
  afterEach(async () => {
    await server?.close();
    server = null;
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("expone /api/desktop/bot/session con autenticación y estado IDLE", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "botwire-"));
    const events: string[] = [];
    server = await startDesktopServer({
      userDataDir: dir,
      resourcesDir: dir,
      vault: new InMemorySecretVault(),
      launchToken: "tok",
      botEngine: {
        start: async () => "s",
        finalize: async () => ({ utterances: 0, deliveryFile: null }),
        abort: async () => {}
      },
      locateBrowser: () => "C:/brave.exe",
      browserDisplayName: () => "Brave",
      probeAccount: async () => ({ url: "https://myaccount.google.com/", text: "" }),
      killBotBrowser: () => {},
      onBotEvent: (s) => events.push(s.state)
    });
    const base = `http://127.0.0.1:${server.port}/api/desktop/bot`;

    const noAuth = await fetch(`${base}/session`);
    expect(noAuth.status).toBe(401);

    const ok = await fetch(`${base}/session`, { headers: { Cookie: "accessToken=tok" } });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).data.state).toBe("IDLE");
    expect(server.bot.isActive()).toBe(false);
  });
});
```

(Si el middleware de autenticación acepta el token por otra vía distinta de la cookie `accessToken`, ajusta solo la cabecera del test; la cookie `accessToken` es la que inyecta `main.ts`.)

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd backend && npx vitest run src/desktop/tests/BotWiring.test.ts`
Expected: FAIL (opciones y propiedad `bot` inexistentes).

- [ ] **Step 3: `composition-root.desktop.ts`**

(a) Añadir imports de `resolveBotPaths`, `BotSettingsStore`, `BotLoginService`, `BotSessionService` (y tipos `BotEngine`, `BotLoginDeps`, `BotSessionDto`, `BotSessionState` de `@audio-to-text/shared`/`BotSessionService`) y quitar el import de `resolveBotOutputDir`.

(b) Ampliar `DesktopContainerOptions` (la interfaz que ya recibe `userDataDir, resourcesDir, vault, launchToken`) con los campos opcionales del bot:

```ts
  botEngine: BotEngine;
  locateBrowser: (preferred: string) => string;
  browserDisplayName: (browserPath: string) => string;
  probeAccount: BotLoginDeps["probeAccount"];
  killBotBrowser: () => void;
  onBotEvent?: (session: BotSessionDto, previous: BotSessionState) => void;
```

(c) Sustituir la línea de `importBotMeetings` y añadir los servicios (después de crear `db`):

```ts
  const botPaths = resolveBotPaths(userDataDir);
  const botSettings = new BotSettingsStore(botPaths);
  const importBotMeetings = new ImportBotMeetings(db, () => botSettings.effectiveOutputDir());
  const botLogin = new BotLoginService({
    paths: botPaths,
    getPreferredBrowser: () => botSettings.get().botPreferredBrowser,
    locateBrowser: options.locateBrowser,
    displayName: options.browserDisplayName,
    probeAccount: options.probeAccount,
    killBotBrowser: options.killBotBrowser
  });
  const botSessions = new BotSessionService({
    engine: options.botEngine,
    getConfig: () => botSettings.get(),
    resolveBrowserPath: options.locateBrowser,
    profileDir: botPaths.profileDir,
    outputDir: () => botSettings.effectiveOutputDir(),
    importMeetings: () => importBotMeetings.execute(),
    onEvent: options.onBotEvent
  });
```

(d) Añadir `botSettings`, `botLogin`, `botSessions` al objeto que devuelve el contenedor. En `container.close()` (o donde se cierre) llamar `await botSessions.dispose()` antes de cerrar la base de datos.

- [ ] **Step 4: `desktop.routes.ts`**

Añadir a `DesktopRoutesDeps`: `botSessions: BotSessionService; botSettings: BotSettingsStore; botLogin: BotLoginService;` (con sus imports de tipo). Sustituir `router.use("/bot", createBotRoutes());` por `router.use("/bot", createDesktopBotRoutes({ sessions: deps.botSessions, settings: deps.botSettings, login: deps.botLogin }));` e importar `createDesktopBotRoutes` de `./routes/bot.routes.js`; quitar el import de `createBotRoutes`.

- [ ] **Step 5: `server.ts`**

Ampliar `StartDesktopServerOptions` con los mismos campos que `DesktopContainerOptions` (todos obligatorios salvo `onBotEvent`), pasarlos a `createDesktopContainer`, pasar `botSessions`, `botSettings`, `botLogin` a `createDesktopRoutes`, y ampliar `DesktopServerInstance`:

```ts
export interface DesktopServerInstance {
  port: number;
  close: () => Promise<void>;
  bot: {
    current: () => BotSessionDto;
    isActive: () => boolean;
    leave: () => Promise<BotSessionDto>;
  };
}
```

con `bot: { current: () => container.botSessions.current(), isActive: () => container.botSessions.isActive(), leave: () => container.botSessions.leave() }` en el objeto devuelto. La importación al arrancar (`setImmediate`) queda igual.

- [ ] **Step 6: Actualizar otros llamadores**

Run: `cd backend && npx tsc --noEmit`
Si algún test existente que llama a `startDesktopServer` o `createDesktopContainer` falla por las opciones nuevas (por ejemplo `LibraryServer.test.ts`), añadir en ese test el mismo bloque de opciones falsas que usa `BotWiring.test.ts` (`botEngine`, `locateBrowser`, `browserDisplayName`, `probeAccount`, `killBotBrowser`). No hagas opcionales los campos para esquivar el error.

- [ ] **Step 7: Ejecutar la suite del backend**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: tsc limpio; todo en verde (470 anteriores + los nuevos de las Tasks 5-9).

---

### Task 10: Motor real, bandeja y notificaciones en Electron

**Files:**
- Create: `desktop/src/botEngine.ts`
- Create: `desktop/src/botTray.ts`
- Modify: `desktop/src/main.ts`
- Modify: `desktop/tsconfig.json`
- Modify: `desktop/scripts/build-main.mjs` (solo si el bundle de puppeteer lo exige, ver Step 5)
- Modify: `desktop/electron-builder.yml` (copiar `build/icon.png` a resources para la bandeja, ver Step 5b)

**Interfaces:**
- Consumes: `BotEngine` y tipos de `backend/src/desktop/bot/BotSessionService.ts`, `AutonomousMeetingBotService` y demás clases del bot, `noticeFor`/`trayInfo`, `startDesktopServer` ampliado.
- Produces: `createBotEngine(deps)`, `createBotTray(deps)`; `main.ts` con bandeja, notificaciones, ocultar a la bandeja y cierre ordenado.

(Este paquete no tiene vitest; la lógica con riesgo está cubierta en las Tasks 2-9. Aquí se verifica con `tsc` y con el build.)

- [ ] **Step 1: `desktop/tsconfig.json`**

Añadir `"lib": ["ES2022", "DOM"]` dentro de `compilerOptions` (el código del bot usa `document` dentro de `page.evaluate`).

- [ ] **Step 2: Crear `desktop/src/botEngine.ts`**

```ts
import path from "node:path";
import { AutonomousMeetingBotService } from "../../algorithm-manager-bot/src/application/AutonomousMeetingBotService.js";
import { MeetingClassifierLlmService } from "../../algorithm-manager-bot/src/infrastructure/ai/MeetingClassifierLlmService.js";
import { CommercialProposalLlmService } from "../../algorithm-manager-bot/src/infrastructure/ai/CommercialProposalLlmService.js";
import { MeetingSummaryLlmService } from "../../algorithm-manager-bot/src/infrastructure/ai/MeetingSummaryLlmService.js";
import { LlmClientFactory } from "../../algorithm-manager-bot/src/infrastructure/ai/LlmClientFactory.js";
import type { BotEngine, BotEngineStartInput } from "../../backend/src/desktop/bot/BotSessionService.js";
import type { ISecretVault } from "../../backend/src/desktop/infrastructure/settings/ISecretVault.js";

/** Crea el caller del LLM con las claves de la bóveda (Gemini primero, luego OpenAI) o las variables de entorno. */
async function createLlmCaller(vault: ISecretVault) {
  const gemini = await vault.get("gemini");
  if (gemini) return LlmClientFactory.createCaller({ provider: "gemini", apiKey: gemini });
  const openai = await vault.get("openai");
  if (openai) return LlmClientFactory.createCaller({ provider: "openai", apiKey: openai });
  return LlmClientFactory.createCaller();
}

export function createBotEngine(vault: ISecretVault): BotEngine {
  let service: AutonomousMeetingBotService | null = null;
  // Cada start() toma una época; abort() la invalida, así un start cancelado en vuelo
  // cierra lo suyo en vez de dejar un navegador huérfano dentro de la reunión.
  let epoch = 0;
  const CANCELLED = "La entrada del bot fue cancelada.";

  return {
    async start(input: BotEngineStartInput): Promise<string> {
      const myEpoch = ++epoch;
      const callLlm = await createLlmCaller(vault);
      if (myEpoch !== epoch) throw new Error(CANCELLED);

      const mine = new AutonomousMeetingBotService(
        new MeetingClassifierLlmService(callLlm),
        new CommercialProposalLlmService(callLlm),
        undefined,
        undefined,
        new MeetingSummaryLlmService(callLlm)
      );
      service = mine;
      const id = await mine.startAutonomousMeeting({
        meetingUrl: input.meetingUrl,
        headless: input.headless,
        settings: { botDisplayName: input.botDisplayName, autoRecord: input.autoRecord },
        profileDir: input.profileDir,
        chromePath: input.browserPath,
        onStatus: input.onStatus,
        onEnded: input.onEnded
      });
      if (myEpoch !== epoch) {
        await mine.abort().catch(() => {});
        throw new Error(CANCELLED);
      }
      return id;
    },

    async finalize(sessionId, meetingUrl, outputDir) {
      if (!service) throw new Error("No hay una sesión de bot activa.");
      const record = await service.finalizeAndGenerateDeliverables(sessionId, meetingUrl, path.resolve(outputDir));
      service = null;
      return { utterances: record.utterancesCount, deliveryFile: record.deliveryFilePath ?? null };
    },

    async abort() {
      epoch++;
      const current = service;
      service = null;
      await current?.abort();
    }
  };
}
```

- [ ] **Step 3: Crear `desktop/src/botTray.ts`**

```ts
import path from "node:path";
import { Menu, Notification, Tray, nativeImage } from "electron";
import type { BotSessionDto, BotSessionState } from "@audio-to-text/shared";
import { noticeFor, trayInfo } from "../../backend/src/desktop/bot/botNotifications.js";

export interface BotTrayDeps {
  iconPath: string;
  showWindow: () => void;
  leaveMeeting: () => Promise<unknown>;
  quit: () => void;
}

export interface BotTray {
  /** Se llama en cada cambio de estado del bot: avisa y actualiza la bandeja. */
  onBotEvent: (session: BotSessionDto, previous: BotSessionState) => void;
  destroy: () => void;
}

export function createBotTray(deps: BotTrayDeps): BotTray {
  let tray: Tray | null = null;

  try {
    tray = new Tray(nativeImage.createFromPath(path.resolve(deps.iconPath)));
    tray.on("click", deps.showWindow);
  } catch (err) {
    // Sin bandeja disponible solo se omiten el icono y el menú; las notificaciones siguen.
    console.warn("[Bot] No se pudo crear el icono de la bandeja:", err);
    tray = null;
  }

  const refresh = (session: BotSessionDto) => {
    if (!tray) return;
    const info = trayInfo(session);
    tray.setToolTip(info.tooltip);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: info.tooltip, enabled: false },
        { type: "separator" },
        { label: "Terminar reunión", enabled: info.canLeave, click: () => void deps.leaveMeeting() },
        { label: "Abrir app", click: deps.showWindow },
        { type: "separator" },
        { label: "Salir", click: deps.quit }
      ])
    );
  };

  refresh({ state: "IDLE", message: "", meetingUrl: null, platform: null, startedAt: null, error: null, result: null });

  return {
    onBotEvent(session, previous) {
      refresh(session);
      const notice = noticeFor(session, previous);
      if (notice && Notification.isSupported()) {
        const n = new Notification({ title: notice.title, body: notice.body });
        n.on("click", deps.showWindow);
        n.show();
      }
    },
    destroy() {
      tray?.destroy();
      tray = null;
    }
  };
}
```

- [ ] **Step 4: Modificar `desktop/src/main.ts`**

(a) Imports nuevos: `createBotEngine` (`./botEngine.js`), `createBotTray` (`./botTray.js`), `BotTray`, y de `BrowserLauncher` (`../../algorithm-manager-bot/src/infrastructure/connectors/live/BrowserLauncher.js`), `puppeteer` (`puppeteer-core`) para la sonda.

(b) Variables de módulo: `let botTray: BotTray | null = null;` y `let isQuitting = false;`.

(c) En `bootstrap`, antes de `startDesktopServer`, crear la bandeja (la ventana aún no existe, así que `showWindow` usa `mainWindow` por referencia perezosa):

```ts
  botTray = createBotTray({
    // En desarrollo el icono está en desktop/build; empaquetado va en resources (extraResources).
    iconPath: app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(__dirname, "../build/icon.png"),
    showWindow: () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    },
    leaveMeeting: () => (desktopServer ? desktopServer.bot.leave() : Promise.resolve()),
    quit: () => app.quit()
  });
```

y pasar a `startDesktopServer` las opciones nuevas:

```ts
    botEngine: createBotEngine(vault),
    locateBrowser: (preferred) => BrowserLauncher.findSystemBrowserExecutable(preferred),
    browserDisplayName: (p) => BrowserLauncher.getBrowserDisplayName(p),
    killBotBrowser: () => BrowserLauncher.killOrphanedBotChrome(),
    probeAccount: async ({ profileDir, browserPath }) => {
      BrowserLauncher.cleanStaleLocks(profileDir);
      const browser = await puppeteer.launch({
        executablePath: browserPath,
        headless: true,
        userDataDir: profileDir,
        args: ["--no-first-run", "--no-default-browser-check"]
      });
      try {
        const page = await browser.newPage();
        await page.goto("https://myaccount.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
        await new Promise((r) => setTimeout(r, 2000));
        const text = await page.evaluate(() => document.body?.innerText ?? "");
        return { url: page.url(), text };
      } finally {
        await browser.close().catch(() => {});
      }
    },
    onBotEvent: (session, previous) => botTray?.onBotEvent(session, previous)
```

(d) Ocultar a la bandeja: tras crear `mainWindow`, añadir

```ts
  mainWindow.on("close", (event) => {
    if (!isQuitting && desktopServer?.bot.isActive()) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
```

(e) Cierre ordenado: en `app.on("before-quit", …)` poner `isQuitting = true;` al inicio y, antes de `serverToClose.close()`, terminar la sesión activa con un tope de 90 s:

```ts
    if (serverToClose.bot.isActive()) {
      await Promise.race([
        serverToClose.bot.leave().catch(() => {}),
        new Promise((r) => setTimeout(r, 90_000))
      ]);
    }
    botTray?.destroy();
    botTray = null;
```

(f) `second-instance`: usar `mainWindow.show()` además de `restore()`/`focus()`.

- [ ] **Step 5: Compilar y comprobar el bundle**

Run: `cd desktop && npx tsc --noEmit && npm run build`
Expected: tsc limpio y `[build-main] Compilación completada con éxito`. Si esbuild falla por módulos opcionales de `puppeteer-core` (por ejemplo `bufferutil`, `utf-8-validate`, `chromium-bidi`), añadirlos al arreglo `external` de `desktop/scripts/build-main.mjs` y comprobar con `node -e "require('./dist/main.cjs')"` que NO falla por `Cannot find module 'puppeteer-core'` (el error esperado es el de `electron`, que no existe fuera de Electron). `forbiddenModules` no debe cambiar.

- [ ] **Step 5b: Icono de la bandeja en el instalador**

`electron-builder.yml` solo empaqueta `dist/**`. Añadir (o ampliar si ya existe) la clave `extraResources` con `- from: build/icon.png` y `to: icon.png`, de modo que `process.resourcesPath/icon.png` exista en la app instalada. Comprueba que la sintaxis YAML sea válida releyendo el archivo; no cambies el resto de la configuración.

- [ ] **Step 6: Verificar contenido del bundle**

Run: `cd .. && grep -c "myaccount.google.com" desktop/dist/main.cjs && grep -c "WAITING_ADMISSION" desktop/dist/main.cjs`
Expected: ambos ≥ 1.

---

### Task 11: Interfaz (Ajustes → bot)

**Files:**
- Create: `frontend/src/features/bot/botSessionView.ts`
- Create: `frontend/src/features/bot/useBotSession.ts`
- Create: `frontend/src/features/bot/LiveMeetingCard.tsx`
- Create: `frontend/src/features/bot/AllowedSitesEditor.tsx`
- Modify: `frontend/src/pages/settings/components/MeetingBotSettingsSection.tsx`
- Test: `frontend/src/tests/botSessionView.test.ts`

**Interfaces:**
- Consumes: `BotSessionDto`, `BotLoginCheckDto`, `MeetingBotConfigDto`, `MeetingBotStatusDto` de `@audio-to-text/shared`; `api` de `../../lib/api.js`.
- Produces: `stepIndexFor(state)`, `isActiveState(state)`, `canJoin(state)`, `describeState(state)`, `parseDomainInput(text)`, `useBotSession()`, `LiveMeetingCard`, `AllowedSitesEditor`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/tests/botSessionView.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stepIndexFor, isActiveState, canJoin, describeState, parseDomainInput } from "../features/bot/botSessionView.js";

describe("botSessionView", () => {
  it("ubica cada estado en el paso del asistente", () => {
    expect(stepIndexFor("OPENING")).toBe(0);
    expect(stepIndexFor("NEEDS_LOGIN")).toBe(0);
    expect(stepIndexFor("WAITING_ADMISSION")).toBe(1);
    expect(stepIndexFor("LISTENING")).toBe(2);
    expect(stepIndexFor("ENDING")).toBe(3);
    expect(stepIndexFor("ENDED")).toBe(3);
    expect(stepIndexFor("IDLE")).toBe(-1);
    expect(stepIndexFor("FAILED")).toBe(-1);
  });

  it("isActiveState es true solo mientras el bot está en curso", () => {
    for (const s of ["OPENING", "NEEDS_LOGIN", "WAITING_ADMISSION", "LISTENING", "ENDING"] as const) {
      expect(isActiveState(s)).toBe(true);
    }
    for (const s of ["IDLE", "ENDED", "FAILED"] as const) expect(isActiveState(s)).toBe(false);
  });

  it("canJoin exige enlace no vacío y bot libre", () => {
    expect(canJoin("IDLE", "https://meet.google.com/a")).toBe(true);
    expect(canJoin("ENDED", " https://meet.google.com/a ")).toBe(true);
    expect(canJoin("IDLE", "   ")).toBe(false);
    expect(canJoin("LISTENING", "https://meet.google.com/a")).toBe(false);
  });

  it("describeState da etiqueta y color de cada estado", () => {
    expect(describeState("LISTENING")).toEqual({ label: "Escuchando", color: "success" });
    expect(describeState("FAILED")).toEqual({ label: "Falló", color: "error" });
    expect(describeState("NEEDS_LOGIN").color).toBe("warning");
    expect(describeState("IDLE").color).toBe("default");
  });

  it("parseDomainInput limpia lo que escribe el usuario y rechaza lo inválido", () => {
    expect(parseDomainInput(" https://Meet.Google.com/abc ")).toBe("meet.google.com");
    expect(parseDomainInput("teams.live.com")).toBe("teams.live.com");
    expect(parseDomainInput("no es dominio")).toBeNull();
    expect(parseDomainInput("")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `cd frontend && npx vitest run src/tests/botSessionView.test.ts`
Expected: FAIL.

- [ ] **Step 3: Crear `botSessionView.ts`**

```ts
import type { BotSessionState } from "@audio-to-text/shared";

export const STEPS = ["Abriendo navegador", "Esperando admisión", "Escuchando", "Guardando reunión"] as const;

const STEP_BY_STATE: Partial<Record<BotSessionState, number>> = {
  OPENING: 0,
  NEEDS_LOGIN: 0,
  WAITING_ADMISSION: 1,
  LISTENING: 2,
  ENDING: 3,
  ENDED: 3
};

/** Paso del asistente para un estado; -1 si no corresponde a ninguno. */
export function stepIndexFor(state: BotSessionState): number {
  return STEP_BY_STATE[state] ?? -1;
}

export function isActiveState(state: BotSessionState): boolean {
  return ["OPENING", "NEEDS_LOGIN", "WAITING_ADMISSION", "LISTENING", "ENDING"].includes(state);
}

export function canJoin(state: BotSessionState, url: string): boolean {
  return !isActiveState(state) && url.trim().length > 0;
}

type ChipColor = "default" | "info" | "warning" | "success" | "error";

const DESCRIPTIONS: Record<BotSessionState, { label: string; color: ChipColor }> = {
  IDLE: { label: "En espera", color: "default" },
  OPENING: { label: "Abriendo navegador", color: "info" },
  NEEDS_LOGIN: { label: "Necesita iniciar sesión", color: "warning" },
  WAITING_ADMISSION: { label: "Esperando admisión", color: "warning" },
  LISTENING: { label: "Escuchando", color: "success" },
  ENDING: { label: "Guardando reunión", color: "info" },
  ENDED: { label: "Terminada", color: "success" },
  FAILED: { label: "Falló", color: "error" }
};

export function describeState(state: BotSessionState): { label: string; color: ChipColor } {
  return DESCRIPTIONS[state];
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Convierte lo escrito (con o sin https:// y ruta) en un dominio limpio, o null si no lo es. */
export function parseDomainInput(text: string): string | null {
  const host = text.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0] ?? "";
  return DOMAIN_RE.test(host) ? host : null;
}
```

- [ ] **Step 4: Ejecutar test**

Run: `cd frontend && npx vitest run src/tests/botSessionView.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Crear `useBotSession.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { BotSessionDto } from "@audio-to-text/shared";
import { api } from "../../lib/api.js";
import { isActiveState } from "./botSessionView.js";

const POLL_MS = 2000;

export function useBotSession() {
  const [session, setSession] = useState<BotSessionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++counter.current;
    try {
      const res = await api.get<{ success: boolean; data: BotSessionDto }>("/bot/session");
      if (id === counter.current && res.success) setSession(res.data);
    } catch {
      /* el siguiente ciclo lo reintenta */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const join = useCallback(async (url: string) => {
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: BotSessionDto }>("/bot/join", { url });
      if (res.success) setSession(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const leave = useCallback(async () => {
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: BotSessionDto }>("/bot/leave");
      if (res.success) setSession(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return { session, error, join, leave, active: session ? isActiveState(session.state) : false };
}
```

(Comprueba cómo `api` expone el mensaje de error de las respuestas 400/409: la ruta devuelve `{ success:false, error }`; si `ApiClient.request` lanza `Error(message)` con ese texto, el código anterior ya lo muestra. Si lanza con otro formato, adapta solo el `catch`.)

- [ ] **Step 6: Crear `LiveMeetingCard.tsx`**

```tsx
import React, { useState } from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import { Stop as StopIcon, Videocam as JoinIcon } from "@mui/icons-material";
import { useBotSession } from "./useBotSession.js";
import { STEPS, canJoin, describeState, stepIndexFor } from "./botSessionView.js";

export const LiveMeetingCard: React.FC = () => {
  const { session, error, join, leave, active } = useBotSession();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const state = session?.state ?? "IDLE";
  const info = describeState(state);
  const step = stepIndexFor(state);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Reunión en vivo</Typography>
        <Chip size="small" label={info.label} color={info.color} />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Pega el enlace de Google Meet o Microsoft Teams y el bot entrará a la llamada. Al terminar, la reunión aparece en tu biblioteca.
      </Typography>

      <Box sx={{ display: "flex", gap: 1.5, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Enlace de la reunión"
          placeholder="https://meet.google.com/abc-defg-hij"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={active}
        />
        {active ? (
          <Button
            color="error"
            variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <StopIcon />}
            disabled={busy || state === "ENDING"}
            onClick={() => run(leave)}
          >
            Terminar
          </Button>
        ) : (
          <Button
            variant="contained"
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <JoinIcon />}
            disabled={busy || !canJoin(state, url)}
            onClick={() => run(() => join(url))}
          >
            Entrar
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {session && state !== "IDLE" && (
        <>
          {step >= 0 && (
            <Stepper activeStep={step} alternativeLabel sx={{ mb: 2 }}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}
          <Alert severity={state === "FAILED" ? "error" : state === "NEEDS_LOGIN" ? "warning" : "info"}>
            {session.error ?? session.message}
          </Alert>
          {state === "ENDED" && session.result && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {session.result.utterances} intervenciones captadas
              {session.result.imported > 0 ? " · guardada en la biblioteca" : ""}.
            </Typography>
          )}
        </>
      )}
    </Paper>
  );
};
```

- [ ] **Step 7: Crear `AllowedSitesEditor.tsx`**

```tsx
import React, { useState } from "react";
import { Box, Button, Checkbox, Chip, FormControlLabel, TextField, Typography } from "@mui/material";
import type { BotPlatform } from "@audio-to-text/shared";
import { parseDomainInput } from "./botSessionView.js";

interface Props {
  platforms: BotPlatform[];
  domains: string[];
  onChange: (next: { platforms: BotPlatform[]; domains: string[] }) => void;
}

const PLATFORM_LABELS: Array<{ id: BotPlatform; label: string }> = [
  { id: "GOOGLE_MEET", label: "Google Meet" },
  { id: "MICROSOFT_TEAMS", label: "Microsoft Teams" }
];

export const AllowedSitesEditor: React.FC<Props> = ({ platforms, domains, onChange }) => {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);

  const togglePlatform = (id: BotPlatform, on: boolean) =>
    onChange({ platforms: on ? [...platforms, id] : platforms.filter((p) => p !== id), domains });

  const addDomain = () => {
    const d = parseDomainInput(text);
    if (!d) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText("");
    if (!domains.includes(d)) onChange({ platforms, domains: [...domains, d] });
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Plataformas permitidas</Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1 }}>
        {PLATFORM_LABELS.map((p) => (
          <FormControlLabel
            key={p.id}
            control={<Checkbox checked={platforms.includes(p.id)} onChange={(e) => togglePlatform(p.id, e.target.checked)} />}
            label={p.label}
          />
        ))}
        <FormControlLabel control={<Checkbox disabled />} label="Zoom (próximamente)" />
      </Box>

      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Dominios permitidos</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
        {domains.map((d) => (
          <Chip key={d} label={d} onDelete={() => onChange({ platforms, domains: domains.filter((x) => x !== d) })} />
        ))}
        {domains.length === 0 && (
          <Typography variant="caption" color="warning.main">
            Sin dominios permitidos: el bot rechazará cualquier enlace.
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          size="small"
          label="Añadir dominio"
          placeholder="miempresa.teams.microsoft.com"
          value={text}
          error={invalid}
          helperText={invalid ? "Escribe un dominio válido, por ejemplo meet.google.com" : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addDomain(); }}
        />
        <Button variant="outlined" onClick={addDomain}>Añadir</Button>
      </Box>
    </Box>
  );
};
```

- [ ] **Step 8: Modificar `MeetingBotSettingsSection.tsx`**

Respeta el estilo y los finales de línea del archivo (cambios puntuales):

(a) Imports: `LiveMeetingCard`, `AllowedSitesEditor`, `BotLoginCheckDto`, `BotPlatform`, `BOT_PLATFORMS`, `DEFAULT_BOT_ALLOWED_DOMAINS` de `@audio-to-text/shared`.

(b) Estado inicial de `config`: añadir `botAllowedPlatforms: [...BOT_PLATFORMS]` y `botAllowedDomains: [...DEFAULT_BOT_ALLOWED_DOMAINS]`.

(c) Nuevo estado `const [loginCheck, setLoginCheck] = useState<BotLoginCheckDto | null>(null);` y `const [verifying, setVerifying] = useState(false);` con un manejador:

```tsx
  const handleVerifyLogin = async () => {
    setVerifying(true);
    setFeedback(null);
    try {
      const res = await api.post<{ success: boolean; data: BotLoginCheckDto }>("/bot/login/verify");
      if (res.success) {
        setLoginCheck(res.data);
        await fetchBotStatus();
      }
    } catch (err: any) {
      setFeedback({ type: "error", msg: `No se pudo verificar la sesión: ${err.message}` });
    } finally {
      setVerifying(false);
    }
  };
```

(d) Renderizar `<LiveMeetingCard />` justo después del bloque de `feedback` y antes de la tarjeta de identidad.

(e) En la tarjeta "Conectividad & Cuenta de Google": el chip pasa a tres estados según `status?.loginChecked`: sin verificar ("Sin verificar", `default`), vinculada ("Vinculada", `success`), sin sesión ("Sin vincular", `warning`). Sustituir el texto "Aún no hay una sesión…" por `loginCheck?.message ?? "Pulsa «Verificar sesión» para comprobar si el bot tiene una cuenta de Google iniciada."`. Añadir un botón `Verificar sesión` (`variant="outlined"`, `size="small"`, `disabled={verifying}` con `CircularProgress` mientras verifica) junto a "Vincular", y que `Desvincular` se muestre siempre que `status?.loginChecked && status.isGoogleAccountLinked`. Si `status?.isMeetingActive`, deshabilitar los tres botones.

(f) Añadir, antes de la tarjeta de automatizaciones, una `Paper` "Dónde puede entrar el bot" con:

```tsx
<AllowedSitesEditor
  platforms={config.botAllowedPlatforms ?? [...BOT_PLATFORMS]}
  domains={config.botAllowedDomains ?? [...DEFAULT_BOT_ALLOWED_DOMAINS]}
  onChange={({ platforms, domains }) => setConfig({ ...config, botAllowedPlatforms: platforms, botAllowedDomains: domains })}
/>
```

(se guarda con el botón "Guardar Configuración del Bot" que ya existe).

- [ ] **Step 9: Ejecutar tsc y suite del frontend**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: tsc limpio; 93 + 5 tests PASS.

---

### Task 12: Verificación final e informe

**Files:** ninguno nuevo.

- [ ] **Step 1: Suites completas**

Run (cada una desde su carpeta):
- `cd packages/shared && npm run build` → sin errores.
- `cd algorithm-manager-bot && npx tsc --noEmit && npx vitest run` → todo en verde.
- `cd backend && npx tsc --noEmit && npx vitest run` → todo en verde.
- `cd frontend && npx tsc --noEmit && npx vitest run` → todo en verde.
- `cd desktop && npx tsc --noEmit` → limpio.

- [ ] **Step 2: Compilación de escritorio**

Run: `cd desktop && npm run predist`
Expected: compila shared, frontend y `main.cjs` sin errores ni dependencias prohibidas. Comprobar: `grep -c "bot/session" desktop/dist/main.cjs` ≥ 1 y que `frontend/dist/assets/index-*.js` contiene `bot/join`.

- [ ] **Step 3: Compatibilidad del CLI**

Run: `npm run bot -- --file <un txt con líneas "Nombre: texto">` desde la raíz.
Expected: genera los entregables y `output/reunion_<id>.json` SIN abrir ningún navegador (por `skipConnection`).

- [ ] **Step 4: Recorrido manual (no automatizable; lo hace el usuario con el instalador regenerado)**

1. Ajustes → bot → "Vincular": se abre el navegador. Inicia sesión en Google, ciérralo, pulsa "Verificar sesión": muestra tu correo real. Antes de iniciar sesión debe decir "No hay una sesión…", no "Vinculada".
2. Pega un enlace de Meet de una llamada tuya y pulsa "Entrar": el estado pasa por Abriendo → Esperando admisión → Escuchando; admite al bot desde Meet. Debe llegar una notificación de Windows al entrar.
3. Cierra la ventana de la app durante la llamada: queda en la bandeja; el menú muestra el estado y "Terminar reunión".
4. Termina la llamada desde Meet (o deja al bot solo 2 minutos): el bot sale solo, genera la reunión, llega la notificación "Reunión guardada" y aparece en el Historial con etiqueta Bot.
5. Prueba un enlace de Zoom o de otro dominio: debe rechazarse con un mensaje claro.
6. Quita `meet.google.com` de la lista, guarda y pega un enlace de Meet: debe rechazarse.
7. Intenta entrar con el bot ocupado: el botón Entrar está deshabilitado y la API responde 409.

- [ ] **Step 5: Informe**

Ejecutar `git status --short` y entregar la lista de archivos agrupada por área (shared, bot, backend, desktop, frontend, docs). Destacar los archivos con cambios previos del usuario. Preguntar cómo commitear (todo junto o por fase). No commitear sin esa respuesta.
