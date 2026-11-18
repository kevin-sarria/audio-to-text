import { createPreprocessorWorker } from "./preprocessor.worker.js";
import { createTranscriberWorker } from "./transcriber.worker.js";
import { createPersistenceWorker } from "./persistence.worker.js";
import { createRetentionWorker } from "./retention.worker.js";
import { compositionRoot } from "../composition-root.js";

async function startWorkers() {
  console.log("Iniciando pipeline de workers BullMQ...");

  const preprocessor = createPreprocessorWorker();
  const transcriber = createTranscriberWorker();
  const persistence = createPersistenceWorker();
  const retention = createRetentionWorker();

  // Programar el job repetible de retención horaria
  await compositionRoot.jobQueue.scheduleRetentionJob();

  console.log("Workers iniciados y escuchando colas BullMQ.");

  const shutdown = async () => {
    console.log("Cerrando workers ordenadamente...");
    await Promise.all([
      preprocessor.close(),
      transcriber.close(),
      persistence.close(),
      retention.close()
    ]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startWorkers().catch((err) => {
  console.error("Error fatal iniciando workers:", err);
  process.exit(1);
});
