# Implementation Plan: Embedded Record History and Transaction Compaction

## Status

Proposed cross-stage change for implementation.

## Summary

Move retained requirement and relationship versions from accumulated
full-document transaction snapshots into the two canonical JSON documents.

Add a strict document-level `_history` section to each canonical file. The
existing `requirements` and `relationships` arrays continue to contain current
records only. Before an existing record is replaced with its next version, its
complete current record is appended once to `_history` with immutable
transition metadata.

Normal reads remain current-only. Existing exact-version and history operations
access embedded versions deliberately and remain bounded and permission-aware.

Keep full before/after transaction candidates only while a transaction may need
crash recovery. After the canonical pair, integrity record, committed manifest,
and audit state are durable, remove the four candidate documents and retain the
compact manifest, hashes, provenance, and idempotency receipt.

This issue is independent from, but should be coordinated with,
[`simplified-authorization-roles.md`](./simplified-authorization-roles.md)
because transition provenance stores the canonical authorization role.

## Current state

`CanonicalJsonRepository.#commitLocked` writes these files for every
transaction:

```text
.engine/transactions/<transaction-id>/
  before-business.json
  before-software.json
  after-business.json
  after-software.json
  manifest.json
```

The full snapshots remain after commit. `readVersion`, `history`, and
`readRevision` scan manifests and load full document pairs. Storage therefore
grows with the size of the entire repository multiplied by the number of
transactions, even when a transaction changes one small requirement.

Canonical requirement records contain only the current `version`. Relationship
records have action-oriented `history`, but it is not a complete version store.
Baselines separately retain immutable scoped snapshots and must remain
independent from transaction recovery.

### Storage model

Let `D(t)` be the combined size of both canonical documents after transaction
`t`, `C(t)` the combined size of records changed by that transaction, and `M(t)`
the compact manifest/audit metadata. Ignoring compression and filesystem
overhead, retained transaction candidates currently approach:

```text
current design:  sum over t of (2 * D(t-1) + 2 * D(t))
proposed design: D(current) + sum over t of C(t-1) + sum over t of M(t)
```

The proposed design remains append-only and grows with real record history, but
a one-record update no longer retains four copies of otherwise unchanged
documents. Prepared transactions temporarily need the existing recovery space;
that space is bounded by pending or not-yet-cleaned transactions rather than the
complete transaction lifetime.

Audit events, migration backups, quarantine evidence, and immutable baseline
snapshots remain separately retained. Report them independently so the storage
reduction is not overstated.

## Goals

1. Reconstruct every retained requirement and relationship version directly
   from the current canonical JSON pair.
2. Keep current requirement and relationship reads compact by default.
3. Preserve field-level history, provenance, hashes, exact-version reads,
   baselines, audit integrity, and crash recovery.
4. Make steady-state history storage proportional to changed record sizes,
   rather than total repository size per transaction.
5. Preserve the project-scoped lock, two-file consistency, deterministic
   serialization, and fail-closed direct-edit detection.
6. Retain transaction manifests for audit correlation and idempotency while
   making committed full candidates disposable.
7. Provide a forward, previewable, idempotent migration with exact parity and
   storage-reclamation reports.
8. Keep read, search, trace, export, report, cache, and support-bundle paths from
   exposing history accidentally.

## Non-goals

- Removing the tamper-evident audit log or immutable baseline store.
- Using Git as the governed version store.
- Physically deleting retired requirements or ordinary historical versions.
- Returning complete history in list or search responses.
- Treating embedded history as a substitute for write-ahead crash recovery.
- Keeping arbitrary full repository revisions forever. Exact record versions
  and explicit baselines are the durable historical contracts.
- Generalizing all change-request, review, verification-plan, evidence, and
  outbox versioning in the first implementation.
- Silently accepting direct edits or user-imported history.

## Canonical embedded history model

### Document shape

Add `_history` to both canonical document envelopes:

