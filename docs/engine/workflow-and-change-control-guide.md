# Workflow and change control

Stage 5 makes requirement state and post-approval edits domain operations. A caller cannot set `status` through create or update, and material changes to protected content require an approved change record that names the exact current item version.

## Requirement lifecycle

The default lifecycle is:

```text
proposed -> reviewed -> approved -> implemented -> verified -> delivered
    |          |
    +--------> rejected
    +--------> deferred
```

Configured active states may transition to `retired`. Legacy `draft` and `in-review` states remain readable and have compatibility transitions, but new requirements begin in `proposed`.

Use `requirements.possibleTransitions` to inspect the rules and current blockers without changing the repository. Use `requirements.transition` to apply one configured transition with the current requirement version and `expectedPolicyVersion`. The engine evaluates the rule's permission, required fields, evidence types, coverage, placeholders, and critical suspect links. A configured exception is scoped to named blockers and records its rationale, authenticated human approver, and future expiry or review time.

Successful transitions record before/after state, accountable principal, calling agent, evidence, policy version, reason, and time in `lifecycleHistory`. Retirement also creates the retirement record and marks configured links suspect in the same repository transaction.

## Controlled changes

The governed sequence is:

1. `changes.create` records source, rationale, owner, urgency, scope, and proposed operations. Update and retirement targets include exact requirement versions.
2. `changes.triage` records ownership, duplicate references, and completeness/scope issues.
3. `changes.analyze` traverses current traceability and saves an impact snapshot pinned to repository, policy, and trace-model versions. A truncated traversal stays in `analyzing` unless an accountable human explicitly accepts it with a rationale.
4. `changes.dispositionImpact` records the affected owner's disposition, rationale, and evidence for one artifact.
5. `changes.decide` records an authenticated human authority, outcome, conditions, rationale, and time. Approval is blocked while impact dispositions are unresolved.
6. `changes.previewImplementation` simulates the exact operations without persistence and returns a short-lived actor-bound token and diff hash.
7. `changes.commitImplementation` rechecks repository and change versions, reproduces the preview, and atomically updates requirements, links, impact states, implementation commands, the change record, and notification outbox.
8. `changes.close` requires completed commands, resolved critical impacts and suspect links, successful evidence, no failed/dead-letter notifications, and an authenticated human authority.

`changes.get` returns one governed record. `workflow.dashboard` returns lifecycle counts, open changes, unresolved owner impacts, and notification failures. Read, view, search, and comment operations never imply a transition or decision.

## Canonical storage and baseline protection

Change-control records live under the optional `changeControl` envelope in `business-requirements.json`. The repository writes that document and `software-requirements.json` at one revision using its existing recoverable transaction protocol. Existing repositories remain valid until their first Stage 5 mutation initializes the envelope.

`changeControl.baselineMemberships` records exact baseline/item version membership for write guards. Material edits are denied when the current status is protected or the exact version is baselined unless an approved change record authorizes the same target version. Current edits create a new item version and cannot modify an immutable snapshot held by the baseline provider.

## Notification boundary

Governed commits enqueue bounded, recipient-targeted summaries; they never call email or chat systems inside the canonical transaction. `TransactionalOutbox` delivers outside the transaction with the outbox event ID as its idempotency key, then records delivery, retry, failure, or dead-letter state in a later canonical transaction. A delivery failure cannot roll back the governed change.

