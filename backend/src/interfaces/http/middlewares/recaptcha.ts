import { Request, Response, NextFunction } from "express";
import { ICaptchaVerifier } from "../../../domain/services/ICaptchaVerifier.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";

export function createRecaptchaMiddleware(captchaVerifier: ICaptchaVerifier) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token =
      req.body?.recaptchaToken ||
      req.headers["x-recaptcha-token"] ||
      req.query["recaptchaToken"];

    const clientIp = req.ip || req.socket.remoteAddress;

    const isValid = await captchaVerifier.verify(
      typeof token === "string" ? token : undefined,
      clientIp
    );

    if (!isValid) {
      return next(new ValidationError("Validación de reCAPTCHA fallida."));
    }

    next();
  };
}
