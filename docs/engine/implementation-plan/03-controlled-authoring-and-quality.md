# Stage 3 — Controlled Authoring and Quality

## Outcome

Enable only `requirements-manager` to create, update, and retire requirements through validated commands. Structural violations block commits; language-quality findings remain advisory unless an explicit organization policy promotes a rule to a governed gate.

## Work packages

### 3.1 Create requirements

`requirements.create`:

- accepts document type and structured content but no client-selected normal ID;
- allocates `BR-` or `SR-` IDs in the repository transaction;
- requires statement, category, rationale/source, owner, priority, status, and verification planning according to configured rules;
- records agent identity, accountable principal, creation time, source, and AI-assistance provenance;
- defaults new content to `proposed` unless a privileged import workflow says otherwise;
- accepts an idempotency key so a retried call cannot create duplicates;
- returns the created record, warnings, item version, and repository revision.

### 3.2 Update requirements

`requirements.update`:

- uses a constrained patch format rather than arbitrary code or JSONPath;
- requires `expectedVersion` and a reason for material fields;
- prevents changes to ID, creation provenance, and immutable history;
- increments item version exactly once per committed command;
- revalidates the complete item and cross-file invariants;
- classifies fields as material, metadata-only, or administrative for later impact rules;
- returns field-level before/after values in a bounded diff.

### 3.3 Retire instead of delete

`requirements.retire`:

- requires reason, decision reference when applicable, and expected version;
- previews active inbound/outbound links, baselines, releases, and unresolved impact;
- writes a tombstone/retirement record while retaining the requirement and history;
- prevents retirement when policy requires an approved change or unresolved critical dependencies exist;
- supports supersession through a separate relationship to a replacement ID.

Physical purge is an offline records-governance procedure with explicit retention authority and is not an agent tool.

### 3.4 Draft validation and authoring quality

`requirements.validateDraft` is available to all listed roles and performs no write. It reports:

- schema and controlled-vocabulary errors;
- missing subject, obligation, measurable threshold, units, conditions, rationale, source, or verification planning where applicable;
- vague/weak terms, passive ownership, ambiguous pronouns, multiple obligations, TBDs, possible duplicates, inconsistent terminology, and design-biased wording;
- conflicts or near-duplicates as candidates, never as automatic facts;
- each finding's rule ID/version, severity, evidence span/path, explanation, and suggested correction.

AI or heuristic suggestions are clearly labeled. Only accepted, manager-submitted content becomes governed data, and provenance records the suggestion source and subsequent edits.

### 3.5 Bulk safety

- `requirements.bulkPreview` validates every candidate against one repository revision and returns exact affected IDs, warnings, errors, and diff summary.
- Preview has no persistence or lifecycle effect.
- Successful preview returns a short-lived token bound to actor, repository revision, normalized command set, and diff hash.
- `requirements.bulkCommit` accepts only that token plus idempotency key; any revision/diff mismatch forces a new preview.
- Bulk commit is all-or-nothing and produces per-item history plus one transaction/audit correlation.
- Enforce configurable item and byte limits.

### 3.6 Prevent unsupported direct edits

- Document the two JSON files as engine-owned.
- Recommend filesystem permissions that give the service write access and agents read access only through tools.
- Store last committed checksums and verify them on open.
- Detect out-of-band changes and enter an integrity-failure state until a manager runs a governed reconciliation/import flow.
- Add CI/pre-commit validation for repositories that version the JSON files.
- Never silently adopt direct edits as trusted history.

## Required tests

- Permission tests prove read-only roles cannot create, update, retire, bulk commit, or bypass through validation endpoints.
- Idempotent create/update retry tests.
- Stale expected-version conflict tests with no partial changes.
- Required-field, unknown-field, controlled-value, and authoring-quality rule fixtures.
- Tests prove advisory findings do not block unless policy explicitly promotes them.
- Retirement with links, baseline membership, supersession, and denied physical deletion tests.
- Bulk preview expiration, tampering, concurrent revision, partial failure, and exact-diff tests.
- Out-of-band edit detection and governed reconciliation tests.

## Deliverables

- Manager-only create, update, retire, bulk preview, and bulk commit tools.
- Read-only draft validation tool and versioned quality-rule catalog.
- Optimistic concurrency and idempotency implementation.
- Direct-edit detection and reconciliation design.
- Authoring guide and examples for business/software requirements.

## Exit criteria

- Every normal mutation passes authorization, validation, concurrency checks, transaction commit, history, and audit hooks.
- Read-only roles have no persistent side-effect path.
- Generated suggestions cannot enter governed data without explicit manager acceptance.
- Bulk operations cannot commit a scope different from their preview.
- Direct JSON edits are detectable and never silently legitimized.