```json
{
  "$schema": ".engine/schemas/v2/business-requirements.schema.json",
  "schemaVersion": "2.0.0",
  "documentType": "business",
  "repositoryRevision": 42,
  "nextRequirementNumber": 18,
  "nextRelationshipNumber": 31,
  "requirements": [
    {
      "id": "BR-000017",
      "version": 3,
      "statement": "The product shall ...",
      "level": "business",
      "category": "functional",
      "status": "approved"
    }
  ],
  "relationships": [],
  "_history": {
    "schemaVersion": "1.0.0",
    "requirements": [
      {
        "id": "BR-000017",
        "version": 2,
        "snapshot": {
          "id": "BR-000017",
          "version": 2,
          "statement": "The earlier governed statement ...",
          "level": "business",
          "category": "functional",
          "status": "reviewed"
        },
        "supersededBy": {
          "version": 3,
          "repositoryRevision": 42,
          "transactionId": "000000000042-...",
          "timestamp": "2026-09-14T12:00:00.000Z",
          "agentId": "agent:authoring",
          "principalId": "human:owner",
          "role": "requirements-writer",
          "command": "requirements.update",
          "reason": "Approved clarification",
          "correlationId": "corr-...",
          "beforeHash": "...",
          "afterHash": "..."
        }
      }
    ],
    "relationships": []
  }
}
```

The example is illustrative. Generated schemas define exact bounds, required
fields, and optional provenance.

### Why `_history` is document-level

- `requirements` and `relationships` remain current-only, so ordinary consumers
  never choose among duplicate IDs.
- Historical snapshots cannot recursively contain history.
- One explicit response-sanitization rule removes `_history` from normal reads.
- Current-record uniqueness and most application-service code remain unchanged.
- History can be sorted and validated independently by `(id, version)`.
- Baselines can copy selected versions without copying each record's entire
  historical chain.
- The two canonical JSON files remain the complete requirement/relationship
  version store requested by the design.

### History entry rules

1. `snapshot` is the complete canonical record at the indicated version, but it
   contains no `_history` or nested version wrapper.
2. Wrapper `id` and `version` equal the values inside `snapshot`.
3. Entries are unique by `(record kind, id, version)` and canonically sorted by
   ID, then ascending version.
4. For a current record at version `N`, history contains exactly versions
   `1..N-1`; gaps, forks, duplicates, and future versions are invalid.
5. A current version-1 record has no history entry.
6. Creation provenance remains on the record and travels with the snapshot when
   superseded.
7. `beforeHash` equals the canonical hash of `snapshot`.
8. `afterHash` equals the canonical content hash of the version that superseded
   it.
9. Record content hashes exclude document-level `_history`; document hashes
   include it.
10. `supersededBy.version` equals `version + 1`.
11. `supersededBy.repositoryRevision` is greater than the revision that created
    the old version and no greater than the current document revision.
12. Existing history is an immutable prefix across normal transactions. Writers
    cannot alter, reorder, replace, or remove entries.
13. Retirement and relationship removal create current tombstone versions;
    nothing disappears from current/history addressability.
14. Requirement history stays in its business/software owning document.
15. Relationship history stays in the document selected by the deterministic
    relationship-owner rule.
16. New transition metadata uses the authorization-role vocabulary active for
    its entry schema. Historical values remain valid under their original schema.

### Scope beyond requirements

Move requirement and relationship versions together. Existing contracts promise
exact relationship reconstruction for version-pinned endpoints, comparisons,
baselines, and Stage 6 history.

Relationship records currently contain domain action `history`. To avoid
confusion with full snapshots, either:

- retain it under a clearer name such as `lifecycleHistory`; or
- keep its published name but document that `_history.relationships` is the
  authoritative complete version store.

Choose through the schema ADR before coding. Do not silently give the existing
action log new semantics.

Change requests, reviews, verification plans, and evidence retain their current
specialized histories. They are not currently reconstructed by
`Repository.readVersion`. A later ADR may generalize the mechanism after the
first implementation is measured.

## Mutation algorithm

Application services continue to mutate an in-memory candidate through the
single repository command path. The repository adapter, not individual
services, creates embedded history.

