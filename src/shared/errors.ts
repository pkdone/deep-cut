export abstract class AppError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigurationError extends AppError {
  readonly code = 'CONFIGURATION_ERROR';
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
}

export class DomainRuleError extends AppError {
  readonly code = 'DOMAIN_RULE_ERROR';
}

export class ExternalServiceError extends AppError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
}
