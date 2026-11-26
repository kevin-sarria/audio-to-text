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
