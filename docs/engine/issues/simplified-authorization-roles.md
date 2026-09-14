# Implementation Plan: Simplified Authorization Roles

## Status

Proposed cross-stage change for implementation.

## Summary

Replace the four current agent roles with two capability-oriented roles:

| Canonical role | Purpose | Replaces |
| --- | --- | --- |
| `requirements-reader` | Read, search, trace, compare, inspect history, and validate drafts without persistence. | `tester`, `implementer`, `reviewer` |
| `requirements-writer` | All reader capabilities plus governed authoring, lifecycle changes, decisions, baselines, imports, configuration, and audit access. | `requirements-manager` |

Use the names `requirements-reader` and `requirements-writer`, rather than bare
`reader` and `writer`, to avoid collisions with roles owned by a host system.

These are authorization profiles, not job titles. A tester, implementer,
reviewer, requirements manager, owner, approver, or verification executor may
still be represented as a human or service principal, participant, or source.
Those business responsibilities must not determine application permissions.

This issue is independent from, but should be coordinated with,
[`embedded-record-history-and-transaction-compaction.md`](./embedded-record-history-and-transaction-compaction.md)
because role names are persisted in transaction and history provenance.

## Current state

`src/application/authorization.js` and `config/authorization.v1.json` define:

- `requirements-manager` with read and all privileged permissions;
- `tester`, `implementer`, and `reviewer` with the identical
  `requirements:read` and `requirements:validate-draft` permissions.

The three read-only roles have no authorization distinction. The four names
also recur in tests, acceptance fixtures, architecture decisions, operator and
engine guides, production evidence, examples, and persisted transaction/audit
provenance.

The engine already separates the calling agent identity from the accountable
human or service principal. That separation must remain: a writer capability
does not itself constitute an accountable approval or signature.

## Goals

1. Expose exactly two canonical authorization roles.
2. Preserve the current effective least-privilege behavior.
3. Keep command-level permissions instead of replacing them with a single
   reader/writer boolean.
4. Preserve the distinction between the caller and accountable principal.
5. Provide a deterministic migration for configured identities and historical
   evidence.
6. Remove authorization decisions based on job-specific names.
7. Update generated contracts, documentation, tests, telemetry, and production
   evidence consistently.

## Non-goals

- Giving readers a persistent comment, finding, test-result, proposal-acceptance,
  or approval path.
- Allowing writers to approve, sign, waive, baseline, decide, or close changes
  without the command-specific permission and required accountable authority.
- Renaming domain-level owners, review participants, testers, implementers, or
  evidence executors when those labels describe business responsibilities.
- Collapsing the existing permission vocabulary.
- Rewriting immutable historical audit or transaction events.
- Adding component- or field-specific writer roles in this change.

## Canonical authorization model

### Permission matrix

| Permission | `requirements-reader` | `requirements-writer` |
| --- | --- | --- |
| `requirements:read` | Yes | Yes |
| `requirements:validate-draft` | Yes | Yes |
| `requirements:mutate` | No | Yes |
| `requirements:decide` | No | Yes |
| `requirements:baseline` | No | Yes |
| `requirements:import` | No | Yes |
| `requirements:configure` | No | Yes |
| `requirements:audit` | No | Yes |

The permission vocabulary remains the application-service contract. This keeps
policy reviews explicit and permits future scoped credentials without reviving
job-title roles.

### Authority rules

`requirements-writer` means that the caller may attempt a privileged command.
The command must still enforce all other gates, including:

- authenticated agent and accountable principal;
- repository, component, and field scope;
- expected record and repository versions;
- lifecycle, baseline, and change-control policy;
- human authority for approvals, decisions, exceptions, and signatures;
- preview tokens, idempotency, evidence, and readiness conditions;
- audit availability and repository integrity.

Documentation and errors should use “reader” and “writer” only for capability.
Use “accountable principal,” “approval authority,” “review participant,” or the
appropriate domain term for responsibility.

### Legacy mapping

Map old roles deterministically:

```text
requirements-manager -> requirements-writer
tester                -> requirements-reader
implementer           -> requirements-reader
reviewer              -> requirements-reader
```

