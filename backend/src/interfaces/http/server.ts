import { createApp } from "./app.js";
import { compositionRoot } from "../../composition-root.js";
import { env } from "../../infrastructure/config/env.js";

const app = createApp({
  authController: compositionRoot.authController,
  sessionController: compositionRoot.sessionController,
  exportController: compositionRoot.exportController,
  eventsController: compositionRoot.eventsController,
  meetingAnalysisController: compositionRoot.meetingAnalysisController,
  tokenService: compositionRoot.tokenService
});

const port = env.PORT || 4000;

app.listen(port, () => {
  console.log(`Servidor HTTP iniciado en http://localhost:${port} en modo ${env.NODE_ENV}`);
});
