# ADR 0005: JSON Schema 2020-12 and canonical JSON

- Status: Accepted
- Context: Tool and storage contracts must be machine-verifiable and reproducible.
- Decision: Use Draft 2020-12 schemas generated from in-repository definitions; canonical bytes are UTF-8, NFC strings, LF, two-space indentation, lexicographic keys, and one terminal newline.
- Rejected: Ad-hoc validation; YAML as canonical storage; platform-native key order.
- Consequences: Unknown fields are rejected except bounded extensions and golden bytes are portable.
- Security effects: Bounds, duplicate-key rejection, and normalized input reduce ambiguity and resource attacks.
- Migration impact: Schema semantic versions and explicit forward migrations govern changes.
