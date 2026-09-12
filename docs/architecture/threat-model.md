# Initial threat model and data flow

## Data flow and trust boundaries

```mermaid
flowchart LR
  A[Agent client] -->|MCP host credential / HTTPS token| B[Trusted transport edge]
  B -->|resolved agent + principal| C[Application dispatcher]
  C --> D[Authorization policy]
  C --> E[Domain validation]
  E --> F[Repository port]
  F --> G[Canonical JSON files]
  F --> H[Governed audit and versions]
  C --> I[Bounded search/report ports]
  G --> I
  subgraph Untrusted
    A
    J[Drafts imports queries]
  end
  J --> B
  subgraph Requirements root
    G
    H
    I
  end
```

Trust boundaries exist at the client/transport edge, application/infrastructure
ports, and requirements-root filesystem. Requirement bodies, source references,
identity attributes, tokens, preview tokens, and imports are confidential or
untrusted as applicable.

## Threats and controls

| Threat | Primary controls | Verification |
| --- | --- | --- |
| Forged role or principal | Verify host/OIDC mapping; ignore payload claims; retain both identities | Role-matrix and adapter tests |
| Path traversal or arbitrary-file access | Root configured by operator; canonical containment; no path API fields | Schema/path tests |
| Unauthorized or confused-deputy write | Central catalog permission and dispatcher; one repository port | Table-driven tests and mutation scan |
| Stale/lost update | Expected repository and item versions | Conflict contract tests |
| Partial two-file commit | Lock, same-filesystem temp files, durable manifest, recovery | Stage 1 fault injection |
| Audit/baseline tampering | Hash-chained events and signed/checksummed manifests; restricted storage | Integrity tests in Stage 6 |
| Query/resource exhaustion | Page, graph, bulk, string, timeout, and projection limits | Policy and contract tests |
| Secret/confidential data leakage | Structured safe errors; redacted logs; body logging disabled | Logging tests in Stage 9 |
| Replay | Idempotency key scoped to authenticated agent and operation | Stage 1 command tests |
| Malicious import/config | Preview, strict schema, manager-only commit, audit | Policy and import tests |

Residual risks are documented by the stage that implements each deferred control.
Break-glass access and host filesystem compromise remain operator/environment
risks and must be addressed in deployment procedures.
