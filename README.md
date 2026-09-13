# spec-speaker

Tooling for spec-driven development and a contract-first requirements management
engine intended primarily for AI-agent access.

## Engine development

Stage 0 establishes the architecture and executable contracts. Stage 1 adds the
strict, transactional two-file canonical JSON repository under
`src/adapters/repository`. Stage 2 adds authenticated, permission-aware exact
reads and deterministic bounded search with a rebuildable derived index.

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
