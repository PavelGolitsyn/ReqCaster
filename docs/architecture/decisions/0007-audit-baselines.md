# ADR 0007: Tamper-evident audit and immutable baselines

- Status: Accepted
- Context: Governance requires attributable reconstruction and immutable reviewed sets.
- Decision: Use append-only hash-chained audit events and checksummed baseline manifests/snapshots containing exact item and configuration versions; deployment may add signatures/WORM storage.
- Rejected: Mutable log rows; baselines as saved live queries; timestamps alone as integrity evidence.
- Consequences: Integrity verification and retention are operator-visible operations.
- Security effects: Hashing detects but does not alone prevent privileged tampering; access control and external anchors remain required.
- Migration impact: Hash algorithms are versioned and old verification remains available.
