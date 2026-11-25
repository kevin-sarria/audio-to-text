import { describe, it, expect } from "vitest";
import { BotMeetingDeliverySchema } from "@audio-to-text/shared";
import { makeDelivery } from "../helpers/botMeetingFixtures.js";

describe("BotMeetingDeliverySchema", () => {
  it("acepta un archivo de entrega válido", () => {
    expect(BotMeetingDeliverySchema.safeParse(makeDelivery()).success).toBe(true);
  });

  it("rechaza una schemaVersion distinta de 1", () => {
    const bad = { ...makeDelivery(), schemaVersion: 2 };
    expect(BotMeetingDeliverySchema.safeParse(bad).success).toBe(false);
  });

  it("rechaza utterances vacías, sin resumen, con fechas inválidas o con offsets negativos", () => {
    expect(BotMeetingDeliverySchema.safeParse({ ...makeDelivery(), utterances: [] }).success).toBe(false);

    const { summary: _omit, ...withoutSummary } = makeDelivery();
    expect(BotMeetingDeliverySchema.safeParse(withoutSummary).success).toBe(false);

    expect(BotMeetingDeliverySchema.safeParse({ ...makeDelivery(), startedAt: "no es una fecha" }).success).toBe(false);

    const negative = makeDelivery({
      utterances: [{ speakerName: "Ana", text: "hola", offsetSec: -1 }]
    });
    expect(BotMeetingDeliverySchema.safeParse(negative).success).toBe(false);
  });

  it("rechaza hablantes o textos vacíos", () => {
    const blankSpeaker = makeDelivery({ utterances: [{ speakerName: "", text: "hola", offsetSec: 0 }] });
    const blankText = makeDelivery({ utterances: [{ speakerName: "Ana", text: "", offsetSec: 0 }] });
    expect(BotMeetingDeliverySchema.safeParse(blankSpeaker).success).toBe(false);
    expect(BotMeetingDeliverySchema.safeParse(blankText).success).toBe(false);
  });
});
