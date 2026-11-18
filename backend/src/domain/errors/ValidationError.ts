import { DomainError } from "./DomainError.js";

export class ValidationError extends DomainError {
  public readonly statusCode = 400;

  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}