Immediately before final validation:

1. Match trusted before and candidate after requirements/relationships by ID.
2. Compare canonical record content while ignoring only `version`.
3. If content is unchanged, require an unchanged version and append no history.
4. If content changed, require `after.version == before.version + 1`.
5. Copy the complete before record into a non-recursive history entry.
6. Attach transition metadata from authenticated command context and the pending
   repository/transaction revision.
7. Append to the candidate owning document and canonical-sort the collection.
8. Reject duplicate ID/version entries or any change to the trusted history
   prefix.
9. Run schema, cross-file, history-chain, relationship endpoint, baseline
   protection, and authorization validation.
10. Commit the current changes and appended history atomically as one two-file
    repository revision.

Creation writes only a current version-1 record. Updating it archives version 1
and writes current version 2. Retirement archives the active version and writes
a current tombstone. Bulk operations archive every changed record once.

The generated history step must be idempotent within retry/recovery processing.
An idempotency replay returns the original result without creating another
history entry.

## Transaction journal redesign

### Required durable states

Embedded history replaces permanent transaction candidates as the version
source, not their temporary crash-recovery purpose.

Use this lifecycle:

1. Under the project lock, load and verify the current canonical pair, integrity
   record, audit chain, and relevant prepared transactions.
2. Produce and validate the complete candidate pair, including `_history`.
3. Write checksummed before/after candidates plus a `prepared` manifest and fsync
   them. This remains the recoverable commit point.
4. Install both after candidates and durably update the integrity, transaction,
   and audit state using a documented, fault-injected ordering.
5. Mark the transaction committed only when startup recovery can prove the
   canonical pair and evidence state.
6. After committed state is durable, remove the four candidate documents.
7. Retain the compact manifest with hashes, provenance, idempotency receipt,
   status, timestamps, and cleanup state.
8. If cleanup fails, report `cleanupPending` and retry safely.

Cleanup may remove only files named by a strictly valid committed manifest whose
hashes match. It must never remove candidates belonging to a prepared
transaction.

Keeping both before and after candidates until commitment preserves existing
rollback/roll-forward behavior. Removing them afterward provides the storage
reduction without weakening crash recovery.

### Recovery behavior

- `prepared`: verify candidates and roll forward; if after candidates are
  corrupt, verify before candidates and roll back as today.
- `committed` with candidates: verify current integrity, then finish cleanup.
- `committed` without candidates: normal compact state.
- `rolled-back`: retain the compact manifest and quarantine evidence required by
  policy; clean redundant verified candidates only through the governed cleanup
  rule.
- missing candidate referenced by `prepared`: `INTEGRITY_FAILURE` unless the
  installed canonical pair and integrity record prove the committed after state.
- malformed manifests, broken hashes, or a non-prefix embedded history:
  `INTEGRITY_FAILURE`; never regenerate or silently repair history.

Recovery and cleanup must be idempotent. Repeated startup after any injected
failure produces the same old or new complete pair and never appends duplicate
history.

### Compact manifest contract

Retain at least:

- transaction ID, status, schema version, before/after revisions and hashes;
- actor, accountable principal, canonical role, command, reason, correlation ID,
  and change-request reference where applicable;
- created, committed, recovered, and cleanup timestamps;
- idempotency scope, key hash, request hash, and replay result;
- audit event reference/hash when the audit implementation supports it;
- cleanup status and safe diagnostic failure category.

Do not retain sensitive request bodies merely because candidate documents were
removed.

## Historical repository revisions

Removing committed document snapshots means `readRevision(revision)` cannot
promise arbitrary full repository reconstruction. Embedded history reconstructs
requirement and relationship versions, not every historical allocator,
configuration, change-control record, quality-control record, or outbox state.

Version the contract as follows:

- retain `repositoryRevision` for concurrency and snapshot identity;
- retain `requirements.get(id, version)`, `requirements.history`, item-version
  comparison, baseline reads, and baseline comparison;
- make `readRevision` an optional internal capability or support only current
  and temporarily retained recovery/compatibility revisions;
