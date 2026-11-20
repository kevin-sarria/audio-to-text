import { describe, it, expect, vi } from "vitest";
import { CreateTranscriptionSession } from "../../application/use-cases/transcription/CreateTranscriptionSession.js";
import { ISessionRepository } from "../../domain/repositories/ISessionRepository.js";
import { IStorageService } from "../../domain/services/IStorageService.js";
import { IJobQueue } from "../../domain/services/IJobQueue.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";

const UUID_KEY = /^raw\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]+)$/;

function setup() {
  const savedKeys: string[] = [];
  const storage = {
    save: vi.fn(async (_src: string | Buffer, key: string) => {
      savedKeys.push(key);
      return key;
    }),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    getAbsolutePath: vi.fn()
  } as unknown as IStorageService;
  const repo = {
    create: vi.fn(async (s: TranscriptionSession) => s)
  } as unknown as ISessionRepository;
  const queue = { enqueuePreprocess: vi.fn(async () => undefined) } as unknown as IJobQueue;
  const useCase = new CreateTranscriptionSession(repo, storage, queue);
  return { useCase, savedKeys };
}

async function createWithName(originalName: string) {
  const { useCase, savedKeys } = setup();
  const { session } = await useCase.execute({
    userId: "user-1",
    file: { originalName, mimeType: "audio/wav", size: 10, buffer: Buffer.from("x") }
  });
  return { key: savedKeys[0]!, session };
}

describe("CreateTranscriptionSession - clave de almacenamiento", () => {
  it.each(["wav", "mp3", "m4a", "ogg", "flac", "webm"])("conserva la extensión permitida .%s", async (ext) => {
    const { key, session } = await createWithName(`reunion.${ext.toUpperCase()}`);
    expect(key).toMatch(UUID_KEY);
    expect(key.endsWith(`.${ext}`)).toBe(true);
    expect(session.storagePath).toBe(key);
  });

  it.each([
    ["x./../../evil"],
    ["x.wav/../../../evil"],
    ["x.\\..\\..\\evil"],
    ["malware.exe"],
    ["sin-extension"],
    ["audio."]
  ])("usa la extensión neutra 'audio' para el nombre %j", async (name) => {
    const { key } = await createWithName(name);
    expect(key).toMatch(UUID_KEY);
    expect(key.endsWith(".audio")).toBe(true);
    expect(key).not.toContain("..");
  });
});
