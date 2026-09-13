# Requirements Management Engine Implementation Plan

## 1. Purpose

This plan defines a staged implementation of a requirements management engine designed primarily for AI-agent access. The engine keeps requirements in two authoritative, structured files:

- `<requirements-root>/business-requirements.json`
- `<requirements-root>/software-requirements.json`

Agents do not read or edit these files directly. They use a small, versioned set of tools or equivalent HTTP endpoints that enforce schemas, permissions, lifecycle rules, traceability, audit history, and bounded search responses.

The plan derives its scope from:

- `requirements-management/engine/features.md`
- `docs/requirements-management/basics/requirements-management.md`
- `docs/requirements-management/basics/requirements-gathering-and-management-processes.md`
- `docs/requirements-management/basics/requirements-traceability.md`
- `docs/requirements-management/basics/requirements-validation-and-verification.md`
- `docs/requirements-management/basics/writing-requirements.md`

## 2. Resolved assumptions

The supplied role statement lists `requirements-manager` as both full-access and read-only. This plan resolves the conflict by giving the more specific full-access grant precedence:

| Agent role | Read/query | Propose/dry-run | Persist changes | Approve/baseline/administer |
| --- | --- | --- | --- | --- |
| `requirements-manager` | Yes | Yes | Yes | Yes, subject to workflow policy |
| `tester` | Yes | Yes, non-persistent validation only | No | No |
| `implementer` | Yes | Yes, non-persistent validation only | No | No |
| `reviewer` | Yes | Yes, non-persistent review findings only | No | No |

`reviewer` is therefore an AI reviewer, not an approval authority. It may return findings but cannot change requirement data or record an approval. A human-authorized decision can be submitted through the `requirements-manager` identity and must retain the human principal as the accountable actor.

Other assumptions:

- The first release manages one project repository at a time; multi-project federation comes later.
- Requirement IDs contain only a type prefix and number: `BR-000001` and `SR-000001`. Descriptive titles, slugs, component names, and hierarchy are never encoded in an ID.
- Titles or short labels may exist as ordinary metadata, but are optional and never identity-bearing.
- IDs are stable, monotonic, never reused, and case-sensitive in canonical output.
- Business and software requirements are the only requirement record types in the first release. Risks, tests, design items, implementation work, regulations, and external sources are represented by typed references until dedicated stores or integrations are introduced.
- JSON Schema Draft 2020-12 is the validation format unless Stage 0 selects a compatible alternative.
- The tool protocol can be exposed through MCP, HTTP, or both. Both adapters must call the same application service and return the same error model.

## 3. Product boundary

### In scope

- Authoritative business and software requirement records.
- Stable identity, schema validation, and atomic persistence.
- Bounded lookup, search, filtering, projections, and relationship traversal.
- Structured authoring and advisory quality checks.
- Typed bidirectional traceability and coverage analysis.
- Lifecycle workflow, change requests, impact assessment, and recorded decisions.
- Immutable item history, baselines, comparison, audit events, and recovery.
- Verification planning, linked evidence metadata, reviews, and reproducible reports.
- Controlled imports/exports and future integration seams.
- Agent authentication, role authorization, provenance, and AI-output governance.

### Out of scope for the first production release

- A general-purpose document editor or graphical requirements UI.
- Uncontrolled natural-language mutation of JSON.
- AI approval, signatures, autonomous closure of impacts, or silent acceptance of generated content.
- Binary attachment storage; records contain governed references and checksums instead.
- Full ALM, PLM, test-management, or issue-tracking implementations.
- Transparent multi-master synchronization. Each synchronized field has one declared system of record.

## 4. Target architecture

```text
AI agent / approved client
          |
          v
MCP tools and/or versioned HTTP endpoints
          |
          v
Authentication -> authorization -> command/query application service
                                  |                    |
                                  v                    v
                         domain validation       bounded search/read model
                                  |                    |
                                  v                    v
                   transactional JSON repository   derived index/cache
                         |                 |
                         v                 v
             business-requirements.json   software-requirements.json
                         |
                         v
        append-only audit, item revisions, baselines, reports, recovery data
```

The two named JSON files are the source of truth for current requirement content and current relationships. Everything under `<requirements-root>/.engine/` is supporting state: schemas, audit events, immutable versions, baseline manifests/snapshots, locks, derived indexes, import reports, and generated reports. Derived indexes must be disposable and fully rebuildable from governed data.

All mutations follow one command path:

