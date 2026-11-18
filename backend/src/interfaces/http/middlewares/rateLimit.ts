import { rateLimit } from "express-rate-limit";
import { Request } from "express";

const isDesktop = process.env["APP_MODE"] === "desktop";

// Límite general para la API
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: isDesktop ? 100000 : 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: "Demasiadas peticiones. Intente más tarde." }
});

// Límite estricto para autenticación
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: isDesktop ? 100000 : 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: "Demasiados intentos de autenticación. Intente más tarde." }
});

// Límite estricto para subida de archivos
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: isDesktop ? 100000 : 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId || req.ip || "unknown",
  message: { success: false, error: "Límite de subida de archivos alcanzado para este período." }
});