- deprecate `requirements.compare` selectors of `revision:<n>` unless a
  deployment enables a separate bounded repository snapshot archive;
- direct durable whole-scope comparisons to explicit baselines.

Stage 6 already qualifies repository-revision comparison with “where supported,”
but the contract and migration notes must make the behavior explicit.

## Read and query behavior

### Default current-only behavior

- `requirements.get`, `requirements.search`, `requirements.list`,
  `requirements.trace`, `requirements.coverage`, reports, dashboards, and the
  derived index use only current `requirements` and `relationships`.
- `_history` is never returned by a normal projection, including `full`.
- Raw JSON exports, caches, logs, errors, metrics, traces, notifications, and
  support bundles exclude `_history` unless using a specific governed history
  export/diagnostic path.
- Response-size calculation occurs after history exclusion.
- Internal helpers distinguish current collections from historical collections;
  generic recursive scans are prohibited in read/index/report paths.

### Exact-version access

`requirements.get` with one ID and a positive `version`:

1. Check the current record first.
2. Resolve older versions by indexed `(kind, id, version)` lookup in `_history`.
3. Apply the same retirement, item, component, and field authorization rules as
   current reads.
4. Return the selected record without wrapper transition metadata unless the
   request explicitly asks for a permitted history projection.
5. Include source kind, item version, repository revision, schema version, ETag,
   and correlation ID.

### History access

`requirements.history`:

- combines ordered historical snapshots with the current version;
- returns bounded event summaries rather than every full snapshot;
- derives field changes by comparing adjacent versions;
- returns event type, version, actor/principal subject to projection, timestamp,
  command/reason, hashes, repository revision, and transaction correlation;
- optionally includes one full selected snapshot only when response limits and
  authorization permit it; exact `get` remains preferred;
- binds cursors to ID, repository revision, history schema version, immutable
  history length, and history hash;
- fails stale cursors explicitly after a version is appended.

Historical authorization must not leak hidden content through counts, field
paths, match snippets, hashes, or timing beyond the documented threat model.

### Search and trace

- Text that appears only in history must not match ordinary search.
- Search indexes contain only current records and remain fully rebuildable from
  current canonical collections.
- Version-pinned relationship endpoints resolve through the exact-version
  repository API, not through search.
- Current trace ignores historical relationship versions.
- Baseline trace uses the exact relationship/requirement versions pinned by the
  baseline.

## Baselines, audit, and backups

### Baselines

Baseline manifests continue to pin exact requirement and relationship versions.
Baseline snapshots contain only selected exact records/links and the
policy/configuration required to interpret them. They omit source `_history`.

This prevents each baseline from multiplying the complete embedded history.
Baseline immutability, checksums, and current-versus-baseline comparisons remain
unchanged.

### Audit

The hash-chained audit log remains separate from embedded record history:

- `_history` proves exact content continuity for requirements/relationships;
- audit proves attempted privileged actions, authorization outcomes, transaction
  order, and attributable evidence-chain integrity;
- compact transaction manifests correlate the two.

Neither is derived solely from the other. Mutation continues to fail closed when
required audit verification fails.

### Backup and restore

- Consistency-group backups include both canonical files with `_history`, compact
  manifests, audit state, baselines, configuration, and integrity records.
- Prepared transaction candidates are included when needed for deterministic
  recovery.
- Committed candidates are not required once their cleanup state is verified.
- Restore validates embedded chains, document hashes, manifest/audit
  correlations, baselines, and relationship endpoints before cutover.
- Derived indexes rebuild from current collections only.

## Import and export

- Ordinary imports reject `_history`; otherwise a caller could forge governed
  versions.
- Only the privileged schema migration/reconciliation path may import history,
  and it validates every snapshot, chain, hash, and source manifest.
- JSON, CSV, ReqIF, and document exports contain current state by default.
- Export reports disclose that embedded version history was omitted.
- A history-inclusive JSON export must be explicit, bounded, permission-aware,
  checksummed, and schema-versioned.
