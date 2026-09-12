# Stage 1 — Canonical JSON Repository

## Outcome

Implement the two-file source of truth with strict validation, stable numeric identifiers, safe concurrent access, forward migrations, and deterministic recovery. At the end of this stage, the repository can be initialized, opened, validated, read, and transactionally replaced through an internal service.

## Storage layout

```text
<requirements-root>/
  business-requirements.json
  software-requirements.json
  .engine/
    schemas/
    config/
    locks/
    transactions/
    audit/
    versions/
    baselines/
    indexes/
    imports/
    reports/
    quarantine/
```

Only the two named JSON files hold current requirements and relationships. The `.engine` directory supports governance and operation. Indexes and caches are derived; audit, versions, and baselines are governed records.

## Work packages

### 1.1 Define and publish schemas

- Implement the shared document envelope and separate business/software constraints.
- Implement requirement, relationship, external-reference, acceptance-criterion, provenance, retirement, and extension schemas.
- Reject unknown top-level and record fields except within bounded `customAttributes`.
- Bound string lengths, array sizes, custom-attribute depth, and total document size.
- Encode controlled vocabularies as configuration references where appropriate.
- Validate that business records use `BR-` and software records use `SR-`.
- Disallow NaN, Infinity, duplicate object keys, ambiguous Unicode normalization, and non-canonical timestamps.

### 1.2 Implement identifier allocation

- Keep `nextRequirementNumber` independently in each canonical document.
- Allocate under the repository write lock.
- Format as six digits and validate overflow explicitly.
- Never decrement or infer the next number from current records.
- Preserve consumed numbers when a transaction reaches the durable commit point; never reuse retired IDs.
- Add a separate allocator for normalized relationships, for example `RL-000001`.

### 1.3 Enforce domain invariants

- Unique requirement IDs across both documents.
- Unique relationship IDs across both documents.
- Record `level` and document placement agree.
- Item version is a positive monotonic integer.
- Internal link endpoints exist; version-pinned endpoints refer to known versions.
- Relationship type and endpoints satisfy configured trace-model rules.
- Status, priority, category, criticality, verification method, and extension keys are valid.
- No active requirement depends on a missing or physically deleted internal record.
- Retired records remain addressable and cannot be mistaken for active scope.
- Repository revisions in the two documents represent one committed transaction.

### 1.4 Implement transactional persistence

- Acquire one project-scoped exclusive lock for all mutations and a compatible read strategy.
- Load both documents and verify schema, semantic invariants, and integrity metadata before mutation.
- Write candidate documents to same-filesystem temporary files.
- Flush file data and containing directory as supported by the target platform.
- Record a transaction manifest with before/after revisions and checksums.
- Atomically rename both candidates using a recoverable two-file commit protocol.
- On startup, inspect transaction manifests and deterministically roll forward or back to the last complete revision.
- Preserve the failed candidate in quarantine when corruption is detected; never silently repair governed content.

### 1.5 Canonical serialization and hashes

- Select one deterministic JSON serialization: UTF-8, normalized line endings, stable key ordering, defined indentation, and terminal newline.
- Compute document and transaction hashes from canonical bytes.
- Exclude mutable operational values from hashes only when the exclusion is explicit and tested.
- Make semantically identical data serialize identically.

### 1.6 Migration framework

- Detect schema versions on open.
- Provide explicit, ordered, idempotent forward migrations.
- Preview migrations and back up inputs before commit.
- Validate and checksum before and after every migration.
- Refuse unknown future versions.
- Record migration actor, tool version, source/target schema versions, counts, warnings, and checksums.

## Required tests

- Golden schema fixtures for both documents and every record subtype.
- Property tests for allocation uniqueness and monotonicity under concurrent create attempts.
- Duplicate ID, wrong prefix, title-bearing ID, invalid status, broken link, and unknown-field rejection tests.
- Fault injection before/after each transaction step proves recovery produces either the old or new complete revision, never a mixed pair.
- Concurrent reader/writer and writer/writer tests.
- Deterministic serialization and hash tests on different supported runtimes/platforms.
- Migration repeatability, rollback-from-backup, and unsupported-version tests.
- Large but allowed document tests plus clean rejection above configured limits.

## Deliverables

- Versioned JSON Schemas and configuration schemas.
- Repository initialization, validation, transaction, and recovery services.
- Canonical serializer and checksum utilities.
- Migration runner and fixtures.
- Operator commands for validate, diagnose, rebuild-derived-state, and recover.

## Exit criteria

- A new repository initializes both canonical files with revision zero and compliant counters.
- Invalid content never reaches the commit point.
- A simulated crash at every write phase leaves a recoverable, internally consistent repository.
- IDs remain stable and are never duplicated or reused.
- The same logical data produces the same canonical bytes and checksums.
- All access in later stages can depend on a single repository interface rather than raw filesystem calls.

