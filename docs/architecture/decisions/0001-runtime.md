# ADR 0001: Node.js JavaScript runtime

- Status: Accepted
- Context: The engine needs one portable runtime for MCP, HTTP, schemas, and tests.
- Decision: Use standards-based ES modules on Node.js 22 LTS or newer; keep the domain dependency-light.
- Rejected: Python (splits the likely MCP ecosystem); compiled native runtime (higher distribution cost); TypeScript requiring an undeclared compiler toolchain.
- Consequences: Built-in test and web APIs suffice for the Stage 0 skeleton; static typing may be added as checked JSDoc or a later build step.
- Security effects: Supported Node releases receive security fixes; production pins an exact maintained release.
- Migration impact: A future runtime change must preserve generated JSON contracts and canonical serialization golden tests.
