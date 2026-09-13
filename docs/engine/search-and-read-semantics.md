# Secure read and search semantics

Stage 2 exposes `requirements.get`, `requirements.search`, and
`requirements.list` through the shared MCP and HTTP contracts. Callers never
provide repository paths or authorization claims. The transport resolves an
opaque credential to an agent role and accountable principal before the
dispatcher validates repository-scoped arguments.

## Snapshot and authorization rules

Each request reads one complete repository revision. Responses repeat the
selected source (`current`, `version`, or `baseline`) and repository revision.
The authorization evaluator applies role, repository, optional component, and
optional field scopes before candidates are selected and again when records are
projected. Missing and inaccessible exact IDs both return `NOT_FOUND`.

Cache partitions include the authorization scope, principal, projection,
source selection, and repository revision. An entry created for a wider scope
cannot satisfy a narrower caller.

## Exact reads

`requirements.get` accepts `id` or up to 50 unique `ids`. IDs use only the
canonical `BR-000001` or `SR-000001` syntax; there is no fuzzy fallback. Set
`version` for an exact historical item or `baselineId` for a named immutable
snapshot. These selections depend on the Snapshot port supplied by the history
and baseline layer.

Use one of the `summary`, `authoring`, `verification`, or `full` presets, or an
explicit projection. `relationships` can be `counts` or a bounded one-hop
`summary`. Retired records are hidden unless `includeRetired` is true. Every
returned item includes its integer version and an ETag.

## Search and list

Text is normalized with Unicode NFKC and locale-independent lowercase.
Tokenization uses Unicode letters and numbers and retains internal `-_.:/`.
There is no stemming and user input is never compiled as a regular expression.
Quoted text is an exact phrase. Unquoted tokens use AND semantics, with exact
tokens ranked above prefixes. The relevance weights are ID, short label,
statement, rationale, source-reference metadata, controlled custom attributes,
and relationship metadata, in that order. ID ties are deterministic.

Filters support exact IDs, document/level, category, status, priority,
criticality, owner, allocation, release, tags, verification method, version,
updated ranges, and the `missingSource`, `missingVerification`,
`hasSuspectLinks`, and `hasExternalReference` predicates. Values within one
filter are ORed; different filters are ANDed. `requirements.list` uses the same
filters, requires an explicit field sort, and never applies relevance ranking.

Search returns a compact projection, `matchedFields`, bounded snippets,
`appliedFilters`, and page metadata. It never returns an entire canonical
document. Signed opaque cursors contain a position plus hashes of the normalized
query and authorization scope. They are time-bounded and pinned to repository
revision, configuration version, and index format. A changed context invalidates
the cursor.

## Agent usage pattern

First discover compact candidates:

```json
{
  "schemaVersion": "1.0.0",
  "correlationId": "agent-search-1",
  "query": "\"durably persist\" settings",
  "filters": { "status": ["approved"], "missingVerification": true },
  "projection": ["id", "shortLabel", "status"],
  "limit": 20
}
```

Then retrieve only the selected records:

```json
{
  "schemaVersion": "1.0.0",
  "correlationId": "agent-get-1",
  "ids": ["SR-000042", "SR-000105"],
  "preset": "verification",
  "relationships": "counts"
}
```

## Derived-index lifecycle

The embedded index contains only permitted searchable fields and carries the
repository, schema, configuration, and index-format versions. It refreshes only
after a successful canonical commit. If it is missing, stale, or corrupt, reads
fall back to a bounded index built from the already-authorized canonical
snapshot. Operators can rebuild it entirely with:

```sh
npm run repository -- rebuild-derived-state /absolute/requirements/root
```

The representative projected-volume benchmark defaults to 100,000 current
requirements and can be run with `npm run benchmark:search`. Pass a different
item count after `--` for local profiling.
