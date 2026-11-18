import { DomainError } from "./DomainError.js";

export class UnauthorizedError extends DomainError {
  public readonly statusCode = 401;

  constructor(message = "No autorizado.") {
    super(message);
  }
}