1. Authenticate the caller and resolve its agent role and accountable principal.
2. Authorize the named command.
3. Load the current repository revision under a project-scoped lock.
4. Validate command shape and optimistic concurrency preconditions.
5. Apply domain and relationship rules to an in-memory candidate state.
6. Run full cross-file validation.
7. Preview the exact diff for preview-only or bulk commands.
8. Commit with temporary files, durable flush, atomic rename, and a transaction marker.
9. Append the audit event and immutable item revisions.
10. Refresh or invalidate derived indexes and return the new repository revision.

No endpoint may contain an alternative write path.

## 5. Canonical identifier policy

| Requirement document | Prefix | Pattern | Example |
| --- | --- | --- | --- |
| Business requirements | `BR` | `^BR-[0-9]{6}$` | `BR-000042` |
| Software requirements | `SR` | `^SR-[0-9]{6}$` | `SR-000118` |

Rules:

- The numeric width is fixed for canonical rendering but may be expanded through a schema migration before exhaustion.
- The repository allocator owns IDs. Clients cannot choose an unused ID on create.
- Import can preserve a valid unused ID only in a privileged, previewed migration mode.
- A retired/deleted requirement keeps its ID and history. The number is never recycled.
- A requirement cannot move between business and software documents because that changes its identity. Create a replacement, link it with `supersedes`, and retire the old item.
- Prefix, number, and separator are the complete ID. A value such as `SR-LOGIN-0042` is invalid.

## 6. Core data model

### Requirement document

Each JSON file has the same envelope:

```json
{
  "$schema": "./.engine/schemas/requirement-document.schema.json",
  "schemaVersion": "1.0.0",
  "documentType": "business",
  "projectId": "example-project",
  "repositoryRevision": 12,
  "nextRequirementNumber": 43,
  "requirements": [],
  "relationships": []
}
```

The software file uses `documentType: "software"`. Timestamps and mutable operational metadata are kept on records and audit events, not on the document envelope unless they have a defined semantic purpose; this avoids meaningless whole-file diffs.

### Requirement record

The Stage 1 schema includes:

| Field | Purpose |
| --- | --- |
| `id` | Stable `BR-` or `SR-` identifier allocated by the engine. |
| `version` | Monotonic item version, starting at 1. |
| `statement` | One binding, independently verifiable obligation. |
| `shortLabel` | Optional human navigation aid; never part of identity. |
| `category` | Functional, quality, interface, constraint, safety, regulatory, or configured subtype. |
| `level` | Business or software in v1; retained explicitly for validation and reporting. |
| `rationale` | Why the requirement exists, separate from its statement. |
| `sourceReferences` | Governed internal or external sources and derivation rationale. |
| `owner` | Accountable person or team reference. |
| `priority`, `criticality` | Controlled values used for scope and risk decisions. |
| `status` | Lifecycle state governed by transitions. |
| `targetReleases` | Zero or more release/configuration references. |
| `allocation` | Component/team ownership without encoding it in the ID. |
| `assumptions`, `dependencies` | Explicit constraints and unresolved dependencies. |
| `acceptanceCriteria` | Parameter, measurement, threshold, and test conditions. |
| `verificationMethods` | Test, demonstration, inspection, analysis, or configured combination. |
| `tags`, `customAttributes` | Controlled extension points with schema limits. |
| `provenance` | Creation/update actor, principal, time, origin, and AI-assistance metadata. |
| `retirement` | Tombstone state and reason; physical deletion is not a normal operation. |

### Relationship record

Relationships are normalized records stored in the canonical document of a deterministic owning internal requirement. For an internal-to-internal link, the semantic source requirement owns the record. For an external-to-internal link, the internal endpoint owns it. Storage ownership is separate from semantic direction, so links with an external semantic source still remain in one of the two canonical requirement files:

```json
{
  "id": "RL-000314",
  "type": "derives_from",
  "source": { "kind": "requirement", "id": "SR-000118", "version": 3 },
  "target": { "kind": "requirement", "id": "BR-000042", "version": 2 },
  "status": "valid",
  "rationale": "Decomposition of approved business behavior",
  "createdAt": "...",
  "createdBy": "...",
  "lastAssessedAt": "...",
  "lastAssessedBy": "..."
}
```

Reverse navigation is derived, never duplicated. External endpoints use a stable `system`, `artifactType`, `externalId`, optional `version`, and URI. Relationship vocabulary, storage-ownership rule, endpoint type rules, direction, cardinality, coverage meaning, and suspect-link triggers are configuration validated by the engine.

## 7. Tool and endpoint surface

MCP tool names below are normative at the application-service level; HTTP routes may map to them under `/v1`.

### Read/query tools available to every listed role

