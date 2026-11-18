import { DomainError } from "./DomainError.js";

export class NotImplementedError extends DomainError {
  public readonly statusCode = 501;

  constructor(featureName: string) {
    super(`La funcionalidad '${featureName}' no está implementada en esta versión (stub).`);
  }
}
