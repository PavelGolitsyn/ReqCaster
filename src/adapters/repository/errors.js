export class RepositoryError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
    this.details = details;
  }
}

export class RepositoryBusyError extends RepositoryError {
  constructor(message = "Repository write lock is busy") {
    super("REPOSITORY_BUSY", message);
    this.name = "RepositoryBusyError";
  }
}

export class IntegrityError extends RepositoryError {
  constructor(message, details = []) {
    super("INTEGRITY_FAILURE", message, details);
    this.name = "IntegrityError";
  }
}

export class SchemaVersionError extends RepositoryError {
  constructor(message, details = []) {
    super("SCHEMA_VIOLATION", message, details);
    this.name = "SchemaVersionError";
  }
}

export class ValidationError extends RepositoryError {
  constructor(details) {
    super("SCHEMA_VIOLATION", "Canonical repository validation failed", details);
    this.name = "ValidationError";
  }
}
