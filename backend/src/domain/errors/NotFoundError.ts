import { DomainError } from "./DomainError.js";

export class NotFoundError extends DomainError {
  public readonly statusCode = 404;

  constructor(resource: string, identifier?: string) {
    super(
      identifier
        ? `Recurso '${resource}' con identificador '${identifier}' no encontrado.`
        : `Recurso '${resource}' no encontrado.`
    );
  }
}
