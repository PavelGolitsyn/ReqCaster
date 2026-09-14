# Issue: Git Merges for Canonical Requirement JSON

## Status

Open design decision.

## Context

The canonical `business-requirements.json` and
`software-requirements.json` files may be committed to a user's product
repository. This makes requirement changes reviewable in pull requests and ties
them to product changes, but an ordinary Git three-way merge does not understand
the engine's invariants.

The two files form one logical repository revision. They contain monotonic ID
allocators, current requirements and relationships, and append-only `_history`
entries. The engine also validates cross-file links, lifecycle policy,
baselines, checksums, and accountable provenance. Git merges lines and objects;
it does not execute those rules.

A merge can therefore be textually clean while being semantically invalid. The
engine must treat any Git-produced canonical-file change as untrusted until a
governed reconciliation has validated and committed it.

## Risks

| Risk | Example | Likely result | Required detection or response |
| --- | --- | --- | --- |
| Requirement ID collision | Branches A and B both start with `nextRequirementNumber: 43` and create different `BR-000043` records. | A textual conflict, duplicate JSON records, or one requirement silently replacing the other during manual resolution. | Reject duplicate IDs and allocator reuse. Allocate final IDs only against the integration head or use a collision-free allocation scheme. |
| Relationship ID collision | Both branches allocate `RL-000315` for different links. | Incorrect traceability or silent loss of one relationship. | Apply the same uniqueness and integration-time allocation rules to relationship IDs. |
| Divergent versions of one record | Both branches update version 3 of `SR-000118` and independently produce version 4. | Two incompatible version-4 states, invalid `_history`, or silently discarded intent. | Detect non-prefix histories and same-base divergent edits. Require an explicit semantic resolution that creates one new version from the integration head. |
| Duplicate or reordered history | A manual merge concatenates both `_history` arrays or sorts them as text. | Duplicate versions, gaps, overlapping validity intervals, or changed historical content. | Require contiguous versions, ascending order, immutable historical hashes, and a target-branch-history prefix check. Never accept a manual `_history` edit. |
| Repository revision collision | Both branches advance repository revision 12 to 13. | The merged state contains changes from two transactions but still claims revision 13. Optimistic-concurrency and cursor assumptions become false. | Rebase/replay against current integration state and assign a fresh revision during governed commit. |
| Cross-file split brain | Git takes the business file from one side and the software file from the other, or only one file changes revision. | Different `repositoryRevision` values, broken endpoint versions, or a partially applied logical transaction. | Validate the two files as one consistency group and reject any mismatched or partial state. |
| Stale allocators | A merge retains the lower `nextRequirementNumber` or relationship counter. | A later create reuses an existing ID. | Validate each counter is greater than every allocated number and never decreases relative to the target branch. |
| Broken or misleading links | One branch changes/retires a requirement while another adds a version-pinned relationship to its old state. | Missing endpoints, invalid cardinality, or a link incorrectly left `valid` rather than `suspect`. | Re-run all link, endpoint, cardinality, cycle, suspect-link, and retirement rules after reconciliation. |
| Bypassed workflow | A contributor edits status, approval data, retirement, or `_history` directly in a pull request. | Content appears approved or historically legitimate without the required authority or transition. | Protect canonical paths, validate provenance and allowed transitions, and accept persistent changes only through the writer/reconciliation service. |
| Invalid checksums and transaction state | Git changes canonical bytes without updating the engine's last-committed checksum, audit event, or transaction metadata. | Expected `INTEGRITY_FAILURE`; blindly regenerating hashes could legitimize an unauthorized edit. | Fail closed. A writer-authorized reconciliation must verify intent, create a new governed transaction, and generate fresh integrity metadata. |
| Audit-chain conflict | Two branches append to one audit chain or merge transaction journals. | Forked or unverifiable audit history. | Do not merge locks, journals, or mutable audit-chain heads through Git. Keep them service-controlled or use independently signed immutable segments. |
| Baseline corruption | A branch changes or removes a record version referenced by a retained baseline manifest. | Baseline checksum failure or an unreconstructable baseline. | Prove every referenced version and checksum remains present; never auto-resolve baseline or referenced-history changes. |
| Schema or policy skew | One branch migrates schema/configuration while another writes records using the old rules. | A syntactically valid but unsupported or differently interpreted state. | Order migrations before content replay and require the proposal to be regenerated against the new schema/policy version. |
| Conflict-marker or formatting damage | A manual merge leaves markers, duplicate object keys, or non-canonical ordering. | Invalid JSON, parser ambiguity, noisy future diffs, or hash changes. | Parse strictly, reject duplicate keys and conflict markers, then canonicalize only after semantic validation. |
| Long-lived branch drift | A requirement proposal is merged weeks after its impact analysis or approval. | Stale decisions, missed dependent changes, or obsolete baselines/releases. | Expire previews and approvals, rerun impact/readiness checks, and require a fresh review after material drift. |
| Confidentiality leakage | Requirement bodies or rejected conflict variants are copied into PR comments, merge logs, or CI artifacts. | Governed information escapes its intended authorization scope. | Keep CI output to IDs, paths, hashes, and safe summaries; restrict repository and artifact access consistently. |

