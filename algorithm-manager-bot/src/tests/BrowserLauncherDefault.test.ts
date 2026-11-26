import { describe, it, expect } from "vitest";
import { isChromiumExecutable } from "../infrastructure/connectors/live/BrowserLauncher.js";

describe("isChromiumExecutable (R-6)", () => {
  it.each([
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/chromium"
  ])("acepta %s", (p) => expect(isChromiumExecutable(p)).toBe(true));

  it.each([
    "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    "C:\\Program Files\\Internet Explorer\\iexplore.exe",
    "",
    null,
    undefined
  ])("rechaza %s", (p) => expect(isChromiumExecutable(p as any)).toBe(false));
});
