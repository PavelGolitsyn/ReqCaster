# ADR 0008: Embedded rebuildable search

- Status: Accepted
- Context: Agent queries need bounded clean context without making a derived store authoritative.
- Decision: Start with an embedded local index behind the Search port, revision-tagged and fully rebuildable from governed data.
- Rejected: Raw JSON scans for every query; a mandatory external cluster; trusting index authorization fields.
- Consequences: Exact-ID lookup bypasses fuzzy ranking; stale indexes rebuild or fail safely.
- Security effects: Query grammar, projections, pages, graph depth/nodes, and timeouts are bounded.
- Migration impact: Search engines may change without changing application contracts or canonical data.
