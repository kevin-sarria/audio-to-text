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
      chromePath: "C:/nav/brave.exe",
      onStatus,
      onEnded,
      admissionLimitMs: 1234
    });
    const passed = (driver.joinAndListen as any).mock.calls[0][1];
    expect(passed).toMatchObject({ chromePath: "C:/nav/brave.exe", headless: false, profileDir: "C:/datos/bot/profile", onStatus, onEnded, admissionLimitMs: 1234 });
  });

  it("rechaza plataformas sin driver (Zoom) con un mensaje claro", async () => {
    const c = new HeadlessMeetingBotConnector({});
    await expect(
      c.connectToMeeting({ ...cfg("https://zoom.us/j/123"), platform: "ZOOM" }, () => {})
    ).rejects.toThrow(/no.*soport/i);
  });

  it("abort durante un arranque lento: el driver cancelado nunca llega a unirse", async () => {
    let joined = false;
    let aborted = false;
    let release!: () => void;
    const launch = new Promise<void>((r) => (release = r));
    const driver: LiveDriver = {
      joinAndListen: async () => {
        await launch;
        if (aborted) throw new BotJoinError("ROOM_UNAVAILABLE", "La entrada del bot fue cancelada.");
        joined = true;
      },
      leave: async () => { aborted = true; }
    };
    const c = new HeadlessMeetingBotConnector({ meet: () => driver });
    const pending = c.connectToMeeting(cfg("https://meet.google.com/abc-defg-hij"), () => {});
    await c.leaveMeeting("x");
    release();
    await expect(pending).rejects.toMatchObject({ code: "ROOM_UNAVAILABLE" });
    expect(joined).toBe(false);
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
      chromePath: "C:/nav/chrome.exe",
      onStatus,
      onEnded
    });
    const [connCfg, , opts] = connector.connectToMeeting.mock.calls[0];
    expect(connCfg.botDisplayName).toBe("Mi Bot");
    expect(connCfg.autoRecord).toBe(false);
    expect(opts).toMatchObject({ chromePath: "C:/nav/chrome.exe", headless: false, profileDir: "C:/p", onStatus, onEnded });
  });

  it("abort cierra el conector", async () => {
    const connector = { connectToMeeting: vi.fn(), leaveMeeting: vi.fn(async () => ({ success: true })) } as any;
    const svc = new AutonomousMeetingBotService(classifier, proposal, undefined, undefined, undefined, connector);
    await svc.abort();
    expect(connector.leaveMeeting).toHaveBeenCalledTimes(1);
  });
});
