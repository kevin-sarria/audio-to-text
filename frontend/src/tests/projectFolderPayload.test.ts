import { describe, it, expect } from "vitest";
import { buildFolderPayload, providerLabel, FolderFormState } from "../features/projectFolders/folderModal/folderPayload.js";
import type { CustomAiProviderDto } from "@audio-to-text/shared";

describe("folderPayload", () => {
  describe("buildFolderPayload", () => {
    const fullForm: FolderFormState = {
      name: "  Proyecto Uno  ",
      description: "  Una descripción  ",
      technicalContext: "  Stack completo  ",
      defaultProvider: "  openai  ",
      defaultModel: "  gpt-4o  ",
      customApiKey: "  sk-12345  ",
      profileId: "  diamante  "
    };

    const emptyForm: FolderFormState = {
      name: "  Proyecto Vacío  ",
      description: "   ",
      technicalContext: "  Contexto  ",
      defaultProvider: "   ",
      defaultModel: "   ",
      customApiKey: "   ",
      profileId: "   "
    };

    it("creación con campos vacíos → undefined (excepto name y technicalContext)", () => {
      const payload = buildFolderPayload(emptyForm, false);
      expect(payload).toEqual({
        name: "Proyecto Vacío",
        technicalContext: "Contexto",
        description: undefined,
        defaultProvider: undefined,
        defaultModel: undefined,
        customApiKey: undefined,
        profileId: undefined
      });
    });

    it("edición con modelo, descripción y proveedor vacíos → \"\" para vaciarlos", () => {
      const payload = buildFolderPayload(emptyForm, true);
      expect(payload).toEqual({
        name: "Proyecto Vacío",
        technicalContext: "Contexto",
        description: "",
        defaultProvider: "",
        defaultModel: "",
        customApiKey: undefined,
        profileId: ""
      });
    });

    it("customApiKey vacío → undefined en ambos modos (creación y edición)", () => {
      const createPayload = buildFolderPayload({ ...fullForm, customApiKey: "" }, false);
      expect(createPayload.customApiKey).toBeUndefined();

      const editPayload = buildFolderPayload({ ...fullForm, customApiKey: "   " }, true);
      expect(editPayload.customApiKey).toBeUndefined();
    });

    it("aplica trim a todos los campos en creación", () => {
      const payload = buildFolderPayload(fullForm, false);
      expect(payload).toEqual({
        name: "Proyecto Uno",
        description: "Una descripción",
        technicalContext: "Stack completo",
        defaultProvider: "openai",
        defaultModel: "gpt-4o",
        customApiKey: "sk-12345",
        profileId: "diamante"
      });
    });

    it("aplica trim a todos los campos en edición", () => {
      const payload = buildFolderPayload(fullForm, true);
      expect(payload).toEqual({
        name: "Proyecto Uno",
        description: "Una descripción",
        technicalContext: "Stack completo",
        defaultProvider: "openai",
        defaultModel: "gpt-4o",
        customApiKey: "sk-12345",
        profileId: "diamante"
      });
    });
  });

  describe("providerLabel", () => {
    const customList: CustomAiProviderDto[] = [
      {
        id: "custom-ollama-1",
        name: "Ollama Local",
        baseUrl: "http://localhost:11434",
        defaultModel: "llama3"
      }
    ];

    it("los 4 proveedores integrados", () => {
      expect(providerLabel("google-account", customList)).toBe("Cuenta de Google (Antigravity)");
      expect(providerLabel("gemini", customList)).toBe("Google Gemini API");
      expect(providerLabel("groq", customList)).toBe("Groq");
      expect(providerLabel("openai", customList)).toBe("OpenAI");
    });

    it("un proveedor personalizado", () => {
      expect(providerLabel("custom-ollama-1", customList)).toBe("Ollama Local");
    });

    it("un id de proveedor desconocido", () => {
      expect(providerLabel("unknown-custom-id", customList)).toBe("unknown-custom-id");
    });
  });
});
