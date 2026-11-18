import { PurgeExpiredAudio, PurgeExpiredAudioResult } from "../../application/use-cases/retention/PurgeExpiredAudio.js";

export interface RetentionHandlerDeps {
  purgeExpiredAudio: PurgeExpiredAudio;
}

export function createRetentionHandler(deps: RetentionHandlerDeps) {
  const { purgeExpiredAudio } = deps;

  return async function handleRetention(jobId?: string | number): Promise<PurgeExpiredAudioResult> {
    console.log(
      `[Worker:Retention] Iniciando purga horaria de archivos de audio expirados (${jobId ?? "manual"})`
    );

    const result = await purgeExpiredAudio.execute(new Date(), 100);

    console.log(
      `[Worker:Retention] Purga completada. Purgados: ${result.purgedCount}, Fallidos: ${result.failedCount}`
    );
    return result;
  };
}
