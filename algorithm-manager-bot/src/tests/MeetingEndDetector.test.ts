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

  it.each([
    "Saliste de la reunión",
    "You left the meeting",
    "You have left the call",
    "El organizador finalizó la reunión",
    "The host ended the meeting"
  ])("R-2: reconoce la variante %s cuando el bot ya no está en la llamada", (pageText) => {
    expect(new MeetingEndDetector().evaluate({ ...base, pageText, inCall: false })).toBe("MEETING_ENDED_TEXT");
  });

  it("R-2: con inCall true el texto de fin se ignora (puede venir de los subtítulos)", () => {
    expect(new MeetingEndDetector().evaluate({ ...base, pageText: "Ana: the meeting has ended", inCall: true })).toBeNull();
  });

  it("R-2: con inCall true siguen valiendo la URL y el navegador cerrado", () => {
    expect(new MeetingEndDetector().evaluate({ ...base, inCall: true, urlStillInRoom: false })).toBe("LEFT_ROOM");
    expect(new MeetingEndDetector().evaluate({ ...base, inCall: true, browserOpen: false })).toBe("BROWSER_CLOSED");
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
