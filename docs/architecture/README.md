# Engine architecture contract (v1)

## Actors, identity, and authority

An authenticated invocation has two identities: `agentId` identifies the calling
workload and `principal.id` identifies the accountable human or service. The
audit record retains both. The four agent roles are `requirements-manager`,
`tester`, `implementer`, and `reviewer`. Manager authority is repository-wide in
v1; component and field grants are deferred until there is an evidenced need.

Only `requirements-manager` may persist data, transition state, record an
authorized human decision, create a baseline, import, or change configuration.
All roles may read and call `requirements.validateDraft`; draft validation is a
pure calculation and never writes repository, audit, report, or index state. A
reviewer reports findings but is not an approver.

For local MCP, the host supplies an OS-protected credential or configured agent
mapping; payload role claims are ignored. HTTP uses mutually authenticated TLS or
a signed OIDC access token whose issuer, audience, subject, expiry, and agent role
mapping are verified at the edge. The application receives the resolved identity,
not caller-supplied authorization fields. Break-glass recovery is an offline
operator runbook requiring repository backup, explicit confirmation, and a
separately retained operator audit record; it is not exposed as an agent tool.

## Application contract

All transports invoke the same application dispatcher and versioned schemas.
Requests carry `schemaVersion` and `correlationId`. Commands additionally require
an `idempotencyKey` and `expectedRepositoryRevision`; item commands require
`expectedVersion`. Correlation IDs are identifiers, never authentication facts.
Responses carry `schemaVersion`, `repositoryRevision`, `correlationId`, and
`data`. Lists may include `{returnedCount, truncated, nextCursor}`. Cursors and
preview tokens are opaque, integrity-protected, revision-bound, and bounded in
size and lifetime. A stale command returns `VERSION_CONFLICT` with safe current
revision/version metadata.

Clients select fields through an allowlisted projection. No API accepts a
requirements root or direct filesystem path. The stable error vocabulary is:
`INVALID_ARGUMENT`, `SCHEMA_VIOLATION`, `NOT_FOUND`, `FORBIDDEN`,
`VERSION_CONFLICT`, `REPOSITORY_BUSY`, `INTEGRITY_FAILURE`, `PREVIEW_EXPIRED`, and
`INTERNAL_ERROR`. Error messages are safe for callers; confidential internals go
only to protected operational diagnostics keyed by correlation ID.

The generated [MCP contract](../../generated/v1/mcp-tools.json) and
[OpenAPI contract](../../generated/v1/openapi.json) originate from
`src/contracts/definitions.js`. `src/application/services/catalog.js` is the
normative ownership and permission inventory.

## Mutation invariant

Every mutation follows authenticate → authorize → lock → load/verify → validate
preconditions → build candidate → validate whole state → optional preview →
atomic commit → audit/version append → derived-index invalidation. Transport,
search, and report adapters have no alternative mutation route. A rejected or
no-op request changes no canonical file, history, index, or audit record.

## Compatibility

- API and persisted schemas use semantic versions. Additive optional fields are
  minor changes; removals, meaning changes, and newly required fields are major.
- The server accepts its current major version and explicitly documented older
  minors. Unknown majors fail before domain execution.
- Canonical data is never silently reinterpreted. Ordered forward migrations are
  previewed, backed up, validated, and audited. Unknown future versions are read
  as unsupported, not downgraded.
- Tool names, error codes, ID syntax, and existing enum meanings remain stable
  within a major API version. Generated artifacts must be clean in CI.

## Module boundaries

`domain` owns invariants; `application/services` owns use cases;
`application/ports` defines repository, authorization, clock, identity, audit,
search, and report-store interfaces; `adapters` maps MCP/HTTP and infrastructure;
`index` is rebuildable derived state. Stage 1 supplies repository implementations.
