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
    const joinErr = new Error("Nadie admitió al bot");
    joinErr.name = "BotJoinError";
    const h = harness({ startFails: joinErr });
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
    expect(s.error).toBe("No se pudo generar la reunión: sin modelo");
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { p, resolve, reject };
}

function makeRace(engine: BotEngine, importMeetings?: () => any) {
  const events: any[] = [];
  const svc = new BotSessionService({
    engine,
    getConfig: () => config,
    resolveBrowserPath: () => "b",
    profileDir: "p",
    outputDir: () => "o",
    importMeetings: importMeetings ?? (() => ({ imported: 1, alreadyImported: 0, failed: [], folderMissing: false, folder: "o" })),
    onEvent: (s) => events.push(s)
  });
  return { svc, events };
}

const okFinalize = () => vi.fn(async () => ({ utterances: 1, deliveryFile: "f" }));

describe("BotSessionService: carreras y generaciones", () => {
  it("I-1: si start resuelve tras cancelar, se vuelve a abortar el navegador", async () => {
    const d = deferred<string>();
    const engine: BotEngine = { start: vi.fn(() => d.p), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    await svc.leave();
    expect(engine.abort).toHaveBeenCalledTimes(1);
    d.resolve("sess-late");
    await flush();
    expect(engine.abort).toHaveBeenCalledTimes(2);
    expect(svc.current().state).toBe("ENDED");
    expect(engine.finalize).not.toHaveBeenCalled();
  });

  it("I-1: si start rechaza tras cancelar, también se aborta y sigue ENDED", async () => {
    const d = deferred<string>();
    const engine: BotEngine = { start: vi.fn(() => d.p), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    await svc.leave();
    d.reject(new Error("x"));
    await flush();
    expect(engine.abort).toHaveBeenCalledTimes(2);
    expect(svc.current().state).toBe("ENDED");
  });

  it("R2: el start viejo que resuelve no contamina la sesión nueva", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const starts = [d1, d2];
    let n = 0;
    const engine: BotEngine = { start: vi.fn(() => starts[n++]!.p), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    await svc.leave();
    await svc.join(URL_OK);
    const abortsBefore = (engine.abort as any).mock.calls.length;
    d1.resolve("OLD");
    await flush();
    expect(svc.current().state).toBe("OPENING");
    expect((engine.abort as any).mock.calls.length).toBe(abortsBefore);
    const s = await svc.leave();
    expect(s.state).toBe("ENDED");
    expect(engine.finalize).not.toHaveBeenCalled();
  });

  it("R3: un start viejo que falla no aborta ni rompe el navegador nuevo", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();
    const starts = [d1, d2];
    let n = 0;
    const engine: BotEngine = { start: vi.fn(() => starts[n++]!.p), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    await svc.leave();
    await svc.join(URL_OK);
    const abortsBefore = (engine.abort as any).mock.calls.length;
    d1.reject(new Error("aborted"));
    await flush();
    expect(svc.current().state).toBe("OPENING");
    expect(svc.current().error).toBeNull();
    expect((engine.abort as any).mock.calls.length).toBe(abortsBefore);
  });

  it("R11: un onEnded tardío de la sesión anterior no termina la nueva", async () => {
    const caps: BotEngineStartInput[] = [];
    let n = 0;
    const engine: BotEngine = {
      start: vi.fn(async (i: BotEngineStartInput) => { caps.push(i); return "s" + n++; }),
      finalize: vi.fn(async () => { throw new Error("sin modelo"); }),
      abort: vi.fn(async () => {})
    };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    await flush();
    await svc.leave();
    expect(svc.current().state).toBe("FAILED");
    engine.finalize = okFinalize();
    await svc.join(URL_OK);
    await flush();
    caps[0]!.onEnded("BROWSER_CLOSED");
    caps[0]!.onStatus("NEEDS_LOGIN", "viejo");
    await flush();
    await flush();
    expect(svc.current().state).toBe("LISTENING");
    expect(engine.finalize).not.toHaveBeenCalled();
  });

  it("minor a: el evento ENDED de la cancelación ya lleva result", async () => {
    const d = deferred<string>();
    const engine: BotEngine = { start: vi.fn(() => d.p), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc, events } = makeRace(engine);
    await svc.join(URL_OK);
    await svc.leave();
    const last = events[events.length - 1];
    expect(last.state).toBe("ENDED");
    expect(last.result).toMatchObject({ imported: 0, utterances: 0, deliveryFile: null });
  });

  it("minor b: leave durante el abort de fail() no se sobrescribe con FAILED", async () => {
    const d = deferred<string>();
    const ab = deferred<void>();
    let calls = 0;
    const engine: BotEngine = {
      start: vi.fn(() => d.p),
      finalize: okFinalize(),
      abort: vi.fn(() => (calls++ === 0 ? ab.p : Promise.resolve()))
    };
    const { svc, events } = makeRace(engine);
    await svc.join(URL_OK);
    d.reject(new Error("no admitido"));
    await flush();
    const s = await svc.leave();
    expect(s.state).toBe("ENDED");
    ab.resolve();
    await flush();
    expect(svc.current().state).toBe("ENDED");
    expect(events.map((e) => e.state)).toEqual(["OPENING", "ENDED"]);
  });

  it("minor c: si importMeetings lanza, termina en ENDED avisando de la importación pendiente", async () => {
    const engine: BotEngine = { start: vi.fn(async () => "s"), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc } = makeRace(engine, () => { throw new Error("db locked"); });
    await svc.join(URL_OK);
    await flush();
    const s = await svc.leave();
    expect(s.state).toBe("ENDED");
    expect(s.error).toBeNull();
    expect(s.result).toMatchObject({ imported: 0, utterances: 1, deliveryFile: "f" });
    expect(s.message).toMatch(/no se pudo importar/i);
    expect(s.message).toContain("Importar reuniones del bot");
  });

  it("MF3: si el archivo de la reunión falla al importarse, ENDED con imported 0 y aviso de importación pendiente", async () => {
    const engine: BotEngine = {
      start: vi.fn(async () => "s"),
      finalize: vi.fn(async () => ({ utterances: 2, deliveryFile: "/o/reunion_x.json" })),
      abort: vi.fn(async () => {})
    };
    const { svc } = makeRace(engine, () => ({
      imported: 0, alreadyImported: 0, failed: [{ file: "reunion_x.json", reason: "inválido" }], folderMissing: false, folder: "/o"
    }));
    await svc.join(URL_OK);
    await flush();
    const s = await svc.leave();
    expect(s.state).toBe("ENDED");
    expect(s.result).toMatchObject({ imported: 0, utterances: 2 });
    expect(s.message).toMatch(/no se pudo importar/i);
    expect(s.message).not.toMatch(/ya está en tu biblioteca/i);
  });

  it("MF3: carpeta inexistente también cuenta como importación fallida; un fallo de otro archivo no", async () => {
    const mk = (r: any) => {
      const engine: BotEngine = {
        start: vi.fn(async () => "s"),
        finalize: vi.fn(async () => ({ utterances: 2, deliveryFile: "/o/reunion_x.json" })),
        abort: vi.fn(async () => {})
      };
      return makeRace(engine, () => r);
    };
    const a = mk({ imported: 0, alreadyImported: 0, failed: [], folderMissing: true, folder: "/o" });
    await a.svc.join(URL_OK);
    await flush();
    expect((await a.svc.leave()).message).toMatch(/no se pudo importar/i);

    const b = mk({ imported: 1, alreadyImported: 0, failed: [{ file: "reunion_otro.json", reason: "x" }], folderMissing: false, folder: "/o" });
    await b.svc.join(URL_OK);
    await flush();
    const s = await b.svc.leave();
    expect(s.message).toMatch(/ya está en tu biblioteca/i);
    expect(s.result?.imported).toBe(1);
  });

  it("R-4: errores de entrada que no son BotJoinError se muestran con prefijo en español", async () => {
    const h = harness({ startFails: new Error("Navigation timeout of 60000 ms exceeded") });
    await h.svc.join(URL_OK);
    await flush();
    expect(h.svc.current().error).toBe("El bot no pudo completar la entrada: Navigation timeout of 60000 ms exceeded");
  });

  it("onEnded antes de que start resuelva espera y termina en ENDED", async () => {
    const d = deferred<string>();
    let cap!: BotEngineStartInput;
    const engine: BotEngine = { start: vi.fn((i: BotEngineStartInput) => { cap = i; return d.p; }), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    cap.onEnded("MEETING_ENDED_TEXT");
    d.resolve("s");
    await flush();
    await flush();
    expect(svc.current().state).toBe("ENDED");
  });

  it("onEnded antes de que start resuelva y luego start falla: FAILED sin finalize", async () => {
    const d = deferred<string>();
    let cap!: BotEngineStartInput;
    const engine: BotEngine = { start: vi.fn((i: BotEngineStartInput) => { cap = i; return d.p; }), finalize: okFinalize(), abort: vi.fn(async () => {}) };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    cap.onEnded("BROWSER_CLOSED");
    d.reject(new Error("browser gone"));
    await flush();
    await flush();
    expect(svc.current().state).toBe("FAILED");
    expect(engine.finalize).not.toHaveBeenCalled();
  });

  it("onStatus/onEnded durante ENDING y tras ENDED se ignoran", async () => {
    let cap!: BotEngineStartInput;
    const fin = deferred<any>();
    const engine: BotEngine = {
      start: vi.fn(async (i: BotEngineStartInput) => { cap = i; return "s"; }),
      finalize: vi.fn(() => fin.p),
      abort: vi.fn(async () => {})
    };
    const { svc } = makeRace(engine);
    await svc.join(URL_OK);
    await flush();
    const p = svc.leave();
    await flush();
    cap.onEnded("LEFT_ROOM");
    cap.onStatus("LISTENING", "x");
    fin.resolve({ utterances: 2, deliveryFile: "f" });
    await p;
    cap.onEnded("LEFT_ROOM");
    cap.onStatus("WAITING_ADMISSION", "x");
    await flush();
    expect(engine.finalize).toHaveBeenCalledTimes(1);
    expect(svc.current().state).toBe("ENDED");
  });
});
