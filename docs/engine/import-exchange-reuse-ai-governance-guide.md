# Import, Exchange, Reuse, and AI Governance

Stage 8 keeps the canonical JSON repository as the only source of truth while adding controlled adoption and exchange seams.

## Import workflow

`imports.preview` accepts a bounded UTF-8 `content` value, `format` (`json`, `csv`, or `reqif`), mapping version `1.0.0`, and the exact repository revision. JSON accepts a requirement array, `{ requirements, relationships }`, or an exported `{ business, software }` pair. CSV mapping 1.0 recognizes the documented canonical field names plus `text`, `description`, `type`, `source_id`, snake-case collection fields, and `version` as the expected target version. ReqIF mapping 1.0 reads `SPEC-OBJECT` identifiers and their first supported `THE-VALUE`.

The preview reports detected format/version/encoding, mapping version, source hash, per-row findings, ID preservation or allocation, relationship reconciliation, explicit losses, normalized diff, diff hash, and counts for created, updated, unchanged, duplicate, conflicted, rejected, incomplete, transformed, and unmapped records. A valid unused canonical ID is reserved through the repository transaction allocator. A foreign source ID is retained as an `external-alias` source reference.

Any rejected, incomplete, or conflicted record makes the preview non-committable. `imports.commit` is manager-only and binds the preview token, diff hash, source hash, mapping version, policy version, caller, and repository revision. It is atomic and durably idempotent. Changed policy or repository state requires a new preview. To migrate a valid partition from a mixed source, preview only that explicitly selected partition as a new import.

## Export contracts

`exports.generate` reads current state or an immutable named baseline and returns:

- JSON schema `speccaster-json@1.0.0`, retaining IDs, item versions, lifecycle status, reuse and AI provenance, relationships, and governed references;
- CSV schema `speccaster-csv@1.0.0`, a flat collaboration view with structured values encoded as JSON cells.

Every export includes its exact current repository revision or baseline manifest checksum, a content hash, and a loss list. CSV explicitly reports relationship and history flattening. Exported content and generated reports are snapshots, never independently mutable authorities. `roundTripClaim` is deliberately limited: JSON says `verified-schema-only`; CSV says `none`. A release may claim fuller round-trip support only after its automated export/re-import fixture proves reconstruction of every named feature.

## Integration ownership contract

Register connector contracts with `IntegrationContractRegistry`. Each version requires identity mapping, field ownership, create/update/delete-or-retire behavior (inside the mapping object), direction, cadence, conflict owner, retry/idempotency/ordering policy, confidentiality mapping, reconciliation/dead-letter policy, compatibility, and rollback. The registry rejects two-way `last-write-wins` contracts.

The initial integration pattern is one-way `exports.generate` plus the transactional outbox. A two-way connector is not production eligible until representative same-field conflict fixtures prove that both changes remain visible and an accountable owner resolves them.

The versioned example contract is [`integration-contracts/pilot-outbox.v1.json`](integration-contracts/pilot-outbox.v1.json).

## Reuse and variants

`reuse.adopt` creates either a `governed-reference` or `controlled-clone` as a new canonical proposal. The record retains origin ID/version, repository/library, adoption actor/time, applicability, and synchronization state.

`reuse.previewPropagation` lists every use, its variant, affected baseline memberships, changed fields, and the caller's required per-use disposition. `accept` synchronizes shared fields. `retain-divergence` preserves local content and requires a rationale. `reuse.commitPropagation` binds this exact result to an expiring token and diff hash. No local variation is overwritten without an explicit disposition. Configured product-line resolution remains intentionally unsupported until governed variant rules exist.

Variant baselines use the existing baseline `variant` and exact membership metadata. Coverage and verification continue to filter by variant/configuration, so one variant's evidence does not silently satisfy another.

## AI proposals

`ai.proposeRequirement` always creates lifecycle status `proposed` and records provider/service/model, run and prompt/rule versions, generation time, exact source item versions, accountable requester, concise rationale, and content hash. It stores no hidden reasoning. Deployment policy defaults external processing to denied; protected fields may never be declared present for an external processor.

`ai.acceptProposal` requires a requirements manager whose authenticated principal starts with `human:`. It verifies the generated-content hash, applies any reviewed patch, records the proposed-to-accepted diff and both hashes, and does not change lifecycle status. Later human edits remain in `humanEdits`. AI-backed review findings and verification evidence are likewise marked as proposals and gain accountable disposition or acceptance records.

AI principals cannot accept proposals, make lifecycle decisions, approve/close changes or reviews, create baselines, waive evidence, or resolve suspect impact on behalf of a human. All operations use the caller's ordinary repository, component, and field authorization scope.
