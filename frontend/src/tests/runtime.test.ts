import { describe, it, expect, afterEach, vi } from "vitest";
import { isDesktopApp, getDesktopPlatform } from "../lib/runtime.js";

describe("runtime helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detecta entorno web cuando window no existe o no tiene desktop", () => {
    expect(isDesktopApp()).toBe(false);
    expect(getDesktopPlatform()).toBeNull();

    vi.stubGlobal("window", {});
    expect(isDesktopApp()).toBe(false);
    expect(getDesktopPlatform()).toBeNull();
  });

  it("detecta entorno de escritorio cuando window.desktop está presente", () => {
    vi.stubGlobal("window", {
      desktop: {
        isDesktop: true,
        platform: "win32",
        appVersion: "1.0.0",
        openDataFolder: async () => {}
      }
    });

    expect(isDesktopApp()).toBe(true);
    expect(getDesktopPlatform()).toBe("win32");
  });
});
