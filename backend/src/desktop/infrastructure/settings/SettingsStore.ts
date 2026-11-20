import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { z } from "zod";

const defaultCpuThreads = Math.max(1, Math.min(8, os.cpus().length || 4));

export const CustomAiProviderItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  apiKey: z.string().optional(),
  defaultModel: z.string()
});

export type CustomAiProviderItem = z.infer<typeof CustomAiProviderItemSchema>;

export const SettingsSchema = z
  .object({
    engine: z.enum(["whisper-local", "groq", "gemini"]).default("whisper-local"),
    language: z.string().default("es"),
    whisperModel: z.enum(["base", "base-q5_1", "small", "small-q5_1", "large-v3-turbo-q5_0"]).default("small"),
    whisperThreads: z.number().int().min(1).max(32).default(defaultCpuThreads),
    useGpu: z.boolean().default(true),
    retentionHours: z.number().int().min(0).max(8760).default(48),
    groqModel: z.string().default("whisper-large-v3-turbo"),
    geminiModel: z.string().default("gemini-3.5-flash-lite"),
    issuesDefaultProvider: z.string().default("google-account"),
    issuesDefaultModel: z.string().default("gemini-3.8-flash-low"),
    autoGenerateIssues: z.boolean().default(true),
    customProviders: z.array(CustomAiProviderItemSchema).default([])
  })
  .strict();

export type DesktopSettings = z.infer<typeof SettingsSchema>;

function cleanModelId(raw?: string): string {
  if (!raw) return "";
  const match = raw.match(/\(([^)]+)\)/);
  let cleaned = raw.trim();
  if (match && match[1]) {
    cleaned = match[1].trim();
  }
  if (cleaned === "gemini-2.5-flash" || cleaned === "gemini-2.0-flash" || cleaned === "gemini-1.5-flash") {
    return "gemini-3.5-flash-lite";
  }
  return cleaned;
}

export class SettingsStore {
  private filePath: string;
  private currentSettings: DesktopSettings;

  constructor(userDataDir: string) {
    this.filePath = path.join(userDataDir, "settings.json");
    this.currentSettings = this.loadInitial();
  }

  private loadInitial(): DesktopSettings {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.geminiModel) parsed.geminiModel = cleanModelId(parsed.geminiModel);
        if (parsed.groqModel) parsed.groqModel = cleanModelId(parsed.groqModel);
        if (parsed.issuesDefaultModel) parsed.issuesDefaultModel = cleanModelId(parsed.issuesDefaultModel);
        return SettingsSchema.parse(parsed);
      }
    } catch (err) {
      console.warn("[SettingsStore] No se pudo leer settings.json, usando valores por defecto:", err);
    }

    const defaults = SettingsSchema.parse({});
    this.saveAtomicSync(defaults);
    return defaults;
  }

  public getSettings(): DesktopSettings {
    return { ...this.currentSettings };
  }

  public async updateSettings(partial: Partial<DesktopSettings>): Promise<DesktopSettings> {
    const cleaned = { ...partial };
    if (cleaned.geminiModel) cleaned.geminiModel = cleanModelId(cleaned.geminiModel);
    if (cleaned.groqModel) cleaned.groqModel = cleanModelId(cleaned.groqModel);
    if (cleaned.issuesDefaultModel) cleaned.issuesDefaultModel = cleanModelId(cleaned.issuesDefaultModel);

    const updated = SettingsSchema.parse({
      ...this.currentSettings,
      ...cleaned
    });

    await this.saveAtomic(updated);
    this.currentSettings = updated;
    return updated;
  }

  private async saveAtomic(settings: DesktopSettings): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fsp.mkdir(dir, { recursive: true });

    const tempPath = `${this.filePath}.${Date.now()}.tmp`;
    const json = JSON.stringify(settings, null, 2);

    await fsp.writeFile(tempPath, json, "utf-8");
    await fsp.rename(tempPath, this.filePath);
  }

  private saveAtomicSync(settings: DesktopSettings): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tempPath = `${this.filePath}.${Date.now()}.tmp`;
    const json = JSON.stringify(settings, null, 2);

    fs.writeFileSync(tempPath, json, "utf-8");
    fs.renameSync(tempPath, this.filePath);
  }
}
