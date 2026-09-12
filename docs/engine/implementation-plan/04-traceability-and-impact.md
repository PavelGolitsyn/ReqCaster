# Stage 4 — Traceability and Impact

## Outcome

Implement a small, governed relationship model that supports bidirectional navigation, coverage analysis, suspect-link handling, and bounded impact traversal across business requirements, software requirements, and external engineering artifacts.

## Initial relationship vocabulary

| Relationship | Direction | Typical endpoints | Meaning |
| --- | --- | --- | --- |
| `derives_from` | Software -> Business or lower -> higher | `SR` -> `BR` | The source requirement justifies the derived obligation. |
| `decomposes` | Parent -> Child | Requirement -> Requirement | The child elaborates part of the parent. |
| `depends_on` | Consumer -> Provider | Requirement -> Requirement/external | Satisfaction relies on the target. |
| `conflicts_with` | Symmetric semantic, stored once | Requirement <-> Requirement | Both requirements cannot be satisfied as stated. |
| `implements` | Implementation -> Requirement | External -> Requirement | An implementation artifact realizes the requirement. |
| `verified_by` | Requirement -> Test/evidence | Requirement -> External | Planned or executed evidence verifies the requirement. |
| `validated_by` | Business/need -> Validation evidence | Requirement -> External | Evidence validates the intended outcome. |
| `mitigates` | Control -> Risk/hazard | Requirement/external -> External | The source controls the target risk. |
| `constrained_by` | Requirement -> Source | Requirement -> Regulation/interface/decision | The target imposes a binding constraint. |
| `supersedes` | New -> Retired | Requirement -> Requirement | New governed content replaces the target without reusing its ID. |

The exact vocabulary is configuration, but its semantics and migration behavior are versioned. Avoid adding types that do not support a decision, obligation, or analysis.

## Work packages

### 4.1 Relationship commands

- `requirements.link` creates one normalized directional record after endpoint, type, cardinality, permission, duplicate, and cycle rules pass.
- Store the record in the canonical document selected by the deterministic internal-owner rule; semantic direction remains unchanged.
- `requirements.unlink` retires the relationship and preserves history; it does not erase the record silently.
- Both require rationale where policy calls for it, expected repository/item versions, and an idempotency key.
- Adding/removing relationships from baselined scope follows change-control policy introduced in Stage 5.
- External endpoints require stable system/type/ID and declared system-of-record metadata.

### 4.2 Bidirectional traversal

`requirements.trace` accepts:

- one or a bounded set of starting IDs;
- upstream, downstream, or both directions;
- relationship-type allowlist;
- current state or named baseline;
- maximum depth and node count below server policy maxima;
- compact or expanded projection;
- inclusion/exclusion of retired, suspect, invalid, waived, and external endpoints.

Return paths, direction, relationship status/version, cycle markers, truncation reason, and repository/baseline revision. Traversal must not imply semantic coverage merely because an edge exists.

### 4.3 Coverage rules

Configure machine-checkable rules such as:

- Every active software requirement has at least one approved business source or documented derivation exception.
- Every approved/verifiable requirement has at least one verification method and applicable verification relationship.
- Every external test reference points back to at least one governed requirement or risk control.
- Safety/control categories require risk/hazard and evidence links.
- Retired, rejected, and explicitly not-applicable items are excluded only under documented rules.
- Coverage reports distinguish missing, planned, present-but-suspect, failed, waived, deferred, and accepted-passing evidence.

`requirements.coverage` always returns its population, filters, relationship rules/config version, exclusions, numerator/denominator definitions, and source revision/baseline.

### 4.4 Suspect-link rules

- Classify material fields whose change can invalidate relationship confidence.
- When such a field changes, mark configured inbound/outbound relationships `suspect` in the same transaction.
- Store triggering item version, changed fields, time, rule, and reason.
- Do not automatically restore validity after downstream updates.
- Manager reassessment records `valid`, `updated`, `not_affected`, `waived`, or `removed` plus rationale and accountable principal.
- Critical unresolved suspect links block configured approvals/baselines/releases.

### 4.5 Impact analysis

- Traverse upstream, downstream, vertical, and horizontal relationships to bounded depth.
- Group impact candidates by artifact type, owner, release/variant, criticality, relationship type, and distance.
- Include requirements, interfaces, design/implementation references, risks, controls, tests, evidence, defects, documents, and external systems where linked.
- Separate directly affected, transitively affected, and manually added scope.
- Persist an impact snapshot only as part of a change request in Stage 5; ordinary exploratory trace remains read-only.
- Record truncation and require an explicit continuation rather than claiming analysis is complete.

## Required tests

- Allowed/prohibited endpoint combinations, cardinality, duplicates, self-links, and cycles.
- Reverse traversal is correct although links are stored once.
- Traversal limits and cycle handling cannot exhaust resources.
- Permission filtering does not reveal hidden nodes through counts, paths, or timing-sensitive details beyond the documented threat model.
- Coverage denominator and exception fixtures for each status/category.
- Material change marks only configured relationships suspect and does so atomically.
- Reassessment requires manager role and retains trigger history.
- Baseline trace results stay unchanged after current-state link changes.

## Deliverables

- Versioned traceability-model configuration.
- Link/unlink/reassess commands.
- Trace, coverage, orphan, and impact query services.
- Graph/index extensions and rebuild support.
- Traceability and coverage operator/agent documentation.

## Exit criteria

- Every relationship has typed endpoints, direction, status, provenance, and history.
- Users can navigate every stored relationship in both directions.
- Missing and suspect coverage is queryable without custom code.
- Material upstream changes expose affected downstream records and stale evidence.
- Results are bounded and never overstate completeness when traversal is truncated or access-filtered.
