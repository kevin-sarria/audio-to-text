import { CustomAiProviderDto } from "@audio-to-text/shared";

export type WhisperModelName = "base" | "base-q5_1" | "small" | "small-q5_1" | "large-v3-turbo-q5_0";

export interface DesktopSettings {
  engine: "whisper-local" | "groq" | "gemini";
  language: string;
  whisperModel: WhisperModelName;
  whisperThreads: number;
  useGpu: boolean;
  retentionHours: number;
  groqModel: string;
  geminiModel: string;
  issuesDefaultProvider?: string;
  issuesDefaultModel?: string;
  autoGenerateIssues?: boolean;
  customProviders?: CustomAiProviderDto[];
}

export type KeysInfo = Record<string, { hasKey: boolean; last4: string }>;

export interface ModelItem {
  name: WhisperModelName;
  installed: boolean;
  sizeBytes: number;
  isDownloading: boolean;
  progress?: {
    bytes: number;
    total: number;
    percent: number;
  };
}

export interface SpeedByCase {
  fiveMin: string;
  oneHour: string;
  tenHours: string;
}

export interface Recommendation {
  id: string;
  name: string;
  kind: "local" | "api";
  pricing: "free" | "freemium" | "paid";
  approxCostPerHourUsd: number;
  freeTier?: string;
  supported: boolean;
  quality: string;
  speedByCase: SpeedByCase;
  speedBasis: "medido" | "publicado" | "estimado";
  diarization: boolean;
  privacy: string;
  notes: string;
  signupUrl?: string;
}

export const PRICING_LABEL: Record<Recommendation["pricing"], string> = {
  free: "Gratis",
  freemium: "Gratis con límites",
  paid: "De pago"
};

export const PRICING_COLOR: Record<Recommendation["pricing"], "success" | "warning" | "default"> = {
  free: "success",
  freemium: "warning",
  paid: "default"
};

export function formatUsd(value: number): string {
  if (value === 0) return "$0";
  return value < 0.1 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`;
}
