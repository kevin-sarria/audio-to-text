import type { BotPlatform } from "@audio-to-text/shared";

export type UrlCheck =
  | { ok: true; platform: BotPlatform; url: string }
  | { ok: false; reason: string };

export interface UrlPolicy {
  allowedPlatforms: BotPlatform[];
  allowedDomains: string[];
}

const PLATFORM_HOSTS: Array<{ platform: BotPlatform; hosts: string[] }> = [
  { platform: "GOOGLE_MEET", hosts: ["meet.google.com"] },
  { platform: "MICROSOFT_TEAMS", hosts: ["teams.microsoft.com", "teams.live.com"] }
];

/** true si host es exactamente `domain` o un subdominio real de él. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function checkMeetingUrl(raw: string, policy: UrlPolicy): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "El enlace no es una dirección válida. Pega el enlace completo de la reunión." };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "El enlace debe empezar con https://." };
  if (u.username || u.password) return { ok: false, reason: "El enlace no puede incluir usuario ni contraseña." };

  const host = u.hostname.toLowerCase();
  const match = PLATFORM_HOSTS.find((p) => p.hosts.some((h) => hostMatches(host, h)));
  if (!match) {
    if (hostMatches(host, "zoom.us")) return { ok: false, reason: "Zoom aún no tiene soporte para entrada automática." };
    return { ok: false, reason: "Plataforma no soportada. El bot solo entra a Google Meet y Microsoft Teams." };
  }
  if (!policy.allowedPlatforms.includes(match.platform)) {
    return { ok: false, reason: "Esa plataforma está desactivada en la lista de sitios permitidos del bot." };
  }
  if (!policy.allowedDomains.some((d) => hostMatches(host, d.toLowerCase()))) {
    return { ok: false, reason: `El dominio ${host} no está en la lista de sitios permitidos del bot.` };
  }
  return { ok: true, platform: match.platform, url: u.toString() };
}
