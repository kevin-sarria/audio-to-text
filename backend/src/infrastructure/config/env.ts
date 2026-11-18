import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const isDesktop = process.env["APP_MODE"] === "desktop";

const WebEnvSchema = z.object({
  APP_MODE: z.enum(["web", "desktop"]).default("web"),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  DATABASE_URL: z.string().url(),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  RECAPTCHA_ENABLED: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  RECAPTCHA_SECRET_KEY: z.string().default("dummy-key"),
  RECAPTCHA_MIN_SCORE: z.coerce.number().default(0.5),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  S3_BUCKET_NAME: z.string().optional().default("audio-transcription-bucket"),
  S3_REGION: z.string().optional().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  MAX_UPLOAD_MB: z.coerce.number().default(200),
  AUDIO_RETENTION_HOURS: z.coerce.number().default(48),

  TRANSCRIPTION_ENGINE: z.enum(["whisper-cpp", "whisper-api"]).default("whisper-cpp"),
  WHISPER_CPP_PATH: z.string().default("/usr/local/bin/whisper-cli"),
  WHISPER_MODEL_PATH: z.string().default("./models/ggml-base.bin"),
  WHISPER_VAD_MODEL_PATH: z.string().optional(),
  WHISPER_USE_GPU: z.enum(["true", "false"]).default("true"),
  WHISPER_THREADS: z.coerce.number().int().min(1).default(8),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional()
});

const DesktopEnvSchema = z.object({
  APP_MODE: z.enum(["web", "desktop"]).default("desktop"),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  DATABASE_URL: z.string().optional().default("sqlite://audio2text.db"),
  REDIS_HOST: z.string().optional().default("localhost"),
  REDIS_PORT: z.coerce.number().optional().default(6379),
  REDIS_PASSWORD: z.string().optional().default(""),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z.string().default("http://127.0.0.1"),

  JWT_ACCESS_SECRET: z.string().optional().default("desktop-mode-dummy-access-secret-32ch"),
  JWT_REFRESH_SECRET: z.string().optional().default("desktop-mode-dummy-refresh-secret-32ch"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  RECAPTCHA_ENABLED: z
    .any()
    .transform(() => false)
    .default(false),
  RECAPTCHA_SECRET_KEY: z.string().default("dummy-key"),
  RECAPTCHA_MIN_SCORE: z.coerce.number().default(0.5),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  S3_BUCKET_NAME: z.string().optional().default("audio-transcription-bucket"),
  S3_REGION: z.string().optional().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  MAX_UPLOAD_MB: z.coerce.number().default(2048),
  AUDIO_RETENTION_HOURS: z.coerce.number().default(48),

  TRANSCRIPTION_ENGINE: z.string().default("whisper-cpp"),
  WHISPER_CPP_PATH: z.string().default("/usr/local/bin/whisper-cli"),
  WHISPER_MODEL_PATH: z.string().default("./models/ggml-base.bin"),
  WHISPER_VAD_MODEL_PATH: z.string().optional(),
  WHISPER_USE_GPU: z.enum(["true", "false"]).default("true"),
  WHISPER_THREADS: z.coerce.number().int().min(1).default(8),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional()
});

const EnvSchema = isDesktop ? DesktopEnvSchema : WebEnvSchema;

export type EnvConfig = z.infer<typeof EnvSchema>;

let parsedEnv: EnvConfig;
try {
  parsedEnv = EnvSchema.parse(process.env);
} catch (error) {
  if (process.env["NODE_ENV"] === "test") {
    // Provide safe defaults for testing environment
    parsedEnv = EnvSchema.parse({
      DATABASE_URL: "mysql://app_user:app_password@localhost:3306/audio_to_text",
      JWT_ACCESS_SECRET: "test-super-secret-jwt-access-key-32chars",
      JWT_REFRESH_SECRET: "test-super-secret-jwt-refresh-key-32chars",
      ...process.env
    });
  } else {
    console.error("Error en configuración de variables de entorno:", error);
    throw error;
  }
}

export const env = parsedEnv;
