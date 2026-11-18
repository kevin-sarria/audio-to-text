import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { env } from "../../../infrastructure/config/env.js";
import {
  validateAudioUpload,
  sanitizeFileName
} from "../validators/upload.validator.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";

const maxSizeBytes = (env.MAX_UPLOAD_MB || 200) * 1024 * 1024;

const storage = multer.memoryStorage();

export const multerUpload = multer({
  storage,
  limits: {
    fileSize: maxSizeBytes,
    files: 1
  }
});

export function handleAudioUpload(req: Request, _res: Response, next: NextFunction) {
  if (!req.file) {
    return next(new ValidationError("No se ha enviado ningún archivo de audio en el campo 'audio'."));
  }

  const validation = validateAudioUpload(
    {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      buffer: req.file.buffer
    },
    maxSizeBytes
  );

  if (!validation.isValid) {
    return next(new ValidationError(validation.errorMessage || "Archivo de audio inválido."));
  }

  // Sanitizar el nombre original del archivo en el request
  req.file.originalname = sanitizeFileName(req.file.originalname);

  next();
}