Hash or checksum failure after a Git merge is expected safety behavior, not a
condition that CI should fix by simply recomputing the expected hash. Hashes may
be regenerated only as the final step of an authorized semantic reconciliation.

## Options

### Option A — Serialize canonical writes on the integration branch

Feature branches store requirement **proposals**, not independently committed
canonical states. A proposal contains a globally unique proposal ID, operation,
expected base version, draft content, reason, and provenance. It does not claim
a final `BR-`, `SR-`, or `RL-` ID for a create.

A protected merge queue applies proposals one at a time to the latest target
branch through `requirements-writer`. The engine allocates final IDs, appends
`_history`, advances the shared repository revision, validates both files, and
emits integrity/audit metadata. If the base changed, the proposal is revalidated
or returned for a semantic decision.

Advantages:

- preserves all engine invariants and the existing numeric ID format;
- gives deterministic history, revision, checksum, and audit behavior;
- makes unrelated product branches independent of canonical file layout;
- turns conflicts into domain-level questions rather than JSON editing.

Trade-offs:

- requires a merge bot/service or a controlled local integration command;
- final IDs are normally assigned at integration time;
- a pull request may need a bot-generated follow-up commit after the proposal is
  accepted.

This is the recommended default.

### Option B — Governed semantic reconciliation after a Git merge

Allow branches to carry canonical changes, but never accept Git's merged JSON as
committed engine state. A reconciliation command receives the merge base, target
head, and incoming head and calculates record-level intent. It may automatically
combine changes to different records. It must stop on same-record changes,
history divergence, workflow-sensitive changes, allocator collisions,
configuration changes, and incompatible links.

After conflicts are resolved, the command replays the accepted operations onto
the target head and creates one or more new governed commits with fresh IDs,
versions, repository revisions, histories, hashes, and audit events.

Advantages:

- supports offline branches and displays canonical diffs in pull requests;
- can automatically handle genuinely independent changes.

Trade-offs:

- the three-way semantic merge algorithm is complex and security-sensitive;
- branch-local IDs and revisions may change during integration;
- manually merged output must remain blocked until reconciliation completes.

This can complement Option A for migrations or repositories that cannot use
proposal files, but should not be the first implementation.

### Option C — Custom Git merge driver

Register a merge driver for the two canonical paths in `.gitattributes`. The
driver parses the base/ours/theirs documents and invokes the same semantic
reconciliation library described in Option B. It must fail with an unresolved
conflict rather than guess when both sides touch the same semantic object.

Advantages:

- improves the local developer experience;
- avoids many array-order and formatting conflicts.

Trade-offs:

- clone-local Git configuration is required;
- hosting platforms and web-based merges do not necessarily run custom drivers;
- a driver cannot by itself provide trusted authorization, audit, or central ID
  allocation;
- a buggy driver can create valid-looking corruption.

Use a merge driver only as a local preview/convenience layer. Server-side
reconciliation and validation remain authoritative.

### Option D — Change the ID allocation scheme

Use UUID/ULID identifiers, centrally reserved numeric ranges, or temporary
branch-local IDs that are remapped at integration. Collision-free identifiers
remove the most obvious create/create conflict.

Advantages:

- makes independent creation substantially easier;
- UUID/ULID allocation works offline without a coordinator.

Trade-offs:

- changing canonical IDs affects readability, compatibility, imports, links,
  and published contracts;
- numeric range reservation creates gaps and needs an online coordinator;
- temporary IDs require reliable remapping of every relationship and external
  reference;
- none of these choices solves divergent updates, histories, revisions,
  workflow, or checksum/audit conflicts.

Treat this as a supplementary measure, not a complete merge strategy.

### Option E — Store one requirement per file

Replace the two large arrays with one file per current requirement and either an
embedded or adjacent history representation. Git can then merge changes to
different requirements without touching the same file.

Advantages:

- much smaller diffs and fewer textual conflicts;
- file history is easier for humans to inspect.

Trade-offs:

- changes the agreed two-file canonical architecture and migration/export
  contracts;
- shared counters, cross-file relationships, repository revisions, baselines,
  and audit state still need governed reconciliation;
- large directory counts may create filesystem and tooling costs.

Consider this only if measured merge or whole-document rewrite costs justify an
architecture change.

### Option F — Use Git itself as the version store

Keep only current requirement state in JSON and derive history from Git commits.

Advantages:

- avoids embedded `_history` growth;
- uses familiar diff and blame tooling.

Trade-offs:

- conflicts with the requirement that exact governed history lives in the JSON;
- history can be rewritten, squashed, shallow-cloned, or become unavailable;
- a Git commit does not inherently capture accountable authority or valid
  cross-file transaction semantics;
- baseline and API reads would depend on repository implementation details.

This option is not recommended for governed history, though Git remains useful
as an additional review and distribution layer.

## Recommended approach

Adopt Option A, with a restricted form of Option B as the import/recovery path:

