import crypto from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { ExportFormat } from "@audio-to-text/shared";
import { ExportSession } from "../../../application/use-cases/export/ExportSession.js";

export class ExportController {
  constructor(private exportSession: ExportSession) {}

  public export = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId = req.params["id"]!;
      const format = req.query["format"] as ExportFormat;
      const userId = req.user?.userId || null;
      const guestToken = req.guestToken;
      const guestTokenHash = guestToken
        ? crypto.createHash("sha256").update(guestToken).digest("hex")
        : null;

      const result = await this.exportSession.execute({
        sessionId,
        format,
        userId,
        guestTokenHash
      });

      res.setHeader("Content-Type", result.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.fileName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`
      );

      res.send(result.data);
    } catch (err) {
      next(err);
    }
  };
}
