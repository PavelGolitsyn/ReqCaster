# Stage 8 — Import, Exchange, Reuse, and AI Governance

## Outcome

Support safe adoption, controlled data exchange, requirements reuse/variants, and explicit AI provenance without creating a second source of truth or allowing integrations to silently lose governed information.

## Work packages

### 8.1 Preview-first import

`imports.preview` accepts supported structured JSON/CSV/ReqIF mappings through a bounded upload/reference channel and produces:

- detected source format/version/encoding;
- proposed field and relationship mappings with mapping version;
- created, updated, unchanged, duplicate, conflicted, rejected, incomplete, transformed, and unmapped counts;
- ID preservation/allocation outcomes;
- hierarchy/link/attachment/history/status losses or unsupported features;
- validation and quality findings per source row/item;
- exact normalized diff against a pinned repository revision;
- reconciliation totals and a preview token/diff hash.

`imports.commit` is manager-only, idempotent, all-or-nothing unless a separately previewed batch partition is selected, and refuses changed source/mapping/repository revisions. Preserve source IDs as external aliases when they cannot be canonical requirement IDs.

### 8.2 Export and exchange

- Export current state or a named baseline with documented schemas.
- Preserve stable IDs, versions, hierarchy/relationships, status, and governed references supported by the format.
- State every loss or flattening explicitly.
- Provide JSON first; add CSV/document exports for collaboration and ReqIF when justified by integration needs.
- Never claim round-trip traceability unless an automated re-import proves reconstruction and validation.
- Generated documents are reports, not alternate sources of truth.

### 8.3 Integration contracts and data ownership

For every external system, define a versioned mapping with:

- system of record per synchronized field;
- identity and version mapping;
- create/update/delete/retire semantics;
- direction and cadence;
- conflict detection and resolution ownership;
- retry, idempotency, ordering, and replay behavior;
- permission and confidentiality mapping;
- reconciliation counts, monitoring, and dead-letter handling;
- schema/config compatibility and rollback.

Start with one-way exports and event/outbox integration. Add two-way sync only after representative conflict tests prove no silent last-write-wins loss.

### 8.4 Reuse and variants

- Model reuse mode explicitly: governed reference, controlled clone, or configured module.
- Record origin ID/version, source repository/library, adoption time, applicability, synchronization state, and intentional divergence rationale.
- Before propagating shared changes, list every use and affected baseline/variant.
- Require preview and per-use disposition; never overwrite a deliberate local variation automatically.
- Report variant-specific baselines and coverage independently.
- Start with reference and clone semantics; defer configurable product-line resolution until real variant rules are available.

### 8.5 Governed AI behavior

- Mark every generated requirement, rewrite, quality finding, relationship suggestion, or test draft as a proposal.
- Record model/service identity where policy permits, prompt/template or rule version, generation time, source item IDs/versions, accountable requester, and content hash.
- Do not store hidden chain-of-thought; store concise rationale and source references needed for audit.
- Require explicit manager acceptance and show the proposed-to-accepted diff.
- Preserve subsequent human edits and the accepting principal.
- Enforce the same read permissions, retention, confidentiality, and logging rules used for human/API callers.
- Disable sending protected fields to external AI services unless deployment policy explicitly authorizes it.
- Never permit AI to approve requirements, sign records, decide/close changes, waive evidence, or resolve suspect impacts on behalf of a human.

### 8.6 Adoption and migration rehearsal

- Pilot one representative component before full migration.
- Establish source/target ownership during coexistence.
- Reconcile item, relationship, hierarchy, status, history, attachment-reference, and rejection counts.
- Run source-to-requirement-to-evidence trace samples in both directions.
- Obtain approval for documented transformation or loss.
- Train manager and read-only agent workflows and publish working agreements.

## Required tests

- Import mapping golden fixtures, duplicate/conflict behavior, partial-invalid input, and preview/commit tampering.
- Safe retry/replay and all-or-nothing commit tests.
- Export/import round-trip tests for every promised preserved feature.
- Integration conflict fixtures where both sides changed the same field.
- Reuse propagation never modifies an intentional divergence without explicit acceptance.
- Variant baseline/coverage isolation tests.
- AI provenance survives acceptance/editing and generated content cannot bypass manager authorization.
- Confidential fields are redacted or denied for unapproved external processors.

## Deliverables

- Import preview/commit pipeline and reconciliation report.
- Versioned export formats and mappings.
- Integration SDK/webhook/outbox documentation and first pilot connector if selected.
- Reuse/variant metadata and impact behavior.
- AI provenance schema, acceptance flow, and policy controls.
- Pilot migration and adoption runbook.

## Exit criteria

- Imports disclose and reconcile every created, updated, rejected, duplicated, transformed, conflicted, and unmapped record.
- Exports identify their exact governed source and limitations.
- Integration conflicts are visible and no supported flow silently discards a change.
- Reused content retains origin and intentional divergence.
- Accepted AI content is attributable, reviewable, editable, and auditable; AI has no approval authority.
- The representative migration pilot meets its approved count/link/history acceptance criteria.

