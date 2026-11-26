import { describe, it, expect, vi, afterEach } from "vitest";
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

  it("R-1: un error de lectura pasajero no termina la reunión", async () => {
    const m = new LiveRoomMonitor(fakeProbe({ pageText: async () => { throw new Error("Execution context was destroyed"); } }), "abc-defg-hij", clock());
    expect(await m.checkOnce()).toBeNull();
    expect(await m.checkOnce()).toBeNull();
  });

  it("R-1: tres fallos de lectura seguidos cuentan como navegador cerrado", async () => {
    const m = new LiveRoomMonitor(fakeProbe({ pageText: async () => { throw new Error("Target closed"); } }), "abc-defg-hij", clock());
    expect(await m.checkOnce()).toBeNull();
    expect(await m.checkOnce()).toBeNull();
    expect(await m.checkOnce()).toBe("BROWSER_CLOSED");
  });

  it("R-1: una lectura correcta reinicia el contador de fallos", async () => {
    let fail = true;
    const m = new LiveRoomMonitor(
      fakeProbe({ pageText: async () => { if (fail) throw new Error("x"); return "En la llamada"; } }),
      "abc-defg-hij",
      clock()
    );
    await m.checkOnce();
    await m.checkOnce();
    fail = false;
    expect(await m.checkOnce()).toBeNull();
    fail = true;
    expect(await m.checkOnce()).toBeNull();
    expect(await m.checkOnce()).toBeNull();
  });

  it("R-1: un fallo de lectura con el navegador ya cerrado termina de inmediato", async () => {
    let open = true;
    const m = new LiveRoomMonitor(
      fakeProbe({ isBrowserOpen: () => open, pageText: async () => { open = false; throw new Error("Target closed"); } }),
      "abc-defg-hij",
      clock()
    );
    expect(await m.checkOnce()).toBe("BROWSER_CLOSED");
  });

  it("R-2: con el bot dentro de la llamada el texto de fin (subtítulos) se ignora", async () => {
    const m = new LiveRoomMonitor(
      fakeProbe({ pageText: async () => "Ana: the meeting has ended, gracias", hasAdmittedMarker: async () => true }),
      "abc-defg-hij",
      clock()
    );
    expect(await m.checkOnce()).toBeNull();
  });

  it("R-2: si hasAdmittedMarker lanza se trata como fuera de la llamada", async () => {
    const m = new LiveRoomMonitor(
      fakeProbe({ pageText: async () => "You left the meeting", hasAdmittedMarker: async () => { throw new Error("x"); } }),
      "abc-defg-hij",
      clock()
    );
    expect(await m.checkOnce()).toBe("MEETING_ENDED_TEXT");
  });
});

describe("LiveRoomMonitor.startEndWatch / stop", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const closedProbe = (over: Partial<RoomProbe> = {}) => fakeProbe({ pageText: async () => "Saliste de la llamada", ...over });

  it("llama a onEnded una sola vez y detiene el temporizador", async () => {
    vi.useFakeTimers();
    const onEnded = vi.fn();
    const m = new LiveRoomMonitor(closedProbe(), "abc-defg-hij", clock());
    m.startEndWatch(onEnded, 1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledWith("MEETING_ENDED_TEXT");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stop() antes del tick impide llamar a onEnded", async () => {
    vi.useFakeTimers();
    const onEnded = vi.fn();
    const m = new LiveRoomMonitor(closedProbe(), "abc-defg-hij", clock());
    m.startEndWatch(onEnded, 1000);
    m.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("stop() durante una comprobación pendiente no llama a onEnded", async () => {
    vi.useFakeTimers();
    let release!: (t: string) => void;
    const pageText = vi.fn(() => new Promise<string>((r) => { release = r; }));
    const onEnded = vi.fn();
    const m = new LiveRoomMonitor(closedProbe({ pageText }), "abc-defg-hij", clock());
    m.startEndWatch(onEnded, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pageText).toHaveBeenCalledTimes(1);
    m.stop();
    release("Saliste de la llamada");
    await vi.advanceTimersByTimeAsync(5000);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("no solapa comprobaciones si una es lenta", async () => {
    vi.useFakeTimers();
    const pageText = vi.fn(() => new Promise<string>(() => {}));
    const m = new LiveRoomMonitor(fakeProbe({ pageText }), "abc-defg-hij", clock());
    m.startEndWatch(vi.fn(), 1000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(pageText).toHaveBeenCalledTimes(1);
    m.stop();
  });

  it("un onEnded que lanza no deja una promesa rechazada sin manejar", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const m = new LiveRoomMonitor(closedProbe(), "abc-defg-hij", clock());
      m.startEndWatch(() => { throw new Error("boom"); }, 1000);
      await vi.advanceTimersByTimeAsync(2000);
      vi.useRealTimers();
      await new Promise((r) => setTimeout(r, 10));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