The new authorization policy and newly issued credentials contain only the two
canonical roles.

If an installed deployment cannot rotate all credentials in one maintenance
window, a transport-level compatibility mapper may temporarily accept legacy
claims. It must:

- be disabled by default for new repositories;
- be controlled by an explicit setting with an expiry date;
- normalize before the request reaches application authorization;
- pass only the canonical role into new transaction, audit, and record
  provenance;
- retain `sourceRole` only in security audit metadata when required;
- emit a safe deprecation warning and usage metric;
- never grant permissions beyond the mapping above;
- reject unknown values and malicious near-matches.

The compatibility mapper is not a third authorization model. The executable
role catalog still contains exactly two canonical roles.

### Historical role values

Do not rewrite immutable evidence. Existing events containing
`requirements-manager`, `tester`, `implementer`, or `reviewer` remain valid
historical facts under their original event schema.

Readers of transaction, audit, history, baseline, report, and migration evidence
must interpret role values according to the record's schema version. New events
use only the two canonical names. Metrics may aggregate historical aliases into
the corresponding canonical capability while retaining the source value for
audit display.

## Contract and configuration changes

Create a versioned authorization policy rather than silently changing the v1
meaning after it has been deployed.

The v2 policy must:

- enumerate exactly `requirements-reader` and `requirements-writer`;
- validate permission names and reject unknown roles or permissions;
- preserve repository scope and future component/field scopes;
- state the compatibility-alias configuration outside the canonical `roles`
  map;
- include an explicit compatibility expiry when aliases are enabled;
- expose the policy version in authorization decisions and audit metadata.

Review generated OpenAPI and MCP contracts for role enums or role-bearing
responses. Regenerate affected artifacts from source. Do not hand-edit files
under `generated/`.

Stable error behavior remains:

- missing, expired, unknown, or disabled legacy claims return `FORBIDDEN`;
- a known reader calling a write operation returns `FORBIDDEN` before service
  execution;
- a writer lacking accountable decision authority receives the existing
  command-specific denial, not a misleading role error.

## Identity migration plan

### Phase A: inventory

1. Enumerate configured credentials, static identity maps, deployment-provider
   claims, test fixtures, CI identities, service accounts, and operator tools.
2. Record each identity's old role, effective permissions, repository scopes,
   component/field scopes, issuer, expiry, and owning team.
3. Search stored configuration and documentation for consumers that branch on
   old role names.
4. Produce a mapping preview showing old and new effective permissions.
5. Stop if any identity would gain permissions or lose intended repository
   scope.

Do not include credentials or secrets in the report.

### Phase B: compatibility release

1. Add v2 policy parsing and two-role authorization.
2. Add the optional legacy mapper at the trusted identity boundary.
3. Keep v1 policy reading for the published compatibility period.
4. Emit legacy-use metrics and operator-visible warnings.
5. Update dashboards to recognize both historical and canonical role values.
6. Prove authorization decisions are identical after deterministic mapping.

### Phase C: credential rotation

1. Reissue or update writer identities first and verify privileged workflows in
   a staging repository.
2. Reissue read-only identities and verify read, search, trace, comparison, and
   draft validation.
3. Update CI, local MCP, HTTP identity providers, and operator automation.
4. Record completion per identity owner without storing credential material.
5. Alert on any remaining legacy claim.

### Phase D: canonical cutover

1. Activate v2 authorization policy.
2. Persist only canonical roles in new governed evidence.
3. Run the complete tool-by-role authorization matrix.
4. Verify accountable-human gates for decisions, baselines, waivers, approvals,
   and change closure.
5. Keep the compatibility mapper only if the approved window requires it.

### Phase E: legacy removal

1. Confirm no legacy role usage during the agreed observation period.
2. Disable the compatibility mapper.
3. Verify all four legacy names fail closed for new requests.
4. Remove obsolete identity-provider mappings and v1 write support.
5. Retain schema-aware readers for immutable historical evidence for the
   documented retention period.

