import { CompleteSession } from "../../application/use-cases/transcription/CompleteSession.js";
import { JobQueuePayload } from "../../domain/services/IJobQueue.js";
import { RawTranscriptionSegment } from "../../domain/services/ITranscriptionEngine.js";

export interface PersistHandlerDeps {
  completeSession: CompleteSession;
}

export function createPersistHandler(deps: PersistHandlerDeps) {
  const { completeSession } = deps;

  return async function handlePersist(payload: JobQueuePayload): Promise<void> {
    const { sessionId, metadata } = payload;
    console.log(`[W3:Persistence] Guardando resultados para sesión ${sessionId}`);

    const segments = (metadata?.["segments"] as RawTranscriptionSegment[]) || [];
    const language = metadata?.["language"] as string | undefined;

    await completeSession.execute({
      sessionId,
      language,
      segments
    });

    console.log(`[W3:Persistence] Sesión ${sessionId} persistida y completada con éxito.`);
  };
}
