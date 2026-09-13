# ADR 0002: Dual MCP and HTTP transports

- Status: Accepted
- Context: Agents prefer MCP while integrations need a conventional versioned API.
- Decision: Support MCP tool names and `/v1` HTTP POST mappings through one application dispatcher.
- Rejected: MCP-only (limits integrations); HTTP-only (weakens native agent ergonomics); separate service implementations (behavior drift).
- Consequences: Transport adapters remain thin and contract tests apply to both.
- Security effects: Authentication is transport-specific, authorization is centralized after identity resolution.
- Migration impact: New transports must map the same catalog, envelopes, and error vocabulary.
