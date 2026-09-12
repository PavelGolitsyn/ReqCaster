import { CURRENT_SCHEMA_VERSION } from "./validation.js";

export class MigrationRunner {
  constructor(repository, migrations = []) {
    this.repository = repository;
    this.migrations = [...migrations];
  }

  preview() {
    return this.repository.previewMigrations(this.migrations);
  }

  run(options = {}) {
    return this.repository.migrate(this.migrations, options);
  }
}

// The first pre-release envelope used `revision` and omitted the explicit
// document type and relationship allocator. This migration is intentionally
// deterministic and safe to apply to an already transformed in-memory value.
export const MIGRATIONS = Object.freeze([{
  id: "canonical-envelope-0.9-to-1.0",
  fromVersion: "0.9.0",
  toVersion: CURRENT_SCHEMA_VERSION,
  migrate(documents) {
    for (const level of ["business", "software"]) {
      const document = documents[level];
      document.$schema = `.engine/schemas/v1/${level}-requirements.schema.json`;
      document.documentType = level;
      document.repositoryRevision = document.repositoryRevision ?? document.revision ?? 0;
      delete document.revision;
      document.nextRelationshipNumber ??= 1;
      document.requirements ??= [];
      document.relationships ??= [];
    }
    const next = Math.max(documents.business.nextRelationshipNumber, documents.software.nextRelationshipNumber);
    documents.business.nextRelationshipNumber = next;
    documents.software.nextRelationshipNumber = next;
    return documents;
  },
  warnings: ["Legacy relationship counters were synchronized to the larger persisted value."],
}]);
