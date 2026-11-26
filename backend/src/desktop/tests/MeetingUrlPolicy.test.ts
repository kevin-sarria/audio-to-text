import { describe, it, expect } from "vitest";
import { checkMeetingUrl } from "../bot/meetingUrlPolicy.js";

const allow = {
  allowedPlatforms: ["GOOGLE_MEET", "MICROSOFT_TEAMS"] as const,
  allowedDomains: ["meet.google.com", "teams.microsoft.com", "teams.live.com"]
};
const cfg = { allowedPlatforms: [...allow.allowedPlatforms], allowedDomains: allow.allowedDomains };

describe("checkMeetingUrl", () => {
  it("acepta un enlace de Meet", () => {
    expect(checkMeetingUrl("https://meet.google.com/abc-defg-hij", cfg)).toEqual({
      ok: true,
      platform: "GOOGLE_MEET",
      url: "https://meet.google.com/abc-defg-hij"
    });
  });

  it("acepta Teams con subdominio y detecta la plataforma", () => {
    const r = checkMeetingUrl("https://teams.microsoft.com/l/meetup-join/abc", cfg);
    expect(r).toMatchObject({ ok: true, platform: "MICROSOFT_TEAMS" });
  });

  it("rechaza http", () => {
    expect(checkMeetingUrl("http://meet.google.com/abc-defg-hij", cfg)).toMatchObject({ ok: false });
  });

  it("rechaza credenciales dentro de la URL", () => {
    expect(checkMeetingUrl("https://user:pw@meet.google.com/abc-defg-hij", cfg)).toMatchObject({ ok: false });
  });

  it.each([
    "https://meet.google.com.evil.com/abc-defg-hij",
    "https://evilmeet.google.com/abc",
    "https://evil.com/meet.google.com",
    "https://notmeet.google.com.attacker.io/x"
  ])("rechaza hosts parecidos: %s", (url) => {
    expect(checkMeetingUrl(url, cfg)).toMatchObject({ ok: false });
  });

  it("rechaza Zoom con un mensaje claro", () => {
    const r = checkMeetingUrl("https://zoom.us/j/123456", cfg);
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toMatch(/zoom/i);
  });

  it("rechaza si la plataforma está desactivada", () => {
    const r = checkMeetingUrl("https://meet.google.com/abc-defg-hij", { ...cfg, allowedPlatforms: ["MICROSOFT_TEAMS"] });
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza si el dominio no está en la lista aunque la plataforma sea válida", () => {
    const r = checkMeetingUrl("https://teams.live.com/meet/123", { ...cfg, allowedDomains: ["meet.google.com"] });
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza todo si la lista de dominios está vacía", () => {
    expect(checkMeetingUrl("https://meet.google.com/abc-defg-hij", { ...cfg, allowedDomains: [] })).toMatchObject({ ok: false });
  });

  it("rechaza texto que no es una URL", () => {
    expect(checkMeetingUrl("abc-defg-hij", cfg)).toMatchObject({ ok: false });
    expect(checkMeetingUrl("", cfg)).toMatchObject({ ok: false });
  });
});