- Principal/audit-level metadata may require `requirements:audit` even if exact
  record history is readable by ordinary readers.

## Schema and integrity changes

Create canonical schema version `2.0.0`. `_history` changes document meaning,
and retiring arbitrary full-revision reconstruction changes historical
capabilities.

Add schema definitions for:

- `historyEnvelope`;
- `requirementHistoryEntry`;
- `relationshipHistoryEntry`;
- strict transition provenance;
- role vocabulary by entry schema version;
- canonical before/after hashes;
- optional change-request reference;
- bounded history entry, snapshot, collection, and document sizes.

Semantic validation must enforce:

- current ID uniqueness;
- historical `(kind, id, version)` uniqueness;
- current/history contiguity and no forks;
- snapshot wrapper ID/version agreement;
- record type, level, and owning-document agreement;
- deterministic history ordering;
- no nested `_history` or unknown fields;
- immutable history prefix across a normal transaction;
- content hashes and transition revision ordering;
- pinned endpoints resolve to a current or historical version;
- allocators exceed every allocated ID, including any history-only tombstone if
  such a state is ever permitted;
- document and history size limits.

Keep two hash concepts:

- record content hash: one current or historical record only;
- document hash: complete canonical document including `_history`.

The integrity record continues to hold document hashes. Embedded transition and
audit metadata use record content hashes.

## Migration plan

### Phase A: inventory and sizing

Before mutation:

1. Count committed, prepared, rolled-back, malformed, and incomplete transaction
   directories.
2. Measure canonical, candidate, baseline, audit, migration-backup, and
   quarantine bytes plus available disk space.
3. Verify canonical integrity, manifests, audit chain, baselines, and existing
   migration backups.
4. Build an index of every requirement/relationship version reconstructable
   from transaction snapshots.
5. Detect divergent same-number versions, gaps, deleted records, inconsistent
   provenance, or versions whose bytes differ across snapshots.
6. Produce a preview with version counts, projected v2 size, reclaimable bytes,
   required temporary space, warnings, blockers, and checksums.

Preview deletes nothing and writes no canonical data.

### Phase B: v2 reader and migration support

1. Add v2 schemas and strict validation.
2. Add dual v1/v2 repository reading.
3. Implement embedded exact-version/history reads behind the repository port.
4. Add migration preview/reconciliation tooling.
5. Add current-only projection, indexing, baseline, export, and support-bundle
   safeguards before any v2 repository is written.

### Phase C: canonical history migration

Under the project lock and normal verified migration backup procedure:

1. Replay committed transactions in revision order.
2. Identify each prior complete requirement/relationship version and its
   superseding transaction metadata.
3. Create one normalized `_history` entry per non-current version.
4. Deduplicate only when ID, version, canonical record hash, and provenance agree
   exactly; otherwise stop with a migration conflict.
5. Set both documents to schema `2.0.0`, update `$schema`, and add empty history
   collections where appropriate.
6. Advance both documents by one repository revision.
7. Validate current data, history chains, relationships, baselines, hashes, and
   exact-version parity.
8. Commit through the durable migration mechanism and rebuild indexes.

The migration is deterministic and idempotent. Running it on valid v2 data adds
no entries and changes no content.

### Phase D: parity verification

For every ID/version available before migration:

- `readVersion` returns the same canonical record;
- `requirements.history` returns the same versions, equivalent field changes,
  and equivalent provenance;
- current get/search/list/trace/coverage results are unchanged except for the
  schema version;
- baseline checksum and read behavior remains unchanged;
- audit verification and transaction correlations remain valid;
- backup and isolated restore reproduce the v2 hashes and histories.

Retain the migration backup and old transaction candidates through the approved
observation window.

### Phase E: candidate retirement

After parity and restore sign-off:

1. Write a checksummed retirement manifest listing every candidate file, its
   hash, the embedded versions replacing it, and the migration backup reference.
2. Dry-run cleanup and report exact reclaimable bytes.
3. Remove candidates only for committed transactions covered by the verified
   retirement manifest.
4. Keep compact manifests, audit events, migration backup, baseline data, and
   required quarantine evidence under their policies.
