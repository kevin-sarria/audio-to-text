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
