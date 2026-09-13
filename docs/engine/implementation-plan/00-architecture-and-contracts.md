# Stage 0 — Architecture and Contracts

## Outcome

Establish an agreed, testable contract for the engine before persistence code fixes accidental behavior into the data format. This stage converts the source guidance and the assumptions in the plan index into architecture decisions, API contracts, policy fixtures, and executable test skeletons.

## Work packages

### 0.1 Confirm actors, trust boundaries, and authority

- Define agent identities: `requirements-manager`, `tester`, `implementer`, and `reviewer`.
- Separate the calling agent identity from the accountable human/service principal.
- Confirm that only `requirements-manager` can persist data, transition lifecycle state, record authorized decisions, create baselines, import, or administer configuration.
- Specify whether manager authority is repository-wide in v1; defer component/field-level grants until a concrete need exists.
- Define authentication inputs for local MCP and HTTP deployments and how forged role claims are prevented.
- State that read-only agents may submit draft content to `requirements.validateDraft`, but its response has no repository side effect.
- Define break-glass recovery as an operator procedure, not an ordinary agent tool.

### 0.2 Capture primary use cases

Write acceptance narratives for at least:

1. Manager creates a business requirement and receives an allocated `BR-` ID.
2. Manager derives a software requirement and links it to its business source.
3. Any allowed role fetches a compact requirement context by exact ID.
4. An implementer searches approved software requirements allocated to a component.
5. A tester finds requirements missing acceptance criteria or verification coverage.
6. A reviewer retrieves a requirement, its source, changes, and evidence without mutating it.
7. Manager previews and commits a bulk update without a partial write.
8. Manager baselines an approved set and later changes current state without changing the baseline.
9. A business change marks affected software and verification links suspect.
10. An unauthorized write returns a stable denial and leaves files, history, and indexes unchanged.
11. A stale client update fails with a version conflict and returns current version metadata.
12. A process crash between temporary write and commit recovers to one valid repository revision.

### 0.3 Record architecture decisions

Create ADRs for:

- implementation language/runtime and supported versions;
- MCP, HTTP, or dual transport;
- requirements-root discovery and path containment;
- fixed canonical filenames and `.engine/` sidecar layout;
- schema technology and canonical JSON serialization;
- file-locking and cross-platform atomic commit strategy;
- audit and baseline integrity mechanism;
- search implementation and rebuild behavior;
- authentication/authorization mapping;
- configuration precedence and schema migrations;
- observability and confidential-data handling;
- backup, restore, and retention boundaries.

Each ADR records context, decision, rejected alternatives, consequences, security effects, and migration impact.

### 0.4 Define application contracts

- Specify command/query request and response envelopes.
- Define stable error codes, including `INVALID_ARGUMENT`, `SCHEMA_VIOLATION`, `NOT_FOUND`, `FORBIDDEN`, `VERSION_CONFLICT`, `REPOSITORY_BUSY`, `INTEGRITY_FAILURE`, `PREVIEW_EXPIRED`, and `INTERNAL_ERROR`.
- Define request correlation IDs, idempotency keys, expected versions, pagination cursors, field projections, and response truncation metadata.
- Create transport-neutral interfaces for repository, authorization, clock, identity, audit, search, and report storage.
- Publish an initial OpenAPI and/or MCP input-schema contract generated from the same source types.
- Make direct filesystem paths unavailable in normal API inputs.

### 0.5 Define policy configuration

- Requirement categories and controlled vocabularies.
- Allowed lifecycle states and transitions.
- Relationship types, direction, endpoint types, cardinality, and suspect rules.
- Required metadata and coverage by category/status.
- Baseline readiness rules and authorized decision types.
- Search limits, graph depth/node limits, bulk limits, and timeouts.
- Quality-rule severity and the boundary between blocking structural validation and advisory language quality.

Configuration changes are privileged, versioned, validated, and auditable. A configuration version is captured by every baseline.

### 0.6 Establish repository and test skeleton

- Create package/module boundaries for adapters, application services, domain, repository, index, and tests.
- Add schema validation and contract-test harnesses.
- Add fixtures for empty, valid, invalid, legacy, corrupted, and large repositories.
- Add CI checks for format, lint, unit tests, schemas, generated contracts, and direct-mutation policy.
- Define a compatibility policy for API and data-schema versions.

## Required tests

- Role matrix table-driven authorization tests covering every planned tool.
- Contract round-trip tests for representative requests, responses, and errors.
- Property tests for identifier parsing and rejection of title-bearing IDs.
- Path traversal tests for requirements-root inputs.
- Configuration validation tests for contradictory transitions, relationship rules, and limits.
- A no-op command proves it produces no file or audit changes.

## Deliverables

- Architecture decision records.
- Use-case acceptance suite or executable feature specifications.
- Versioned command/query schemas.
- Authorization policy fixture.
- Project/module skeleton and CI pipeline.
- Initial threat model and data-flow diagram.

## Exit criteria

- Every planned tool has one owning application service, a permission, an input schema, an output schema, and documented errors.
- The role ambiguity is resolved and approved in project documentation.
- Storage, identity, locking, audit, and protocol decisions are explicit.
- Contract and authorization tests run in CI even though most implementations are stubs.
- No later stage depends on an undocumented mutation or identity path.

