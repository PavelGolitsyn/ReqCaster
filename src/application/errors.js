export const ERROR_CODES = Object.freeze([
  "INVALID_ARGUMENT",
  "SCHEMA_VIOLATION",
  "NOT_FOUND",
  "FORBIDDEN",
  "VERSION_CONFLICT",
  "REPOSITORY_BUSY",
  "INTEGRITY_FAILURE",
  "PREVIEW_EXPIRED",
  "INTERNAL_ERROR",
]);

export class ApplicationError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    if (!ERROR_CODES.includes(code)) throw new TypeError(`Unknown error code: ${code}`);
    this.name = "ApplicationError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? [];
    this.current = options.current;
    this.cause = options.cause;
  }

  toEnvelope(correlationId) {
    return {
      schemaVersion: "1.0.0",
      correlationId,
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        details: this.details,
        ...(this.current ? { current: this.current } : {}),
      },
    };
  }
}
