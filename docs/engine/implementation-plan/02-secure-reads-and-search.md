# Stage 2 — Secure Reads and Search

## Outcome

Expose permission-aware, bounded read tools that return only the context an agent needs. Exact reads, full-text discovery, structured filters, relationship summaries, and deterministic pagination all operate on the same governed repository revision.

## Work packages

### 2.1 Implement identity and authorization middleware

- Authenticate every call before parsing repository-scoped arguments.
- Resolve agent role and accountable principal from trusted credentials, not request-body claims.
- Deny unknown roles by default.
- Apply repository and future component-level read scopes before retrieval and again before response serialization.
- Include role, principal, decision, policy version, and correlation ID in security audit metadata without logging secrets.
- Return indistinguishable `NOT_FOUND` behavior where existence disclosure is not allowed.

### 2.2 Implement exact retrieval

`requirements.get` supports:

- one or a bounded set of IDs;
- current state, exact item version, or named baseline;
- explicit field projections and safe presets such as `summary`, `authoring`, `verification`, and `full`;
- optional relationship counts or one-hop summaries;
- optional inclusion of retired records;
- response ETags/version metadata for later optimistic writes.

Exact ID matching is normalized only according to the canonical ID policy. It never falls back to fuzzy matching.

### 2.3 Build the derived search index

- Index IDs, statements, short labels, rationale, source references, controlled attributes, tags, relationship endpoints/types, and permitted external-reference metadata.
- Keep confidential or excluded fields out of the index by policy.
- Store the repository revision and schema/config versions used to build the index.
- Update only after a successful canonical commit; if refresh fails, mark the index stale and rebuild or fall back to bounded canonical scanning.
- Rebuild entirely from the two JSON files and configuration.
- Normalize text and tokenize deterministically; document language/stemming behavior.

### 2.4 Implement structured query behavior

`requirements.search` supports:

- query text and exact phrases;
- ID, document/level, category, status, priority, criticality, owner, allocation, release, tags, verification method, updated range, and version filters;
- relationship and coverage predicates such as `missingSource`, `missingVerification`, `hasSuspectLinks`, and `hasExternalReference`;
- deterministic relevance or field sort with an ID tie-breaker;
- opaque cursors pinned to repository revision and normalized query;
- a compact default projection and highlighted snippets;
- configurable default/maximum limits and a response-size ceiling.

`requirements.list` uses the same filters but requires deterministic field sorting and has no relevance ranking.

### 2.5 Context hygiene

- Never return entire documents from a search endpoint.
- Return `matchedFields` and snippets instead of unrelated long fields.
- Expose `truncated`, `nextCursor`, `returnedCount`, and applied filters.
- Reject projections that combine too many large fields for the requested page size.
- Support a two-step agent pattern: compact search, then exact `get` for selected IDs.
- Echo current/baseline source and repository revision so agents do not mix contexts accidentally.

### 2.6 Read consistency and cache behavior

- Define snapshot semantics for each request.
- Invalidate cursors when their repository revision is unavailable or when query/config versions change.
- Ensure cache keys include authorization scope, projection, baseline/current selection, and repository revision.
- Prevent cached privileged results from being served to a narrower role.

## Required tests

- One authorization test per read tool and role, including unknown/expired identity.
- Field-level data leakage and cache-partition tests.
- Exact ID tests proving `SR-000001` does not match malformed or title-bearing values.
- Search relevance golden tests and filter combination/property tests.
- Stable cursor pagination with no duplicates or omissions on an unchanged revision.
- Stale cursor behavior after repository changes.
- Index corruption/staleness fallback and rebuild tests.
- Query-size, result-size, regex/input abuse, timeout, and graph-limit tests.
- Performance benchmark fixture representing projected current-state volume.

## Deliverables

- Authentication/authorization middleware and policy evaluator.
- `requirements.get`, `requirements.search`, and `requirements.list` services.
- Derived index builder, updater, health status, and rebuild command.
- MCP/HTTP adapters generated from shared contracts.
- Search semantics and agent usage examples.

## Exit criteria

- All listed roles can retrieve permitted requirements without filesystem access.
- Search responses are bounded, reproducible, revision-aware, and compact by default.
- Authorization applies consistently before retrieval, caching, and serialization.
- A deleted or corrupted index can be rebuilt without losing governed data.
- Performance meets the provisional Stage 0 service objectives on the representative fixture.

