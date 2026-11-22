import { describe, it, expect } from "vitest";
import { shouldAutoSelectModel } from "../features/customAi/modelAutoSelect.js";

describe("shouldAutoSelectModel", () => {
  it("valor vacío + petición vigente → true", () => {
    const result = shouldAutoSelectModel({
      latestValue: "",
      requestId: 1,
      currentRequestId: 1
    });
    expect(result).toBe(true);
  });

  it("valor no vacío → false", () => {
    const result = shouldAutoSelectModel({
      latestValue: "gpt-4o",
      requestId: 1,
      currentRequestId: 1
    });
    expect(result).toBe(false);
  });

  it("petición vieja → false", () => {
    const result = shouldAutoSelectModel({
      latestValue: "",
      requestId: 1,
      currentRequestId: 2
    });
    expect(result).toBe(false);
  });

  it("valor solo espacios → true", () => {
    const result = shouldAutoSelectModel({
      latestValue: "   ",
      requestId: 3,
      currentRequestId: 3
    });
    expect(result).toBe(true);
  });

  it("valor no vacío con espacios alrededor → false", () => {
    const result = shouldAutoSelectModel({
      latestValue: "  gemini-2.5-flash  ",
      requestId: 2,
      currentRequestId: 2
    });
    expect(result).toBe(false);
  });

  it("petición vieja con valor no vacío → false", () => {
    const result = shouldAutoSelectModel({
      latestValue: "llama-3.3-70b",
      requestId: 1,
      currentRequestId: 2
    });
    expect(result).toBe(false);
  });
});
