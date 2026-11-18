import { DomainError } from "./DomainError.js";

export class ForbiddenError extends DomainError {
  public readonly statusCode = 403;

  constructor(message = "Acceso denegado al recurso solicitado.") {
    super(message);
  }
}
