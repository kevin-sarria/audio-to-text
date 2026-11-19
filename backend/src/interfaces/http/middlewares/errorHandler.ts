import { Request, Response, NextFunction } from "express";
import { DomainError } from "../../../domain/errors/DomainError.js";
import { ValidationError } from "../../../domain/errors/ValidationError.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof DomainError) {
    const responseBody: Record<string, unknown> = {
      success: false,
      error: err.message
    };

    if (err instanceof ValidationError && err.details) {
      responseBody["details"] = err.details;
    }

    res.status(err.statusCode).json(responseBody);
    return;
  }

  // Manejar errores de esquemas Zod con mensaje comprensible
  if ((err as any)?.name === "ZodError" || Array.isArray((err as any)?.issues)) {
    const issues = (err as any).issues || [];
    const issueSummary = issues
      .map((i: any) => `${i.path ? i.path.join(".") : "campo"}: ${i.message}`)
      .join("; ");
    res.status(400).json({
      success: false,
      error: `Error de validación en la estructura generada: ${issueSummary || err.message}`
    });
    return;
  }

  // Errores internos no controlados
  console.error("Unhandled Server Error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Ocurrió un error interno en el servidor."
  });
}