Rollback reactivates the compatibility mapper and v1 policy reader; it must not
rewrite new audit evidence or downgrade canonical roles in stored records.

## Work packages by implementation stage

### Stage 0 — Architecture and contracts

- Add an ADR for capability-oriented roles and deterministic legacy mapping.
- Update the actor/trust-boundary model and role matrix.
- Rewrite acceptance narratives using reader/writer capability and separate
  domain participants.
- Version role-bearing contracts and errors.
- Add legacy-alias spoofing and privilege-escalation threats.

### Stage 1 — Canonical JSON repository

- Permit historical evidence readers to recognize old role values by schema.
- Ensure new transaction and migration provenance uses canonical roles only.
- Keep repository mutations dependent on permissions supplied by the
  application layer, not string comparisons scattered through adapters.

### Stage 2 — Secure reads and search

- Replace the four-role read matrix with the two-role matrix.
- Prove both roles receive the same permitted read results under the same
  repository/component/field scopes.
- Keep authorization-partitioned cache keys bound to canonical role and scope.

### Stage 3 — Controlled authoring and quality

- Rename manager-only code, tests, prose, and examples to writer-only.
- Prove readers may validate drafts but cannot create, update, retire, or bulk
  commit.
- Ensure advisory output remains side-effect-free for readers.

### Stage 4 — Traceability and impact

- Restrict link, unlink, and reassessment commands to writers.
- Permit both roles to run bounded trace, coverage, orphan, and impact queries.
- Keep relationship ownership and impacted-party roles as domain data.

### Stage 5 — Workflow and change control

- Replace role checks with writer permission plus accountable-authority checks.
- Preserve human decision requirements for transition exceptions, decisions,
  implementation, and closure.
- Keep owner, reviewer, approval authority, and affected party as stable domain
  identity references.

### Stage 6 — History, baselines, and audit

- Store canonical new role names in transaction/history provenance.
- Interpret legacy role names according to event schema without mutation.
- Keep baseline creation and audit access writer-only and independently gated.
- Update history/audit filters and dashboards to support canonical aggregation.

### Stage 7 — Reviews, verification, and reporting

- Replace authorization references to reviewer/tester/implementer with reader.
- Preserve review participant, verification executor, and evidence source roles
  as domain metadata.
- Prove a reader's findings cannot become governed findings, approval, or
  accepted evidence without a writer command and accountable principal.

### Stage 8 — Import, exchange, reuse, and AI governance

- Record canonical roles for imports, integrations, reuse decisions, and
  accepted AI content.
- Treat imported old role strings as historical source metadata, not trusted
  authorization claims.
- Update migration training and working agreements for two access profiles.

### Stage 9 — Hardening and production release

- Rerun the authorization matrix for all tools and identities.
- Test revocation, expiry, policy reload, alias expiry, stale authorization
  cache, and forged claims.
- Alert on legacy-role use and unexpected role/permission combinations.
- Update end-to-end acceptance, pilot stakeholders, release readiness, and
  operational runbooks.

## File-level implementation inventory

| Area | Primary files | Required change |
| --- | --- | --- |
| Authorization | `src/application/authorization.js`, `config/authorization.v1.json`, `schemas/v1/authorization-policy.schema.json` | Add v2 policy with exactly two canonical roles and strict permissions. |
| Identity | `src/application/identity.js`, transport adapters and runtime wiring | Normalize optional legacy claims before authorization. |
| Dispatch | `src/application/services/dispatcher.js`, service catalog | Continue permission-based dispatch and remove job-title assumptions. |
| Contracts | `src/contracts/definitions.js`, `generated/v1/**` | Version role-bearing schemas and regenerate artifacts. |
| Tests | `test/policy/authorization.test.js`, application/security/operations tests | Replace matrices and add compatibility, authority, and fail-closed coverage. |
| Fixtures | canonical repositories and acceptance identities | Persist canonical roles in new evidence while retaining legacy history fixtures. |
| Documentation | README, ADRs, engine/operator guides, production evidence | Distinguish capability roles from domain participants consistently. |
| Observability | audit filters, health/metrics, support bundle | Report canonical role, safe legacy-use counts, and mapper expiry. |

