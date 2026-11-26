import { describe, it, expect, afterEach, vi } from "vitest";
import { botBase, isLoginChecked } from "../features/bot/botApi.js";

describe("botBase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("en escritorio apunta a /desktop/bot", () => {
    vi.stubGlobal("window", { desktop: { isDesktop: true } });
    expect(botBase()).toBe("/desktop/bot");
  });

  it("en web apunta a /bot", () => {
    vi.stubGlobal("window", {});
    expect(botBase()).toBe("/bot");
  });
});

describe("isLoginChecked", () => {
  it("en escritorio respeta loginChecked del estado", () => {
    expect(isLoginChecked(true, true)).toBe(true);
    expect(isLoginChecked(true, false)).toBe(false);
    expect(isLoginChecked(true, undefined)).toBe(false);
  });

  it("en web siempre es true aunque la ruta no lo devuelva", () => {
    expect(isLoginChecked(false, undefined)).toBe(true);
    expect(isLoginChecked(false, false)).toBe(true);
  });
});
