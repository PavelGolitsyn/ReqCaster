# Stage 5 — Workflow and Change Control

## Outcome

Add explicit lifecycle states, guarded transitions, controlled changes, impact dispositions, ownership, and decision records. Current requirements may evolve, but approved/baselined content cannot be silently overwritten and affected work cannot be closed without evidence.

## Default lifecycle

```text
proposed -> reviewed -> approved -> implemented -> verified -> delivered
    |          |           |             |
    +------> rejected      +----------> deferred
    +------> deferred

approved/implemented/verified/delivered --approved change--> revised current version
any active state --authorized change--> retired
```

Projects may configure a smaller workflow, but every transition declares allowed source states, permission, required fields/evidence, blocking conditions, and resulting impact actions.

## Work packages

### 5.1 Transition engine

- Implement `requirements.transition` as a named domain command, not an arbitrary status patch.
- Validate source state, target state, actor permission, expected item version, and policy/config version.
- Enforce readiness gates: required metadata, sources, acceptance criteria, verification planning, review decision, coverage, no blocking TBDs, and no unresolved critical suspect links as configured.
- Record reason, accountable principal, evidence references, policy version, time, and before/after state.
- Allow explicit authorized exceptions with scope, rationale, approver, and expiry/review date.
- Ensure read-only agents can inspect possible transitions and blockers but cannot apply them.

### 5.2 Change-request model

Define governed change records with:

- stable ID and version;
- proposed additions/modifications/retirements and exact target item versions;
- source, rationale, urgency, affected release/baseline/configuration/variant;
- initiator and accountable owner;
- lifecycle: `draft`, `triaged`, `analyzing`, `ready_for_decision`, `approved`, `rejected`, `deferred`, `implementing`, `verifying`, `closed`, `cancelled`;
- impact snapshot and per-artifact dispositions;
- technical, interface, safety, security, compliance, cost, schedule, operations, training, and migration assessments as applicable;
- decision, authority, conditions, rationale, and time;
- implementation commands/transactions and new verification/validation evidence;
- closure checklist and residual exceptions.

### 5.3 Change workflow tools

- `changes.create`: capture proposal without changing requirements.
- `changes.triage`: identify duplicate, incomplete, ownership, and scope issues.
- `changes.analyze`: save a revision-pinned impact snapshot plus manually added impacts.
- `changes.dispositionImpact`: record owner assessment for each impacted artifact.
- `changes.decide`: approve/reject/defer with authority and rationale.
- `changes.previewImplementation`: produce the exact multi-record diff.
- `changes.commitImplementation`: atomically update requirements, links, impact states, and change record.
- `changes.close`: require completed updates, resolved suspect links, applicable re-verification/re-validation, notifications/outbox state, and audit evidence.

All mutation tools remain restricted to `requirements-manager`. The accountable human represented by the manager call is recorded for decisions.

### 5.4 Baselined-item protection

- Detect whether a target version belongs to any baseline.
- Preserve baseline data and create a new current item version.
- Require an approved change record before material edits to configured approved/baselined content.
- Allow urgent policy-defined paths only with explicit exception authority and subsequent review.
- Mark relevant downstream relationships/evidence suspect in the same commit.

### 5.5 Ownership and notifications

- Treat owner, reviewer, approval authority, and affected-party references as stable identity references.
- Emit transactional outbox events for targeted notification/integration processing.
- Avoid embedding delivery to email/chat inside the commit transaction.
- Include only permitted summaries in notifications and link recipients back to current governed records.
- Retry delivery idempotently and expose failed/dead-letter events to operators.

## Required tests

- Table-driven transition tests for every state, role, gate, and exception path.
- A read/view/comment never implies approval or transition.
- Material edits to approved/baselined items without approved change are denied.
- Impact traversal is revision-pinned and truncation blocks `ready_for_decision` unless explicitly accepted.
- Change implementation is atomic across both canonical files, links, histories, impacts, and change record.
- Close is denied for unresolved critical impacts, suspect links, failed required evidence, or incomplete commands.
- Notification failures do not roll back governed data and are retryable without duplicates.

## Deliverables

- Versioned workflow policy and transition engine.
- Change-request and impact-disposition schemas/services/tools.
- Baselined-item write guards.
- Transactional outbox and notification integration boundary.
- Dashboards/queries for state, ownership, overdue actions, and open changes.

## Exit criteria

- Status is changed only through a governed transition.
- Every material post-approval change has a source, impact analysis, decision, implementation trail, and closure evidence.
- Affected owners and unresolved impacts are discoverable from governed data.
- Current changes cannot alter an earlier approved snapshot.
- AI agents cannot approve, sign, or close impacts autonomously.

