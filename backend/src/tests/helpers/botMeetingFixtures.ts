import type { BotMeetingDelivery } from "@audio-to-text/shared";

export function makeDelivery(overrides: Partial<BotMeetingDelivery> = {}): BotMeetingDelivery {
  return {
    schemaVersion: 1,
    sessionId: "bot-session-1001",
    platform: "GOOGLE_MEET",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    startedAt: "2026-11-25T14:00:00.000Z",
    endedAt: "2026-11-25T14:30:00.000Z",
    meetingType: "INTERNAL",
    classificationReason: "Sprint planning",
    utterances: [
      { speakerName: "Ana", text: "Vamos a migrar la base de datos el viernes.", offsetSec: 0 },
      { speakerName: "Luis", text: "Yo me encargo de preparar el script de migración.", offsetSec: 12 },
      { speakerName: "Ana", text: "Perfecto, ¿alguien sabe quién aprueba el presupuesto?", offsetSec: 30 }
    ],
    summary: {
      sessionId: "bot-session-1001",
      generatedAt: "2026-11-25T14:31:00.000Z",
      language: "es",
      executiveSummary: "Se acordó migrar la base de datos el viernes.",
      topics: [{ title: "Migración", summary: "Plan de migración." }],
      decisions: [{ text: "Migrar el viernes", evidence: "Vamos a migrar la base de datos el viernes." }],
      actionItems: [
        {
          task: "Preparar el script de migración",
          owner: "Luis",
          dueDate: "jueves",
          evidence: "Yo me encargo de preparar el script de migración."
        },
        { task: "Definir quién aprueba el presupuesto", evidence: "alguien sabe quién aprueba el presupuesto" }
      ],
      openQuestions: [{ text: "¿Quién aprueba el presupuesto?", askedBy: "Ana" }],
      participants: [
        { name: "Luis", speakingSeconds: 18, speakingPercent: 54.9 },
        { name: "Ana", speakingSeconds: 15, speakingPercent: 45.1 }
      ],
      chapters: [{ title: "Migración", startSec: 0, endSec: 30 }]
    },
    ...overrides
  };
}
