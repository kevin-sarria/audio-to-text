import { describe, it, expect } from "vitest";
import { SrtExporter } from "../../infrastructure/export/SrtExporter.js";
import { VttExporter } from "../../infrastructure/export/VttExporter.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import { Speaker } from "../../domain/entities/Speaker.js";
import { TranscriptionSegment } from "../../domain/entities/TranscriptionSegment.js";

describe("Exporters Unit Tests", () => {
  const dummySession = new TranscriptionSession({
    id: "sess-export-test",
    originalFileName: "conferencia.mp3",
    fileFormat: "mp3",
    fileSizeBytes: 5000n,
    audioExpiresAt: new Date(),
    isAudioPurged: false,
    status: SessionStatus.COMPLETED,
    createdAt: new Date("2026-10-31T10:00:00Z"),
    updatedAt: new Date("2026-10-31T10:00:00Z")
  });

  const speakerWithCustomName = new Speaker({
    id: "spk-1",
    sessionId: dummySession.id,
    label: "Hablante 1",
    customName: "Dra. Ana López"
  });

  const speakerWithoutCustomName = new Speaker({
    id: "spk-2",
    sessionId: dummySession.id,
    label: "Hablante 2",
    customName: null
  });

  const segments = [
    new TranscriptionSegment({
      id: "seg-1",
      sessionId: dummySession.id,
      speakerId: speakerWithCustomName.id,
      startTimeMs: 1250, // 00:00:01.250
      endTimeMs: 5890, // 00:00:05.890
      content: "Buenos días a todos los participantes."
    }),
    new TranscriptionSegment({
      id: "seg-2",
      sessionId: dummySession.id,
      speakerId: speakerWithoutCustomName.id,
      startTimeMs: 6200, // 00:00:06.200
      endTimeMs: 65123, // 00:01:05.123
      content: "Gracias por la introducción."
    })
  ];

  it("SrtExporter formatea timestamps con coma (,) y secuencia numérica correcta usando customName o label", async () => {
    const exporter = new SrtExporter();
    const result = await exporter.export(
      dummySession,
      [speakerWithCustomName, speakerWithoutCustomName],
      segments
    );

    expect(result).toContain("1\n00:00:01,250 --> 00:00:05,890\nDra. Ana López: Buenos días a todos los participantes.");
    expect(result).toContain("2\n00:00:06,200 --> 00:01:05,123\nHablante 2: Gracias por la introducción.");
  });

  it("VttExporter genera encabezado WEBVTT, timestamps con punto (.) y etiquetas de voz <v Nombre>", async () => {
    const exporter = new VttExporter();
    const result = await exporter.export(
      dummySession,
      [speakerWithCustomName, speakerWithoutCustomName],
      segments
    );

    expect(result.startsWith("WEBVTT")).toBe(true);
    expect(result).toContain("00:00:01.250 --> 00:00:05.890\n<v Dra. Ana López>Buenos días a todos los participantes.");
    expect(result).toContain("00:00:06.200 --> 00:01:05.123\n<v Hablante 2>Gracias por la introducción.");
  });
});
