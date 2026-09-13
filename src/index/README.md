# Derived index boundary

Indexes are disposable projections. They must rebuild from governed repository
data, must never become an alternative source of truth, and must not be trusted
for authorization decisions.

`search-index.js` defines deterministic normalization, tokenization, indexing,
and matching without filesystem access. `PersistentSearchIndex` in the
repository adapter owns the optional canonical on-disk projection. Search
services verify its repository revision before use and rebuild or scan the
authorized canonical snapshot when it is unavailable.

`traceability-index.js` builds the graph projection embedded in that same
derived artifact. It stores each canonical relationship once and includes
compact endpoint metadata for deterministic adjacency reconstruction. Trace,
coverage, orphan, and impact services still authorize and traverse the selected
canonical snapshot rather than trusting this disposable projection.
