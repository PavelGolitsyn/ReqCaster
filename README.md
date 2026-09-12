# spec-speaker

Tooling for spec-driven development and a contract-first requirements management
engine intended primarily for AI-agent access.

## Engine development

Stage 0 establishes the architecture and executable contracts. Stage 1 adds the
strict, transactional two-file canonical JSON repository under
`src/adapters/repository`.

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
