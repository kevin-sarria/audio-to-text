import { z } from "zod";

export const BOT_MEETING_SCHEMA_VERSION = 1;

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Fecha ISO inválida");

export const BotMeetingSummarySchema = z.object({
  sessionId: z.string(),
  generatedAt: z.string(),
  language: z.string().min(1),
  executiveSummary: z.string().min(1),
  topics: z.array(z.object({ title: z.string(), summary: z.string() })),
  decisions: z.array(z.object({ text: z.string(), evidence: z.string() })),
  actionItems: z.array(
    z.object({
      task: z.string().min(1),
      owner: z.string().optional(),
      dueDate: z.string().optional(),
      evidence: z.string()
    })
  ),
  openQuestions: z.array(z.object({ text: z.string(), askedBy: z.string().optional() })),
  participants: z.array(
    z.object({ name: z.string(), speakingSeconds: z.number(), speakingPercent: z.number() })
  ),
  chapters: z.array(z.object({ title: z.string(), startSec: z.number(), endSec: z.number() })),
  note: z.string().optional()
});

/** Archivo `reunion_<sessionId>.json` que el bot deja en su carpeta de salida y la app importa. */
export const BotMeetingDeliverySchema = z.object({
  schemaVersion: z.literal(BOT_MEETING_SCHEMA_VERSION),
  sessionId: z.string().min(1).max(200),
  platform: z.enum(["GOOGLE_MEET", "MICROSOFT_TEAMS", "ZOOM", "LOCAL_DESKTOP"]),
  meetingUrl: z.string(),
  startedAt: isoDate,
  endedAt: isoDate,
  meetingType: z.enum(["INTERNAL", "COMMERCIAL_CLIENT"]),
  classificationReason: z.string(),
  utterances: z
    .array(
      z.object({
        speakerName: z.string().min(1),
        text: z.string().min(1),
        offsetSec: z.number().min(0)
      })
    )
    .min(1),
  summary: BotMeetingSummarySchema
});

export type BotMeetingDelivery = z.infer<typeof BotMeetingDeliverySchema>;
