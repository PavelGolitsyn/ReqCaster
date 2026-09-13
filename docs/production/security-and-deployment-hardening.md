# Security assessment and deployment hardening

## Threat disposition

The trust-boundary model in `docs/architecture/threat-model.md` is completed by
the following production controls.

| Threat | Production control | Verification |
| --- | --- | --- |
| Identity spoofing / confused deputy | Transport resolves opaque credentials; body role claims are ignored; authorization runs before validation and again on every action | Identity and role-matrix tests |
| Path traversal / symlink escape | Fixed repository paths, absolute roots, real-parent containment for external artifacts | Path and support-bundle tests |
| Malicious JSON / import / injection | Strict duplicate-key parser, schemas, byte/depth/count limits, preview-first import, no dynamic code execution | Parser/query fuzz tests and security scan |
| Denial of service | Bounded admission, FIFO queue, deadlines, cancellation, page/graph/bulk/response limits | Production hardening tests |
| Stale authorization cache | Authorization decisions are not cached across actions; expiry and current policy are evaluated by the dispatcher | Authorization tests |
| Audit or baseline tampering | Immutable files, SHA-256 chains/manifests, mutation fail-closed verification | Integrity and recovery tests |
| Backup leakage | Metadata-only support bundles; backup encryption, access, location, and destruction are deployment responsibilities | Restore drill and deployment review |
| Supply-chain compromise | Zero third-party runtime packages, locked Node engine, committed lockfile, dynamic-code and secret scan | `npm run security:check` |

## Deployment requirements

- Run as a dedicated non-login account with read/write access only to its one
  requirements root and no write access to application code.
- Terminate TLS 1.2 or later at the trusted transport edge. Authenticate MCP
  host mappings or HTTP tokens against an approved issuer and audience.
- Keep credentials in the platform secret manager; never in configuration,
  environment dumps, support bundles, repository files, or command arguments.
- Encrypt repository, backup, telemetry, and temporary volumes at rest where
  data classification requires it. Use a separate backup key and role.
- Rotate transport credentials at least every 90 days and encryption keys at
  least annually or immediately after suspected compromise. Validate restore
  with the new key before retiring the old key.
- Disable shell and direct network egress for the engine process unless an
  approved integration adapter requires a destination-specific rule.
- Pin the Node major version, reproduce `npm ci`, review the empty dependency
  delta, run CI, sign the release artifact and record its checksum.

Operational telemetry is allowlist-based. It permits correlation ID, operation,
outcome, latency, safe counts, revisions, queue state, and error category. It
does not ingest request/response bodies, requirement statements, evidence,
credentials, arbitrary exception messages, or environment variables. Governed
reports and notifications still apply authorization-scoped projections.

## Residual security risks

Host administrator compromise, incorrectly configured TLS/volume encryption,
malicious authorized managers, and legal retention decisions remain deployment
risks. Each requires organizational controls, independent access review, and a
recorded residual-risk owner before go-live.