5. Re-run integrity, version, baseline, backup/restore, and index rebuild checks.

Rollback before candidate retirement restores the verified migration backup.
After retirement, rollback still requires that backup; never reverse-generate
v1 transaction snapshots from v2 history.

## Work packages by implementation stage

### Stage 0 — Architecture and contracts

- Add an ADR for embedded history, compact journals, and historical-revision
  limitations.
- Version read/compare contracts that expose item versions or revision selectors.
- Update the threat model for history leakage, rewriting, migration tampering,
  and unsafe cleanup.
- Define storage-reduction metrics and compatibility policy.
- Add acceptance narratives for exact history, current-only reads, and crash
  recovery after candidate cleanup.

### Stage 1 — Canonical JSON repository

- Add v2 schemas, validation, ordering, hashes, and migration.
- Add repository-owned history append to `execute`.
- Replace snapshot-based `readVersion` and `history` with embedded lookups.
- Add safe, idempotent, observable committed-candidate cleanup.
- Preserve prepared-transaction recovery and two-file consistency.
- Update document-size limits, fixtures, and allocator validation.

### Stage 2 — Secure reads and search

- Strip `_history` before normal projection and caching.
- Index only current records and prove historical text is excluded.
- Resolve exact versions through embedded history.
- Bind history cursors to the embedded chain.
- Apply item/field/component authorization to historical snapshots.

### Stage 3 — Controlled authoring and quality

- Prove create adds no history and update/retire add one prior version.
- Prove no-op, rejected, preview-only, stale, and failed commands add nothing.
- Ensure bulk commit archives each changed record exactly once.
- Reject `_history` in mutation inputs and patches.
- Keep history generation centralized in the repository.

### Stage 4 — Traceability and impact

- Embed full prior relationship versions.
- Decide the future name/role of relationship action history.
- Resolve pinned endpoints against embedded requirement versions.
- Keep current traversal free of historical links.
- Prove suspect marking archives affected versions atomically.

### Stage 5 — Workflow and change control

- Include change-request IDs in transition metadata where available.
- Preserve exact pre-transition versions for lifecycle changes.
- Prove multi-record change implementation archives all changed records once.
- Keep baseline memberships and suspect-link actions consistent.

### Stage 6 — History, baselines, and audit

- Reimplement history pagination and diffs from `_history` plus current.
- Remove committed candidates as a history correctness dependency.
- Keep compact manifests and audit independently tamper-evident.
- Make baseline snapshots explicitly history-free.
- Version comparison selectors and whole-revision limitations.
- Include embedded histories in backup/restore drills.

### Stage 7 — Reviews, verification, and reporting

- Ensure reports use current, baseline, or explicit exact-version sources.
- Prevent `_history` serialization through report and dashboard helpers.
- Add bounded history reports only where useful and authorized.
- Prove exact reviewed/evidence versions remain resolvable after cleanup.

### Stage 8 — Import, exchange, reuse, and AI governance

- Reject history in ordinary imports and AI proposals.
- Add privileged v1-to-v2 history reconciliation with complete counts.
- Make exports current-only by default and disclose omitted history.
- Preserve origin ID/version when the source is historical.
- Include content hashes and provenance for accepted generated changes.

### Stage 9 — Hardening and production release

- Benchmark single-item, bulk, and long-history storage/latency.
- Fault-inject every commit, audit, cleanup, recovery, and migration boundary.
- Soak-test exact-version/history reads and startup validation.
- Alert on invalid history, cleanup backlog, parity mismatch, and abnormal
  canonical growth.
- Complete backup/restore and upgrade/rollback rehearsals before retirement.
- Update end-to-end acceptance and production evidence.

## File-level implementation inventory

