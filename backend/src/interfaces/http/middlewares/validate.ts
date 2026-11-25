import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ValidationError } from "../../../domain/errors/ValidationError.js";

function describeIssues(err: ZodError): string {
  const detail = err.errors
    .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
  return detail ? ` (${detail})` : "";
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError(`Validación de campos fallida${describeIssues(err)}`, err.errors));
      } else {
        next(err);
      }
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError(`Validación de parámetros fallida${describeIssues(err)}`, err.errors));
      } else {
        next(err);
      }
    }
  };
}
