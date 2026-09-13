# Stage 6 — History, Baselines, and Audit

## Outcome

Make every governed state reconstructable. Item versions, relationship versions, immutable baseline snapshots, field-level comparisons, attributable audit events, integrity verification, backup, and recovery form one evidence chain.

## Work packages

### 6.1 Immutable item and relationship versions

- On every successful mutation, persist the complete new affected record version or a replay-safe event plus periodic snapshot.
- Retain author, accountable principal, agent role, time, reason, command, change request, correlation ID, and before/after hashes.
- Provide `requirements.history` with bounded pagination and field-level change summaries.
- Reconstruct an exact item version without relying on current content.
- Treat retirement and relationship removal as new versions, not disappearance.
- Version history is append-only to normal service identities.

### 6.2 Audit log

- Append one transaction audit event for every attempted privileged action and a governed record event for every committed mutation.
- Record authorization outcome and stable error category for rejected privileged attempts without storing sensitive request bodies.
- Chain or sign event batches so deletion/reordering/modification is detectable.
- Rotate and archive according to retention configuration without breaking verification.
- Provide an integrity verifier and clear degraded-mode behavior.
- Separate operational logs from the governed audit trail.

### 6.3 Baseline readiness

`baselines.checkReadiness` evaluates a named query/set against policy:

- all selected requirements are at allowed states;
- required sources, owners, rationale, priority, acceptance criteria, and verification methods exist;
- required relationship/coverage rules pass;
- blocking review findings, conflicts, TBDs, suspect links, and change requests are resolved;
- scope, exclusions, releases/variants, configuration, and exceptions are explicit;
- every exception has rationale, authority, and expiry/review date.

The result is revision-pinned and returns exact blockers/warnings. Readiness does not itself approve or create a baseline.

### 6.4 Immutable baseline creation

`baselines.create` requires manager authorization, a successful current readiness token, name, purpose/milestone, scope query or exact IDs, approval references, and idempotency key.

The baseline manifest contains:

- baseline ID/name/version and immutable creation time;
- project, scope, exclusions, release/variant/configuration;
- exact requirement and relationship versions;
- schema, policy, trace-model, and report-template versions;
- source repository revision;
- approvals/signatures as governed references;
- unresolved authorized exceptions;
- snapshot/manifest checksums and integrity proof.

Changing any baseline content creates a new baseline or auditable amendment; it never updates the original.

### 6.5 Comparison

`requirements.compare` supports:

- item version to item version;
- baseline to baseline;
- baseline to current state;
- current repository revision to another retained revision where supported.

Report additions, retirements/removals, statement and metadata field changes, relationship changes, status/evidence changes, and configuration differences. Provide compact summaries plus bounded detailed pages, using stable JSON Pointer-like field paths.

### 6.6 Backup and recovery

- Back up canonical files, governed `.engine` state, configuration, keys/reference metadata, and manifests as one consistency group.
- Define recovery point and recovery time objectives in Stage 9; implement the mechanism here.
- Verify checksums before declaring backup success.
- Restore into an isolated location, validate all invariants, rebuild indexes, verify audit/baseline chains, then perform controlled cutover.
- Test recovery regularly with representative data.
- Never overwrite the only recoverable copy during restore.

## Required tests

- Reconstruct every item/link version from a sequence of mixed transactions.
- Audit tampering, deletion, reordering, and rotation-boundary detection.
- Baseline readiness fixtures for every blocker and authorized exception.
- Baseline immutability under current edits, schema migration, and attempted direct mutation.
- Comparison golden tests for add/remove/change/link/config cases.
- Backup during safe consistency point and full isolated restore drills.
- Restored baseline/report checksums match originals and search indexes rebuild.
- Authorization tests for baseline creation, amendments, and audit access.

## Deliverables

- Immutable version store and history query.
- Verifiable audit log and integrity tooling.
- Baseline readiness/create/get/list services.
- Field-level and baseline comparison service.
- Backup, restore, validation, and rehearsal procedures.

## Exit criteria

- An auditor can determine who changed what, when, why, under which authority, and from/to which exact values.
- Every baseline is immutable, self-describing, and reconstructable.
- Current edits never change baseline reads or baseline-derived report inputs.
- Tampering with governed history is detectable.
- A tested restore reproduces canonical data, history, baselines, and integrity checks.

