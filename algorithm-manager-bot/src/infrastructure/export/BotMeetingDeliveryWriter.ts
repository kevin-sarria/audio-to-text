import fs from "node:fs";
import path from "node:path";
import type { MeetingPlatform, MeetingType } from "../../domain/models/MeetingTypes.js";
import type { MeetingSummary } from "../../domain/models/MeetingSummary.js";

/** Contrato del archivo de entrega. Debe coincidir con `BotMeetingDeliverySchema` de `packages/shared` (lo valida la prueba). */
export interface BotMeetingDelivery {
  schemaVersion: 1;
  sessionId: string;
  platform: MeetingPlatform;
  meetingUrl: string;
  startedAt: string;
  endedAt: string;
  meetingType: MeetingType;
  classificationReason: string;
  utterances: { speakerName: string; text: string; offsetSec: number }[];
  summary: MeetingSummary;
}

/** Escribe `reunion_<id>.json`: primero a `.tmp` y luego renombra, para que la app nunca lea un archivo a medias. */
export function writeBotMeetingDelivery(outputDir: string, delivery: BotMeetingDelivery): string {
  const safeId = delivery.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const finalPath = path.join(outputDir, `reunion_${safeId}.json`);
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(delivery, null, 2), "utf-8");
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}