| Area | Primary files | Required change |
| --- | --- | --- |
| Canonical schema | `schemas/v1/repository-common.schema.json`, business/software schemas, `src/adapters/repository/validation.js` | Add v2 `_history` definitions, bounds, chain checks, and pinned-version validation. |
| Repository | `src/adapters/repository/repository.js` | Append embedded history, read exact versions, compact committed journals, and recover/clean safely. |
| Migrations | `src/adapters/repository/migrations.js`, repository CLI | Build preview, v1 reconstruction, v2 conversion, parity, and retirement tooling. |
| Ports | `src/application/ports/index.js` | Specify exact-version/history capability and make full revision reads optional/versioned. |
| Reads | `src/application/services/reads.js`, `history-baselines.js`, read cache | Exclude history by default; implement exact and bounded access. |
| Search/trace | `src/index/search-index.js`, `traceability-index.js`, traceability services | Consume current arrays and resolve explicit pinned versions separately. |
| Baselines | `src/adapters/repository/baseline-store.js`, history/baseline services | Omit source history from scoped snapshots and retain exact pins. |
| Backup/audit | `backup.js`, `audit-log.js`, integrity helpers | Back up embedded history and correlate compact manifests without candidates. |
| Import/export | `src/application/services/import-exchange.js` | Reject ordinary history input and make history export explicit. |
| Contracts | `src/contracts/definitions.js`, `generated/v1/**` | Version history/revision schemas and regenerate OpenAPI/MCP output. |
| Operations | health, support bundle, direct-edit checker, repository scripts | Add size preview, cleanup status, safe redaction, and post-cleanup verification. |
| Tests/fixtures | `test/**`, canonical fixtures, `fixtures/repositories/large.js`, benchmarks | Add chain, parity, storage, leakage, recovery, and capacity coverage. |
| Documentation | ADRs, engine/operator guides, Git issue, production evidence | Describe canonical history, current-only reads, and compact journals. |

Final schema files should use `v2`; retain v1 readers/migrations for the
published compatibility window. Never mutate published v1 schemas in place.

## Required tests

### History correctness

- Create version 1, update through multiple versions, retire, and reconstruct
  every version byte-semantically.
- Change multiple requirements and relationships in one transaction and append
  one prior snapshot per changed record.
- No-op, validation failure, authorization failure, stale expected version,
  preview, expired preview, and pre-commit faults append no durable history.
- Gaps, forks, duplicates, wrong owner, nested history, modified prefix,
  reordering, transition mismatch, and hash mismatch fail validation.
- Version-pinned links resolve against current and historical requirements.
- Field-level diffs and provenance match pre-migration behavior.

### Read isolation

- Historical-only text produces no ordinary search result.
- Default, summary, authoring, verification, and full projections omit
  `_history`.
- Exact-version and history reads respect response, item, component, and field
  authorization limits.
- Caches cannot mix current/historical results or scopes.
- Reports, exports, errors, logs, metrics, notifications, and support bundles do
  not leak snapshots.

### Transaction and recovery

- Fault injection before/after candidates, prepared manifest, each canonical
  rename, integrity update, audit append, committed manifest, and cleanup.
- Recovery yields the complete old or new pair, never a mixed pair or duplicate
  history.
- Repeated recovery/cleanup is idempotent.
- Committed transactions without candidates are healthy.
- Prepared candidates are never cleaned.
- Idempotency replay works from compact manifests.
- Cleanup failure is observable and does not fail an already durable commit.

### Baseline, audit, and backup

- Baseline snapshots omit `_history` and retain exact selected versions.
- Baseline reads/checksums do not change after current history grows.
- Audit tampering remains detectable after candidate cleanup.
- Backup/restore reproduces canonical, history, manifest, audit, and baseline
  hashes and rebuilds current indexes.

### Migration and rollback

- Every v1 exact requirement/relationship version equals v2 reconstruction.
- Migration is deterministic/idempotent for empty, large, retired,
  relationship-heavy, and long-history repositories.
- Divergent historical bytes/provenance stop with a precise report.
- Upgrade, observation-window rollback, candidate retirement, isolated restore,
  and post-retirement recovery all pass.

### Capacity

