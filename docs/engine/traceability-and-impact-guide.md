# Traceability and impact operations

The traceability model is governed by `traceabilityModelVersion` and the
`relationships` and `coverageRules` sections of the active policy. Relationship
direction is semantic and never changes to match file placement. An
internal-to-internal relationship is stored with its semantic source; an
external-to-internal relationship is stored with its internal endpoint.
Reverse navigation is derived from that single record.

## Relationship commands

`requirements.link` requires an expected repository revision, an idempotency
key, the configured relationship type, endpoint versions for every internal
requirement, and a rationale unless the type explicitly disables that policy.
External endpoints identify `system`, `artifactType`, `externalId`, and
`systemOfRecord`; `externalVersion` and `uri` may also be recorded. The engine
rejects missing or retired internal endpoints, stale versions, prohibited kind
combinations, self-links, active duplicates, cardinality violations, and
configured acyclic relationships that would create a cycle.

`requirements.unlink` tombstones a relationship. It never deletes the record.
`requirements.reassessLink` is a manager decision that resolves a suspect or
invalid relationship as `valid`, `updated`, `not_affected`, `waived`, or
`removed`. Every relationship created by the command layer carries status,
versioned provenance, and append-only trigger/assessment history.

## Suspect links

Material requirement updates evaluate the changed endpoint and fields against
the relationship rule's `suspectOn` triggers. Matching relationships become
suspect and receive a history entry in the same canonical repository
transaction as the requirement update. The entry identifies the triggering
item version, changed fields, rule, time, actor, and reason. Later content
changes do not clear the flag; only manager reassessment does.

## Read operations

- `requirements.trace` accepts one or more starting requirements, semantic
  upstream/downstream/both direction, a type allowlist, current or named
  baseline state, bounded depth and node limits, compact or expanded output,
  and status/external inclusion controls. It returns paths, relationship
  versions and statuses, cycle markers, source revision, and an explicit
  truncation reason. `complete: false` means callers must continue or narrow the
  query before treating the analysis as complete.
- `requirements.coverage` evaluates each visible applicable requirement/rule
  obligation. It reports missing, planned, present, present-but-suspect, failed,
  waived, deferred, accepted-passing, and documented not-applicable states.
  Every response includes filters, exclusions, rule/configuration versions, and
  explicit numerator and denominator definitions.
- `requirements.orphans` finds visible requirements without an active matching
  relationship.
- `requirements.impact` separates direct, transitive, and manually added scope,
  then groups candidates by artifact type, owner, release, variant,
  criticality, relationship type, and distance. Exploratory impact is read-only;
  persistence belongs to a governed change request.

Component-scoped reads traverse only visible internal endpoints. They omit
hidden nodes, paths, relationships, and counts and report the result as
access-restricted without revealing whether a particular hidden item exists.
Named baseline queries use the snapshot provider and never mix current-state
relationships into baseline results.

Documented coverage exceptions may be stored in the requirement extension
`customAttributes["coverage.exceptions"]` as bounded entries containing
`relationship-type`, `state` (`waived`, `deferred`, or `not-applicable`),
`rationale`, and `authorized-by`. Waived and not-applicable obligations remain
visible in the evaluated population while being excluded from the applicable
denominator.

## Derived graph projection

Repository index rebuilds include a deterministic `traceability` projection
containing compact nodes and single stored edges. It is disposable and rebuilt
entirely from the two canonical documents; authorization and query truth always
come from the selected canonical snapshot.
