import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type FakeProc = EventEmitter & { stderr: EventEmitter };
const spawnCalls: string[][] = [];
let behaviors: Array<{ code: number; stderr?: string; json?: boolean }> = [];

vi.mock("node:child_process", () => ({
  spawn: (_bin: string, args: string[]) => {
    spawnCalls.push(args);
    const behavior = behaviors.shift() ?? { code: 0, json: true };
    const proc = new EventEmitter() as FakeProc;
    proc.stderr = new EventEmitter();
    setImmediate(() => {
      if (behavior.stderr) proc.stderr.emit("data", Buffer.from(behavior.stderr));
      if (behavior.json) {
        const outBase = args[args.indexOf("-of") + 1]!;
        fs.writeFileSync(
          `${outBase}.json`,
          JSON.stringify({
            result: { language: "es" },
            transcription: [{ offsets: { from: 0, to: 1500 }, text: " Hola a todos." }]
          })
        );
      }
      proc.emit("close", behavior.code);
    });
    return proc;
  }
}));

const { WhisperCppEngine, buildWhisperArgs } = await import(
  "../../infrastructure/transcription/WhisperCppEngine.js"
);

const baseConfig = { binaryPath: "whisper-cli", modelPath: "m.bin", threads: 4 };
const wav = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wcpp-test-")), "a.wav");

describe("buildWhisperArgs (GPU)", () => {
  it("no añade -ng por defecto y lo añade con useGpu=false", () => {
    expect(buildWhisperArgs(baseConfig, "a.wav", "es", "out")).not.toContain("-ng");
    expect(buildWhisperArgs({ ...baseConfig, useGpu: true }, "a.wav", "es", "out")).not.toContain("-ng");
    expect(buildWhisperArgs({ ...baseConfig, useGpu: false }, "a.wav", "es", "out")).toContain("-ng");
  });
});

describe("WhisperCppEngine: reintento con CPU", () => {
  beforeEach(() => {
    spawnCalls.length = 0;
    behaviors = [];
  });

  it("si falla con GPU reintenta una vez con -ng y devuelve el resultado", async () => {
    behaviors = [{ code: 3, stderr: "ggml_vulkan: device lost" }, { code: 0, json: true }];
    const result = await new WhisperCppEngine(baseConfig).transcribe(wav(), { language: "es" });
    expect(spawnCalls).toHaveLength(2);
    expect(spawnCalls[0]).not.toContain("-ng");
    expect(spawnCalls[1]).toContain("-ng");
    expect(result.segments.map((s) => s.text)).toEqual(["Hola a todos."]);
  });

  it("con useGpu=false no reintenta: el error se propaga", async () => {
    behaviors = [{ code: 3, stderr: "fallo" }];
    await expect(new WhisperCppEngine({ ...baseConfig, useGpu: false }).transcribe(wav())).rejects.toThrow(/código 3/);
    expect(spawnCalls).toHaveLength(1);
  });

  it("si el reintento con CPU también falla, propaga ese error", async () => {
    behaviors = [{ code: 3 }, { code: 4, stderr: "sin memoria" }];
    await expect(new WhisperCppEngine(baseConfig).transcribe(wav())).rejects.toThrow(/código 4/);
    expect(spawnCalls).toHaveLength(2);
  });
});
