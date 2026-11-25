import { Router } from "express";
import { SessionController } from "../controllers/SessionController.js";
import { MeetingAnalysisController } from "../controllers/MeetingAnalysisController.js";
import { multerUpload, handleAudioUpload } from "../middlewares/upload.js";
import { uploadRateLimiter } from "../middlewares/rateLimit.js";
import { createOptionalAuthMiddleware } from "../middlewares/optionalAuth.js";
import { validateBody } from "../middlewares/validate.js";
import { RenameSpeakerSchema } from "../validators/session.validator.js";
import { GenerateMeetingAnalysisSchema, UpdateMeetingAnalysisTitleSchema } from "@audio-to-text/shared";
import { ITokenService } from "../../../domain/services/ITokenService.js";

export function createSessionRoutes(
  sessionController: SessionController,
  tokenService: ITokenService,
  meetingAnalysisController?: MeetingAnalysisController
): Router {
  const router = Router();
  const optionalAuth = createOptionalAuthMiddleware(tokenService);

  router.post(
    "/",
    uploadRateLimiter,
    optionalAuth,
    multerUpload.single("audio"),
    handleAudioUpload,
    sessionController.create
  );

  router.get("/", optionalAuth, sessionController.list);
  router.get("/:id", optionalAuth, sessionController.getById);

  router.patch(
    "/:id/speakers/:speakerId",
    optionalAuth,
    validateBody(RenameSpeakerSchema),
    sessionController.renameSpeaker
  );

  router.patch(
    "/:id/project",
    optionalAuth,
    sessionController.updateProjectFolder
  );

  router.post("/:id/retry", optionalAuth, sessionController.retry);

  router.delete("/:id", optionalAuth, sessionController.delete);

  if (meetingAnalysisController) {
    router.post(
      "/:id/meeting-analysis",
      optionalAuth,
      validateBody(GenerateMeetingAnalysisSchema),
      meetingAnalysisController.generate
    );
    router.get(
      "/:id/meeting-analysis",
      optionalAuth,
      meetingAnalysisController.get
    );
    router.get(
      "/:id/meeting-analysis/job",
      optionalAuth,
      meetingAnalysisController.getActiveJob
    );
    router.get(
      "/:id/meeting-analysis/job/:jobId",
      optionalAuth,
      meetingAnalysisController.getJob
    );
    router.patch(
      "/:id/meeting-analysis/title",
      optionalAuth,
      validateBody(UpdateMeetingAnalysisTitleSchema),
      meetingAnalysisController.updateTitle
    );
  }

  return router;
}