- Measure bytes added by one small-record change in a large repository.
- Measure long-history exact lookup, history pagination, and startup validation.
- Measure bulk-history growth and serialization memory.
- Prove candidate storage remains bounded by cleanup policy.
- Set maximum document size, versions per record, migration free-space margin,
  and cleanup backlog thresholds.

## Rollout sequence

1. Approve the history/journal ADR and v2 contracts.
2. Land v1/v2 readers while continuing to write v1.
3. Land current-only projection/index/export/baseline safeguards.
4. Land embedded history and compact-journal behavior behind a repository-format
   gate.
5. Complete fault injection, parity, security, and storage tests.
6. Run migration preview on a representative repository copy.
7. Back up and verify the production consistency group.
8. Enable v2 and migrate under a maintenance lock.
9. Rebuild indexes and verify current and exact-version parity.
10. Observe normal workload while retaining old candidates and migration backup.
11. Dry-run and execute candidate retirement after restore sign-off.
12. Verify integrity, backup/restore, and recovery after cleanup.
13. Remove v1 write support only after all supported repositories are v2.

## Acceptance criteria

The change is complete when:

- both canonical v2 files contain strict `_history` envelopes;
- current arrays contain exactly one current version per requirement/link;
- every pre-migration requirement and relationship version is reconstructable
  from v2 current data plus `_history`;
- current reads, search, trace, reports, exports, and caches omit history unless
  an explicit exact-version/history operation is used;
- normal writes no longer use retained committed before/after documents as the
  history source;
- prepared-transaction recovery still produces one valid two-file revision
  under every injected failure;
- compact committed manifests preserve integrity, provenance, audit correlation,
  and idempotency replay;
- baselines remain immutable, exact, and free of copied source histories;
- audit, direct-edit detection, backup/restore, import/export, and Git
  reconciliation guarantees remain valid;
- a one-record update adds approximately one prior record plus compact metadata,
  not four permanently retained canonical document copies;
- migration and cleanup are previewable, observable, verified, and reversible
  through retained backup;
- generated contracts, fixtures, guides, Stage 0–9 evidence, and CI checks use
  the new model.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Canonical files grow without bound. | Capacity thresholds, per-item benchmarks, growth alerts, and a future governed archive ADR when measured limits require one. |
| Historical content leaks through generic serialization/indexing. | Current-only helpers, explicit projections, negative leakage tests, and support-bundle redaction. |
| A writer forges or rewrites history. | Exclude `_history` from mutation schemas; derive it from trusted before state and enforce immutable-prefix hashes. |
| Cleanup weakens recovery. | Clean only after durable commit, validate manifests/hashes, keep cleanup idempotent, and fault-inject every boundary. |
| Migration accepts conflicting snapshots. | Require exact ID/version/hash/provenance agreement and stop on divergence. |
| Baselines copy all embedded history. | Use a baseline-specific snapshot builder that explicitly omits `_history`. |
| Arbitrary revision comparison stops working. | Version/deprecate the selector, retain item/baseline comparison, and make any full snapshot archive optional. |
| Migration temporarily needs substantial disk. | Preview exact size, require a safety margin, lock migration, and reclaim only after parity/restore sign-off. |
| Long history slows startup and exact reads. | Build an in-memory/derived ID-version index, benchmark validation, and define capacity thresholds without making the index authoritative. |
| Existing relationship action history conflicts with `_history` terminology. | Decide and document naming in the v2 schema ADR; keep complete snapshots authoritative. |

## Decisions to confirm before coding

1. Approve `_history` as the document-level field; `recordVersions` is clearer to
   casual JSON readers but less explicit that normal tools hide it.
2. Confirm that exact requirement/relationship versions and explicit baselines,
   rather than arbitrary full repository revisions, are the durable contract.
3. Decide whether relationship action `history` is renamed to
   `lifecycleHistory` in v2.
4. Set candidate observation time, migration-backup retention, and minimum free
   disk safety margin.
5. Decide which transition provenance fields require audit permission.
6. Set maximum projected versions per record and canonical document size for the
   Stage 9 capacity gate.
7. Decide whether any deployment requires an optional bounded full-repository
   snapshot archive after migration.