Final filenames may use `v2` while retaining v1 readers. Do not mutate a
published v1 schema in place.

## Required tests

### Authorization matrix

- Every tool is tested against exactly two canonical roles.
- Reader permissions equal the old tester/implementer/reviewer effective set.
- Writer permissions equal the old requirements-manager effective set.
- A reader denial occurs before mutation service execution.
- Both roles respect repository/component/field scopes.
- Unknown roles, empty claims, malformed scopes, expired credentials, and forged
  payload identities fail closed.

### Accountable authority

- A writer without an accountable human cannot approve, decide, waive, create a
  baseline, sign, or close a governed change where policy requires one.
- Viewing, validating, proposing, commenting, or returning findings never
  implies approval.
- Writer role and accountable principal remain distinct in audit/history data.

### Compatibility

- Each old role maps to the expected canonical role only when compatibility is
  enabled.
- Disabling or expiring the mapper rejects all legacy claims.
- Mapping cannot add permissions or widen scopes.
- Newly persisted evidence contains only canonical role values.
- Immutable old evidence remains readable and verifiable.
- Metrics aggregate historical aliases without losing the original display
  value.

### Operations and security

- Policy reload invalidates stale authorization caches.
- Revocation applies at action time.
- Logs and errors do not expose credentials or sensitive identity-provider
  claims.
- Support bundles expose only safe role and migration summaries.
- Upgrade and rollback rehearsals preserve authorization behavior and evidence
  integrity.

## Rollout sequence

1. Approve the role ADR and v2 authorization contract.
2. Inventory identities and compare effective permissions.
3. Land dual policy reading and optional legacy normalization.
4. Update tests, generated contracts, documentation, metrics, and dashboards.
5. Rotate writer identities and verify privileged staging workflows.
6. Rotate reader identities and verify read-only workflows.
7. Activate the v2 policy and persist only canonical role names.
8. Run the complete authorization and accountable-authority acceptance suite.
9. Observe and resolve remaining legacy-use telemetry.
10. Disable the compatibility mapper at the approved deadline.
11. Remove v1 write support after every supported repository has cut over.

## Acceptance criteria

The change is complete when:

- the executable role catalog exposes only `requirements-reader` and
  `requirements-writer` as canonical roles;
- the authorization policy contains exactly those two roles;
- the deterministic mapping preserves every old role's effective permissions
  without widening scope;
- readers cannot persist any governed or operational state through application
  tools;
- writers still require accountable authority for governed human decisions;
- new transaction, audit, history, baseline, import, report, and AI provenance
  uses only canonical roles;
- immutable evidence containing old roles remains readable and verifiable;
- generated contracts, fixtures, guides, Stage 0–9 evidence, and CI checks use
  the new model;
- compatibility support, if enabled, is expiring, observable, tested, and
  disabled after the rollout window.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `requirements-writer` is mistaken for approval authority. | Keep command permissions and principal/authority gates; document that role grants capability only. |
| Credential rotation breaks clients. | Inventory first, stage rotation, optional expiring boundary mapper, and rollback support. |
| Mapping silently widens scope. | Compare effective permissions and scopes before activation; fail migration on any gain. |
| Historical evidence fails schema validation. | Version the role vocabulary and retain schema-aware readers without rewriting immutable events. |
| Domain participant roles are accidentally removed. | Limit renaming to authorization contexts and review each occurrence semantically. |
| Compatibility becomes permanent. | Require an expiry, metric, alert, owner, and removal gate. |
| Authorization cache serves stale decisions. | Include policy version and canonical role in keys and invalidate on policy/identity changes. |

## Decisions to confirm before coding

1. Approve `requirements-reader` and `requirements-writer` as the canonical
   names.
2. Decide whether the first deployed repository needs a legacy compatibility
   window or can rotate credentials atomically.
3. Set the compatibility deadline and accountable owner.
4. Confirm which principal-level fields a reader may see in history versus the
   writer-only audit view.
5. Confirm that future specialized write access will be expressed through
   scoped permissions rather than additional job-title roles.
