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
