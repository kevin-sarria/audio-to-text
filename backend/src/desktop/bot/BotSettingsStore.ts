import fs from "node:fs";
import path from "node:path";
import {
  BOT_PLATFORMS,
  DEFAULT_BOT_ALLOWED_DOMAINS,
  type BotPlatform,
  type MeetingBotConfigDto
} from "@audio-to-text/shared";
import type { BotPaths } from "./BotPaths.js";

const DEFAULTS: MeetingBotConfigDto = {
  botDisplayName: "Algorithm Assistant Bot",
  botAvatarUrl: "https://api.dicebear.com/7.x/bottts/svg?seed=algorithm-bot",
  botPreferredBrowser: "auto",
  botGoogleAccountEmail: "",
  botAutoRecord: true,
  botMuteOnJoin: true,
  botGenerateDocx: true,
  botGenerateExcel: true,
  botDefaultPlatform: "AUTO",
  botLanguage: "es",
  botOutputDir: "",
  botAllowedPlatforms: [...BOT_PLATFORMS],
  botAllowedDomains: [...DEFAULT_BOT_ALLOWED_DOMAINS]
};

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Minúsculas, sin esquema ni ruta, sin duplicados y descartando lo que no sea un dominio. */
export function normalizeDomains(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const host = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0] ?? "";
    if (DOMAIN_RE.test(host) && !out.includes(host)) out.push(host);
  }
  return out;
}

function normalizePlatforms(input: unknown[]): BotPlatform[] {
  return BOT_PLATFORMS.filter((p) => input.includes(p));
}

export class BotSettingsStore {
  constructor(private paths: BotPaths) {}

  public get(): MeetingBotConfigDto {
    let stored: Partial<MeetingBotConfigDto> = {};
    try {
      if (fs.existsSync(this.paths.settingsFile)) {
        stored = JSON.parse(fs.readFileSync(this.paths.settingsFile, "utf-8")) as Partial<MeetingBotConfigDto>;
      }
    } catch {
      stored = {};
    }
    return this.normalize({ ...DEFAULTS, ...stored });
  }

  public update(partial: Partial<MeetingBotConfigDto>): MeetingBotConfigDto {
    const next = this.normalize({ ...this.get(), ...partial });
    fs.mkdirSync(path.dirname(this.paths.settingsFile), { recursive: true });
    fs.writeFileSync(this.paths.settingsFile, JSON.stringify(next, null, 2), "utf-8");
    return next;
  }

  /** Carpeta de salida configurada o, si está vacía, <userData>/bot/output. */
  public effectiveOutputDir(): string {
    const configured = this.get().botOutputDir?.trim();
    return configured ? path.resolve(configured) : this.paths.outputDir;
  }

  private normalize(c: MeetingBotConfigDto): MeetingBotConfigDto {
    return {
      ...c,
      botAllowedDomains: normalizeDomains(c.botAllowedDomains ?? [...DEFAULT_BOT_ALLOWED_DOMAINS]),
      botAllowedPlatforms: normalizePlatforms(c.botAllowedPlatforms ?? [...BOT_PLATFORMS])
    };
  }
}
