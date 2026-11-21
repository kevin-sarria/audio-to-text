export interface ScanBudget {
  maxInputChars: number;
  chunkChars: number;
  maxSummaryCalls: number;
}

export const DEFAULT_MODEL_INPUT_CHARS: Array<{ match: string; maxInputChars: number }> = [
  { match: "gemini", maxInputChars: 400000 },
  { match: "claude", maxInputChars: 300000 },
  { match: "gpt-4.1", maxInputChars: 400000 },
  { match: "gpt-4o", maxInputChars: 200000 },
  { match: "gpt-5", maxInputChars: 400000 },
  { match: "gpt-oss", maxInputChars: 300000 },
  { match: "deepseek", maxInputChars: 120000 },
  { match: "qwen", maxInputChars: 120000 },
  { match: "llama", maxInputChars: 40000 },
  { match: "mixtral", maxInputChars: 40000 },
  { match: "gemma", maxInputChars: 30000 }
];

export function resolveScanBudget(
  model: string,
  overrides?: Record<string, number>,
  maxSummaryCalls?: number
): ScanBudget {
  const lowerModel = (model || "").toLowerCase();
  let maxInputChars: number | null = null;

  // 1. Revisar overrides (gana por subcadena en minúsculas)
  if (overrides && typeof overrides === "object") {
    for (const [key, val] of Object.entries(overrides)) {
      if (lowerModel.includes(key.toLowerCase())) {
        maxInputChars = val;
        break;
      }
    }
  }

  // 2. Si no coincide ninguna, buscar en DEFAULT_MODEL_INPUT_CHARS
  if (maxInputChars === null) {
    for (const item of DEFAULT_MODEL_INPUT_CHARS) {
      if (lowerModel.includes(item.match.toLowerCase())) {
        maxInputChars = item.maxInputChars;
        break;
      }
    }
  }

  // 3. Fallback por defecto 60000
  if (maxInputChars === null) {
    maxInputChars = 60000;
  }

  const chunkChars = Math.min(60000, Math.max(4000, Math.round(maxInputChars * 0.35)));
  const summaryCallsLimit = typeof maxSummaryCalls === "number" ? maxSummaryCalls : 12;

  return {
    maxInputChars,
    chunkChars,
    maxSummaryCalls: summaryCallsLimit
  };
}