| Tool | Purpose |
| --- | --- |
| `requirements.get` | Fetch exact current or baseline item versions using a field projection. |
| `requirements.search` | Full-text and structured search with filters, sort, cursor, and limit. |
| `requirements.list` | Deterministic filtered listing without full-text relevance behavior. |
| `requirements.trace` | Traverse typed upstream/downstream relationships to a bounded depth. |
| `requirements.coverage` | Find missing, stale, failed, waived, or not-applicable coverage. |
| `requirements.compare` | Compare item versions, baselines, or live state at field level. |
| `requirements.history` | Read attributable item and relationship history. |
| `requirements.report` | Generate or retrieve a reproducible governed report. |
| `requirements.validateDraft` | Validate candidate content without persisting it. |

### Mutation tools restricted to `requirements-manager`

| Tool | Purpose |
| --- | --- |
| `requirements.create` | Allocate IDs and create one or more requirements. |
| `requirements.update` | Patch an item with expected-version concurrency control. |
| `requirements.retire` | Tombstone an item after dependency and impact checks. |
| `requirements.link` / `requirements.unlink` | Manage typed relationships and provenance. |
| `requirements.bulkPreview` / `requirements.bulkCommit` | Two-step bulk mutation using an expiring preview token and exact diff hash. |
| `requirements.transition` | Apply a permitted lifecycle transition with evidence checks. |
| `changes.*` | Create, analyze, decide, implement, and close controlled changes. |
| `reviews.*` | Define reviewed versions and record human decisions. |
| `baselines.*` | Check readiness, create, inspect, and compare immutable baselines. |
| `imports.preview` / `imports.commit` | Preview and commit governed imports with reconciliation. |

Every response includes `schemaVersion`, `repositoryRevision`, and a correlation ID. Every error uses a stable machine-readable code, safe message, field/path details where applicable, retryability, and correlation ID.

## 8. Clean-context search contract

Search is designed for agents rather than as a raw JSON dump:

- Default result is a compact projection: ID, version, statement excerpt, category, status, priority, source/link summary, and match highlights.
- Callers request additional fields explicitly through a projection allowlist.
- Default and maximum page sizes are enforced. Pagination uses opaque, stable cursors tied to a repository revision.
- Filters support document/type, IDs, status, category, owner, priority, release, tags, verification method, relationship presence, coverage gaps, suspect links, and updated/version ranges.
- Search can target current state or an explicit baseline; the choice is echoed in the result.
- Results state the normalized query, applied filters, sort, total if inexpensive, returned count, truncation, and next cursor.
- Exact ID lookup takes precedence over fuzzy matching.
- No result exposes data the caller cannot read.
- Queries used in reports are serializable and reproducible.
- The API rejects unbounded scans, arbitrary JSONPath execution, regex denial-of-service patterns, and user-supplied code.

## 9. Delivery stages

| Stage | Outcome | Depends on |
| --- | --- | --- |
| [0 — Architecture and contracts](00-architecture-and-contracts.md) | Approved boundaries, use cases, ADRs, role policy, and executable contract skeleton. | None |
| [1 — Canonical JSON repository](01-canonical-json-repository.md) | Validated, crash-safe two-file source of truth with stable IDs and migrations. | Stage 0 |
| [2 — Secure reads and search](02-secure-reads-and-search.md) | Permission-aware bounded tools for exact lookup, search, filtering, and clean context. | Stage 1 |
| [3 — Controlled authoring and quality](03-controlled-authoring-and-quality.md) | Manager-only create/update/retire and advisory quality validation. | Stages 1–2 |
| [4 — Traceability and impact](04-traceability-and-impact.md) | Typed bidirectional links, coverage checks, suspect links, and graph impact analysis. | Stage 3 |
| [5 — Workflow and change control](05-workflow-and-change-control.md) | Governed lifecycle transitions and end-to-end controlled change records. | Stage 4 |
| [6 — History, baselines, and audit](06-history-baselines-and-audit.md) | Reconstructable versions, immutable baselines, comparisons, audit integrity, and recovery. | Stage 5 |
| [7 — Reviews, V&V, and reports](07-reviews-verification-and-reporting.md) | Review evidence, verification status, RTM/coverage outputs, and release-readiness reports. | Stage 6 |
| [8 — Import, exchange, reuse, and AI governance](08-import-exchange-reuse-and-ai-governance.md) | Safe adoption paths, integration contracts, reuse semantics, and AI provenance controls. | Stage 7 |
| [9 — Hardening and production release](09-hardening-and-production-release.md) | Measured performance, reliability, security, observability, backup/recovery, and rollout. | Stages 0–8 |
| [10 — Deployment readiness and independent assurance](10-deployment-readiness-and-independent-assurance.md) | Hardened target environment, independent review, production-path recovery proof, and pilot authorization. | Stage 9 |
| [11 — Controlled pilot](11-controlled-pilot.md) | Representative human and operational validation on one non-critical repository. | Stage 10 |
| [12 — Production release and progressive rollout](12-production-release-and-progressive-rollout.md) | Signed go/no-go, immutable release artifact, and controlled 10/25/50/100% rollout. | Stage 11 |
| [13 — Post-release stabilization and operations](13-post-release-stabilization-and-operations.md) | Healthy stabilization period and accountable transfer to recurring operations. | Stage 12 |

