# speccaster

Tooling for spec-driven development and a contract-first requirements management
engine intended primarily for AI-agent access.

## Engine development

Stage 0 establishes the architecture and executable contracts. Stage 1 adds the
strict, transactional two-file canonical JSON repository under
`src/adapters/repository`. Stage 2 adds authenticated, permission-aware exact
reads and deterministic bounded search with a rebuildable derived index. Stage
3 adds manager-only controlled authoring, advisory quality validation, durable
idempotency, tombstone retirement, and exact two-step bulk commits. Stage 4 adds
bounded traceability, coverage, impact analysis, suspect-link propagation, and
external artifact identities. Stage 5 adds policy-versioned lifecycle
transitions, exact-version controlled changes, impact dispositions, atomic
implementation, closure gates, ownership dashboards, and a transactional
notification outbox.

```sh
npm run contracts:generate
npm test
npm run ci
```

Start with the [architecture contract](docs/architecture/README.md), the
[accepted decisions](docs/architecture/decisions/README.md), and the
[Stage 0 acceptance feature](docs/acceptance/stage-0.feature). Generated MCP and
OpenAPI contracts are committed under `generated/v1/` and checked for drift in
CI.

Read and search behavior, including projections, cursor semantics, and the
recommended two-step agent pattern, is documented in
[`docs/engine/search-and-read-semantics.md`](docs/engine/search-and-read-semantics.md).
Controlled authoring examples and quality-rule behavior are documented in
[`docs/engine/controlled-authoring-guide.md`](docs/engine/controlled-authoring-guide.md).
Lifecycle and controlled-change usage is documented in
[`docs/engine/workflow-and-change-control-guide.md`](docs/engine/workflow-and-change-control-guide.md).
