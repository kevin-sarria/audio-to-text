import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openSqliteDatabase } from "../../desktop/infrastructure/sqlite/db.js";
import { SqliteMeetingAnalysisRepository } from "../../desktop/infrastructure/sqlite/SqliteMeetingAnalysisRepository.js";
import { SqliteSessionRepository } from "../../desktop/infrastructure/sqlite/SqliteSessionRepository.js";
import { MeetingAnalysis } from "../../domain/entities/MeetingAnalysis.js";
import { TranscriptionSession } from "../../domain/entities/TranscriptionSession.js";
import { SessionStatus } from "../../domain/value-objects/SessionStatus.js";
import type { DatabaseSync } from "node:sqlite";

describe("SqliteMeetingAnalysisRepository", () => {
  let db: DatabaseSync;
  let repo: SqliteMeetingAnalysisRepository;
  let sessionRepo: SqliteSessionRepository;

  beforeEach(() => {
    db = openSqliteDatabase({ dbPath: ":memory:" });
    repo = new SqliteMeetingAnalysisRepository(db);
    sessionRepo = new SqliteSessionRepository(db);

    // Crear sesión padre requerida por foreign key
    const session = new TranscriptionSession({
      id: "session-test-analysis",
      originalFileName: "meeting.mp3",
      fileFormat: "mp3",
      fileSizeBytes: 2048n,
      audioExpiresAt: new Date(Date.now() + 86400000),
      isAudioPurged: false,
      status: SessionStatus.COMPLETED,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    sessionRepo.create(session);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {}
  });

  it("guarda y recupera un análisis de reunión con issues", async () => {
    const analysis = new MeetingAnalysis({
      id: "analysis-1",
      sessionId: "session-test-analysis",
      projectContext: "React + Node stack",
      summary: "Resumen de la reunión de planning",
      keyDecisions: ["Migrar a Next.js"],
      topicsDiscussed: ["Frontend", "Performance"],
      issues: [
        {
          id: "ISSUE-101",
          title: "Migrar a Next 14",
          type: "refactor",
          priority: "high",
          component: "Frontend",
          description: "Reescribir router",
          expectedFiles: ["app/page.tsx"],
          acceptanceCriteria: ["Páginas cargan en < 1s"],
          agentPrompt: "Actúa como dev..."
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await repo.save(analysis);

    const fetched = await repo.findBySessionId("session-test-analysis");
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe("analysis-1");
    expect(fetched!.summary).toBe("Resumen de la reunión de planning");
    expect(fetched!.keyDecisions).toEqual(["Migrar a Next.js"]);
    expect(fetched!.issues).toHaveLength(1);
    expect(fetched!.issues[0]!.id).toBe("ISSUE-101");
    expect(fetched!.issues[0]!.title).toBe("Migrar a Next 14");
    expect(fetched!.issues[0]!.agentPrompt).toBe("Actúa como dev...");
  });

  it("actualiza un análisis existente para la misma sesión", async () => {
    const analysis = new MeetingAnalysis({
      id: "analysis-1",
      sessionId: "session-test-analysis",
      summary: "Resumen inicial",
      keyDecisions: [],
      topicsDiscussed: [],
      issues: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await repo.save(analysis);

    analysis.update({
      summary: "Resumen actualizado",
      keyDecisions: ["Decisión nueva"]
    });
    await repo.save(analysis);

    const fetched = await repo.findBySessionId("session-test-analysis");
    expect(fetched!.summary).toBe("Resumen actualizado");
    expect(fetched!.keyDecisions).toEqual(["Decisión nueva"]);
  });

  it("elimina un análisis por sessionId", async () => {
    const analysis = new MeetingAnalysis({
      id: "analysis-1",
      sessionId: "session-test-analysis",
      summary: "Resumen",
      keyDecisions: [],
      topicsDiscussed: [],
      issues: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await repo.save(analysis);

    await repo.deleteBySessionId("session-test-analysis");

    const fetched = await repo.findBySessionId("session-test-analysis");
    expect(fetched).toBeNull();
  });
});