1. Protect the two canonical JSON paths. Humans and ordinary CI jobs do not edit
   or resolve them manually.
2. Store branch changes as small proposal/command files with UUID proposal IDs,
   expected item versions, source schema/policy versions, reason, and provenance.
3. Use a protected merge queue. Immediately before integration, replay each
   proposal against the latest target head through `requirements-writer`.
4. Allocate final numeric requirement and relationship IDs only during that
   replay. References inside one proposal use temporary symbolic handles that
   the engine resolves atomically.
5. If a target record changed, show a field-level three-way diff and require an
   accountable resolution. Do not renumber or overwrite silently.
6. Commit the engine-generated canonical files and portable integrity metadata
   together with the product change, or in a linked bot commit required by the
   pull request.
7. Run server-side validation again on the exact merge commit. Branch protection
   rejects a merge if canonical bytes differ from the engine-produced candidate.
8. Keep runtime sidecars out of ordinary Git merging as described below.

This design preserves useful Git review while making the engine, rather than a
line-oriented merge, the authority for IDs, history, workflow, and integrity.

## Required merge-commit validation

CI on the exact candidate merge commit must, at minimum:

- reject conflict markers, duplicate JSON keys, unknown fields, and
  non-canonical serialization;
- validate both canonical files under the same schema and policy version;
- require equal `repositoryRevision` values in both files;
- require unique `BR-`, `SR-`, and `RL-` IDs across both files;
- prove allocators never decreased and exceed every allocated number;
- validate contiguous versions and validity intervals;
- prove every retained target-branch `_history` entry is unchanged and remains
  a prefix of the candidate history;
- reject client-authored, deleted, rewritten, reordered, or nested `_history`;
- validate every internal endpoint, pinned version, relationship rule,
  lifecycle transition, suspect-link action, and baseline reference;
- verify approval/waiver/baseline provenance against the authenticated operation
  that produced the candidate;
- verify the canonical checksums and an attestation tying them to the proposal
  set, target-head commit, writer identity, and resulting repository revision;
- expose only safe conflict summaries in CI output.

Validation should report a stable `GIT_RECONCILIATION_REQUIRED` error for a
well-formed but untrusted or semantically divergent merge, distinct from JSON
syntax, schema, authorization, and integrity errors.

## Unsafe shortcuts

The following must not be accepted as merge resolution strategies:

- choosing `ours` or `theirs` for an entire canonical file, because it can drop
  unrelated governed changes from the other side;
- using Git's `union` merge driver for requirement or history arrays, because it
  can preserve both conflicting IDs or versions without resolving their meaning;
- setting an allocator to `max(existing ID) + 1` and considering the merge
  repaired, because the collided records and references remain ambiguous;
- sorting or deduplicating records by ID/version, because this silently chooses
  which requirement or historical state survives;
- recomputing checksums after a manual edit, because this converts detection of
  an untrusted change into apparent integrity;
- accepting a merge merely because the JSON parses or passes JSON Schema;
- treating a merge commit SHA as a substitute for item-version, workflow,
  provenance, baseline, or cross-file transaction validation.

## Git and sidecar policy

The repository needs an explicit tracked/untracked policy. Recommended defaults:

| Path/state | Git policy | Reason |
| --- | --- | --- |
| `business-requirements.json`, `software-requirements.json` | Tracked, generated only by governed integration | Provides reviewable canonical state. |
| `.engine/schemas/`, `.engine/config/` | Tracked and changed through reviewed migrations/configuration commands | Defines how canonical content is interpreted. |
| Baseline manifests | Tracked only if the organization needs portable baselines; writer-generated and merge-queue-only | They reference exact embedded versions and must never be hand-merged. |
| `.engine/locks/`, `.engine/transactions/`, temporary candidates | Ignored | Host-local runtime state is invalid after clone or merge. |
| `.engine/indexes/` | Ignored | Derived and rebuildable. |
| `.engine/quarantine/`, imports, generated reports, support bundles | Ignored by default; publish to controlled artifact storage | May be large or confidential and is not canonical merge input. |
| Audit events and chain heads | Prefer a service-controlled append-only store outside ordinary Git merging | A single mutable chain cannot be safely merged across branches. If portability is mandatory, use immutable uniquely named signed segments plus a governed integration manifest. |

Cloning or checking out a branch must rebuild disposable state. It must not
interpret absent local transaction journals as evidence that arbitrary
canonical-file changes were authorized.

## Decisions still required

- Where proposal files live and whether they remain after successful
  integration as review evidence.
- Whether final numeric IDs may be unknown until merge, or whether an online ID
  reservation service is required.
- Whether the engine creates a bot follow-up commit or updates the pull-request
  branch before merge.
- Which baseline and integrity manifests must be portable in Git.
- Where the authoritative audit chain lives and how offline development is
  represented without forking it.
- Whether the first release supports only a serialized merge queue or also
  ships a semantic reconciliation preview command.
- How long a proposal, impact analysis, approval, or preview remains valid after
  its target base changes.
