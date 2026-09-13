# ADR 0010: Versioned governed configuration and forward migrations

- Status: Accepted
- Context: Workflow and trace policy affect meaning and baseline readiness.
- Decision: Configuration is strict, versioned, manager-only, audited, and captured by every baseline; migrations are ordered, idempotent, previewed, backed up, and forward-only.
- Rejected: Unversioned environment flags; silent coercion; editing policy during a transaction.
- Consequences: Contradictory transitions, endpoints, and limits fail validation before activation.
- Security effects: Configuration change is a privileged mutation with optimistic concurrency.
- Migration impact: Unknown future versions are refused and rollback restores a verified backup rather than reverse-transforming.
