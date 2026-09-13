# ADR 0004: Fixed canonical filenames and sidecar layout

- Status: Accepted
- Context: Predictable recovery and tooling require an unambiguous source of truth.
- Decision: Current data lives only in `business-requirements.json` and `software-requirements.json`; governed and derived support data lives under `.engine/` as specified in Stage 1.
- Rejected: Arbitrary filenames; per-item files; treating an index as authoritative.
- Consequences: Two-file transactions require explicit recovery; derived indexes are disposable.
- Security effects: Fixed allowlisted paths narrow filesystem access.
- Migration impact: Layout changes require a previewed, backed-up migration and compatibility note.
