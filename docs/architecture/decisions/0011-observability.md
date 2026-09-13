# ADR 0011: Structured, privacy-minimized observability

- Status: Accepted
- Context: Operations need diagnosis without leaking requirement bodies, credentials, or evidence.
- Decision: Emit structured metrics and events with correlation ID, operation, outcome, latency, revision, and safe counts; omit tokens and content bodies by default.
- Rejected: Full request/response logging; unactionable free-form logs; identity-free audit.
- Consequences: Protected diagnostics are separate from governed audit records and have shorter retention.
- Security effects: Field allowlists, redaction tests, access controls, and secure transport/storage are required.
- Migration impact: Telemetry schema versions may add fields but cannot weaken default redaction silently.
