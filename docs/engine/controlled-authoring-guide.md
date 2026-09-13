# Controlled authoring guide

Stage 3 makes the application command services the only supported authoring
path. `requirements-manager` may create, update, retire, preview, and commit.
The tester, implementer, and reviewer roles may run `requirements.validateDraft`
but cannot persist its suggestions.

## Write a governed requirement

A new requirement names its level, subject and obligation, category, owner,
priority, rationale or source, and applicable verification planning. The engine
allocates the `BR-` or `SR-` ID inside the repository transaction. New normal
content starts in the configured default status (`proposed` by default); a client cannot choose a normal ID or insert
creation provenance.

Business example:

```json
{
  "level": "business",
  "statement": "The records service shall retain approved baselines for 365 days.",
  "category": "functional",
  "owner": "records-team",
  "priority": "high",
  "rationale": "Release evidence must remain reconstructable.",
  "source": "records-policy-12"
}
```

Software example:

```json
{
  "level": "software",
  "statement": "When a baseline is approved, the repository shall persist its manifest within 500 ms.",
  "category": "functional",
  "owner": "repository-team",
  "priority": "high",
  "rationale": "Implements durable baseline capture.",
  "sourceReferences": [
    { "type": "requirement", "uri": "requirement:BR-000042" }
  ],
  "verificationMethods": ["test"],
  "acceptanceCriteria": [
    { "id": "AC-1", "text": "The manifest is readable after process restart.", "verificationMethod": "test" }
  ]
}
```

Every command supplies an idempotency key and expected repository revision.
Committed command receipts are stored in durable transaction manifests. A retry
with the same actor, key, and normalized command replays its result even when
the original expected revision is now stale; reuse with different content is
rejected.

## Update and retire

Updates use a field allowlist rather than arbitrary paths. ID, level, version,
creation provenance, status, retirement, and history are not patchable. The
response classifies changed fields as `material`, `metadata-only`, or
`administrative` and returns their bounded before/after values. Material fields
require a reason. `expectedVersion` prevents lost updates, and one successful
command increments the item version exactly once.

Retirement retains the item and writes a tombstone. The configured governed
statuses (approved, implemented, and verified by default) also need a decision
reference. Active links and release metadata are previewed; policy can make
unresolved suspect dependencies to critical items block retirement. A
replacement is represented by a separate `supersedes`
relationship from the replacement to the retired requirement.

## Interpret quality findings

Every finding includes a versioned rule ID, severity, path, explanation,
suggested correction, source, and an evidence span where applicable.
Structural and controlled-vocabulary findings block governance. Language rules
are labeled `heuristic` and remain advisory by default. They cover missing or
weak obligations, subjective terms, units, passive responsibility, ambiguous
pronouns, compound obligations, placeholders, likely duplicates, inconsistent
terms, and design-biased wording.

An organization may put selected heuristic rule IDs in
`qualityRules.promotedRuleIds`. Only those selected rules become blocking. A
quality suggestion is never accepted automatically: a manager must submit the
edited structured content, and the resulting provenance records the agent,
accountable principal, source, and declared AI assistance.

## Bulk safety

Bulk preview evaluates all candidates against one revision and does not write.
On success it returns the exact affected IDs, warnings, diff hash, and a
short-lived actor-bound token. Bulk commit accepts that token plus an
idempotency key. It reconstructs the candidate under the repository lock and
requires the revision, affected IDs, and diff hash to match. Expiration,
tampering, concurrent writes, or any item failure require a fresh preview; a
successful bulk command commits all items in one revision.