Stages are cumulative. A stage is complete only when its exit criteria pass and earlier invariants remain green.

## 10. Capability coverage

| Essential capability | Primary stage(s) |
| --- | --- |
| Authoritative repository | 1 |
| Structured authoring and quality | 3 |
| Traceability and relationships | 4 |
| Change control and impact analysis | 4–5 |
| Versions, baselines, configuration control | 6 |
| Reviews, decisions, collaboration | 5 and 7 |
| Workflow, ownership, progress | 5 and 7 |
| Verification, validation, risk, defect evidence | 4 and 7 |
| Reuse and variants | 8 |
| Reporting, auditability, compliance evidence | 6–7 |
| Access control, security, records governance | 0, 2, 6, and 9 |
| Integration, exchange, data ownership | 8 |
| Search, query, discovery | 2 |
| Scalability, reliability, usability | 2 and 9 |
| Lifecycle and cross-discipline support | 4–8 |
| Migration and adoption | 8–9 |
| Governed automation and AI | 0, 3, and 8 |

## 11. Cross-stage engineering rules

- Keep domain logic independent of MCP/HTTP transport and filesystem details.
- Use strict schemas: reject unknown fields unless they are inside a bounded extension map.
- Make every command idempotent through a caller-supplied idempotency key.
- Require `expectedVersion` or `expectedRepositoryRevision` for mutations.
- Use UTC RFC 3339 timestamps and preserve the authenticated actor plus accountable human principal.
- Never log tokens, full confidential requirement bodies, or attachment contents by default.
- Do not infer approval from a read, comment, generated suggestion, or tool invocation.
- Do not physically delete governed history through ordinary tools.
- Treat baselines and accepted audit records as immutable.
- Add schema migrations forward; do not silently reinterpret old data.
- Prefer contract, property, fault-injection, and recovery tests over snapshot-only tests.
- Each stage supplies operator documentation, threat-model updates, tests, and migration notes proportional to its changes.

## 12. Release increments

- **Developer preview (Stages 0–3):** safe current-state authoring and bounded reads for one repository.
- **Traceable beta (Stages 4–6):** auditable traceability, controlled changes, and baselines suitable for governed pilot use.
- **Production candidate (Stages 7–8):** evidence, reporting, migration, and integration workflows exercised end to end.
- **Production release (Stage 9):** security, recovery, scale, and operational gates passed with a representative repository.
- **Pilot-ready candidate (Stage 10):** the target environment and independent deployment controls are approved for non-critical pilot use.
- **Pilot acceptance (Stage 11):** representative workflows, operators, backups, restores, and service objectives pass the controlled observation period.
- **Production release (Stage 12):** signed artifact advances through the 10/25/50/100% rollout with a hold and rollback checkpoint at each cohort.
- **Operational acceptance (Stage 13):** stabilization passes and accountable owners accept recurring service operation.

## 13. End-to-end definition of done

The production release must demonstrate this chain without direct file editing:

1. Preview and import representative business and software requirements.
2. Preserve or allocate compliant IDs and report every transformation, rejection, duplicate, and omission.
3. Find requirements by exact ID, text, attributes, and coverage condition using bounded results.
4. Link every software requirement to an authorized business source and planned verification method.
5. Detect missing and invalid links, then repair them through manager-only tools.
6. Review and baseline an exact set of item and relationship versions.
7. Propose a change to a baselined business requirement without altering the baseline.
8. Traverse affected software, design, risk, implementation, test, and variant references.
9. Record impact dispositions and an authorized decision; update all affected artifacts.
10. Mark invalidated evidence and links suspect until reassessed.
11. Record accepted passing verification evidence for the revised requirement versions.
12. Generate a reproducible specification, traceability matrix, uncovered-items report, change record, baseline comparison, and audit trail.
13. Restore the repository from backup and reproduce the same baseline/report checksums.
14. Repeat the highest-cost search, trace, comparison, and reporting operations at projected production volume and concurrency within agreed service objectives.
