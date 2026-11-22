import { describe, it, expect } from "vitest";
import { buildModelOptions } from "../features/customAi/modelOptions.js";
import type { AvailableModelItem } from "@audio-to-text/shared";

describe("buildModelOptions", () => {
  it("construye la lista normal con label y secondary", () => {
    const models: AvailableModelItem[] = [
      { id: "gpt-4o", name: "GPT-4o (Omni)" },
      { id: "gemini-2.5-flash", name: "gemini-2.5-flash" }
    ];

    const options = buildModelOptions(models, "gpt-4o");

    expect(options).toEqual([
      { id: "gpt-4o", label: "GPT-4o (Omni)", secondary: "gpt-4o" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" }
    ]);
  });

  it("agrega al final con missing: true cuando el valor está fuera de la lista", () => {
    const models: AvailableModelItem[] = [
      { id: "claude-3-opus", name: "Claude 3 Opus" }
    ];

    const options = buildModelOptions(models, "claude-2-antiguo");

    expect(options).toHaveLength(2);
    expect(options[1]).toEqual({
      id: "claude-2-antiguo",
      label: "claude-2-antiguo (no está en la lista del proveedor)",
      missing: true
    });
  });

  it("no duplica modelos por id", () => {
    const models: AvailableModelItem[] = [
      { id: "deepseek-chat", name: "DeepSeek Chat" },
      { id: "deepseek-chat", name: "DeepSeek Chat Duplicado" }
    ];

    const options = buildModelOptions(models, "");

    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe("deepseek-chat");
    expect(options[0]?.label).toBe("DeepSeek Chat");
  });

  it("incluye secondary solo cuando el id difiere del name", () => {
    const models: AvailableModelItem[] = [
      { id: "m1", name: "Modelo Uno" },
      { id: "m2", name: "m2" },
      { id: "m3", name: "   " } // name vacío usa id como label sin secondary
    ];

    const options = buildModelOptions(models, "");

    expect(options[0]).toEqual({ id: "m1", label: "Modelo Uno", secondary: "m1" });
    expect(options[1]).toEqual({ id: "m2", label: "m2" });
    expect(options[1]?.secondary).toBeUndefined();
    expect(options[2]).toEqual({ id: "m3", label: "m3" });
    expect(options[2]?.secondary).toBeUndefined();
  });
});
