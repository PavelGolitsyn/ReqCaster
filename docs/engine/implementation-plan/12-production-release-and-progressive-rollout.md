# Stage 12 — Production Release and Progressive Rollout

## Outcome

Make an evidence-backed go/no-go decision, publish the approved v1.0.0 artifact,
and expand production use through controlled 10%, 25%, 50%, and 100% steps with
a hold and rollback checkpoint at each step.

## Entry criteria

- Stages 10 and 11 have passed with stable evidence links.
- The [production readiness checklist](../../production/release-readiness.md)
  contains named people, dates, scope, accepted residual risks, and signatures.
- The exact candidate artifact, configuration, schemas, migrations, and rollback
  package are frozen and checksummed.
- The rollout denominator—repositories, users, or routed requests—is defined so
  every percentage has an unambiguous population.

## Work packages

### 12.1 Final go/no-go review

- Requirements, test, engineering, security, operations, and audit approvers
  review the same immutable evidence index and deployment change record.
- Confirm there is no missing required evidence, open critical/high security
  finding, unapproved SLO exception, failed integrity check, or unproven restore.
- Reconcile residual risks, deferred capabilities, known issues, support
  ownership, data retention, and rollback authority.
- Record a signed go or no-go decision. A conditional go must express measurable
  conditions, an owner, an expiry, and an automatic stop condition.

### 12.2 Release publication

- Reproduce CI on the pinned Node runtime and build inputs.
- Sign and publish the versioned artifact, checksum, compatibility statement,
  schema/API versions, configuration manifest, migration notes, known issues,
  backup/restore instructions, and rollback procedure.
- Verify production secrets and environment-specific configuration are injected
  by the deployment platform and are absent from the artifact and evidence.
- Create a pre-deployment consistency-group backup and verify it before changing
  each rollout cohort.

### 12.3 Progressive rollout

For each 10%, 25%, 50%, and 100% cohort:

1. Confirm the cohort, artifact checksum, configuration, backup, approver, and
   rollback point.
2. Deploy without bypassing migration preview or repository validation.
3. Run exact-read, bounded-search, authorized-write, denied-write, report,
   health, backup, and integrity smoke checks.
4. Hold for at least 24 hours while monitoring all documented service and
   safety signals.
5. Reconcile incidents, changes, support cases, authorization denials, queue
   state, backups, storage, integrations, and repository/index revisions.
6. Record advance, hold, or rollback approval before changing the next cohort.

Do not combine or skip cohorts merely because earlier deployments were quiet.
An emergency security fix may use an expedited path only when the deployment
change record names the risk, evidence, authority, and rollback conditions.

### 12.4 Release communications and support

- Publish operator and user instructions, supported limits, escalation paths,
  maintenance expectations, and known limitations before the first cohort.
- Staff release ownership across product, engineering, security, operations,
  integrations, and requirements management for the rollout window.
- Keep a single release timeline of decisions, incidents, configuration changes,
  cohort membership, checksums, and corrective actions.

## Stop and rollback conditions

Stop expansion for any pilot stop condition, failed smoke check, unhealthy
repository/audit state, inability to verify backup, unapproved configuration
drift, repeated integration loss, or breached objective beyond its documented
anti-noise window. The release owner may also hold on material user or operator
friction even when technical objectives pass.

Rollback the affected cohort using the operations runbook: quiesce writes,
preserve evidence, verify backup, restore the pre-release consistency group into
a new directory, validate and rebuild, compare checksums, and require a separate
cutover approval. Re-enter rollout only after the cause is corrected and the
invalidated evidence is rerun.

## Required evidence

- Signed go/no-go record and final residual-risk register.
- Published artifact checksum, signature, compatibility/configuration manifests,
  and reproducible CI evidence.
- Per-cohort deployment, smoke, monitoring, backup, hold, and decision records.
- Incident, rollback, support, and corrective-action records, including explicit
  confirmation when none occurred.
- Final 100% rollout decision and production inventory.

Store durable outputs under `docs/evidence/stage-12/` or link the controlled
release system from the deployment change record.

## Exit criteria

- Every go/no-go gate is signed and every accepted residual risk has an owner.
- The published production artifact and configuration match their recorded
  checksums and compatibility statement.
- All four cohorts complete their 24-hour hold and pass smoke, integrity,
  backup, security, and service-objective checks.
- No release blocker or unresolved safety event remains open.
- Production is at 100% of the declared rollout population with a verified
  rollback point and a complete release evidence index.
- The release owner formally transfers the service into stabilization.

