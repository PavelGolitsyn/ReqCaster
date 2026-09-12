# ADR 0003: Operator-configured requirements root

- Status: Accepted
- Context: Caller-controlled paths enable traversal and multi-project confusion.
- Decision: Resolve one root at process start from deployment configuration, canonicalize it, reject symlink escapes, and expose no paths in normal APIs.
- Rejected: Per-request paths; current-working-directory discovery; unrestricted environment interpolation.
- Consequences: One process serves one repository in v1 and adapters use the repository port.
- Security effects: Containment checks occur before file access and use platform-aware real paths.
- Migration impact: Multi-project support requires a trusted project-to-root registry, never raw client paths.
