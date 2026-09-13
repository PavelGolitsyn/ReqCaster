# Stage 11 — Controlled Pilot

## Outcome

Demonstrate that representative users can operate the hardened candidate safely
and effectively on one non-critical repository. Produce human, operational, and
service evidence that automation alone cannot supply.

## Entry criteria

- Stage 10 exit criteria pass and the pilot is explicitly authorized.
- The pilot repository is within the signed-off Year 3 capacity envelope.
- Data owner, classification, participant roster, success thresholds, stop
  conditions, communication path, and rollback authority are recorded.
- A verified pre-pilot backup and rollback point exist.

## Work packages

### 11.1 Pilot initialization

- Record repository identity, source and target ownership, initial item/link
  counts, canonical and baseline checksums, schema/API versions, release
  checksum, integration mappings, and backup identifier.
- Run the [migration pilot runbook](../../operators/migration-pilot-runbook.md):
  preview transformations and losses, reconcile counts, approve mappings, commit
  through governed tools, and repeat trace samples in both directions.
- Configure the pilot cohort and least-privilege identities for requirements
  manager, tester, implementer, reviewer, operations, security, and audit roles.
- Confirm daily backup, alert routing, help/escalation, incident response, and
  rollback procedures before normal pilot work starts.

### 11.2 Representative workflow execution

- Run the pilot for at least two weeks or 500 governed changes, whichever is
  later.
- Exercise authoring, exact and filtered search, trace and impact analysis,
  review, baseline, controlled change, verification evidence, reports,
  import/export, integration retry, and recovery workflows.
- Have tester, implementer, and reviewer identities perform their intended
  read-only and non-persistent validation work; explicitly test denied mutation.
- Sample the full Stage 9 end-to-end scenario against pilot data without direct
  canonical-file editing.
- Record workflow friction, unclear errors, accessibility issues, training gaps,
  operator effort, and integration conflicts in a disposition log.

### 11.3 Pilot monitoring and evidence

- Review repository/audit health, index lag, queue saturation, errors,
  authorization denials, backup age, storage growth, and integration failures
  daily.
- Measure the documented latency objectives using representative cold and warm
  operations; preserve query shapes and safe counts without requirement bodies.
- Verify daily backups and complete at least one isolated restore during the
  pilot, including checksum comparison and disposable-index rebuild.
- Investigate every integrity, privilege, or confidentiality event immediately;
  do not average safety failures into an acceptable rate.
- Require objectives to hold for seven consecutive days before pilot exit.

### 11.4 Feedback and defect disposition

- Triage every finding as blocker, pre-release correction, accepted residual
  risk, training/runbook change, or post-release governed improvement.
- Route product or engine changes through normal change control and repeat the
  affected acceptance, security, recovery, and performance checks.
- Repeat pilot time or change-count thresholds when a material correction
  invalidates the representative observation window.
- Obtain dated acceptance from every accountable role listed in the readiness
  checklist.

## Stop and rollback conditions

Pause new pilot writes and invoke the incident/runbook path for any privilege
leak, unreconciled integrity failure, governed-data disclosure, inability to
restore, missed hard capacity limit, or unresolved critical/high security
finding. Also stop when error, latency, queue, backup, storage, or integration
alerts exceed their documented thresholds and cannot be safely corrected in
place.

Rollback stops connectors, preserves evidence, verifies the pre-pilot backup,
restores into a new directory, validates canonical/audit/baseline integrity,
rebuilds indexes, compares checksums, and requires separate authorization before
traffic resumes. It never overwrites the failed repository.

## Required evidence

- Pilot charter, participant roster, training record, and initial inventory.
- Import/migration reconciliation and bidirectional trace samples.
- Daily health/SLO/backup summaries and isolated-restore report.
- Authorization-denial, usability, accessibility, operator, and defect logs.
- Finding disposition log and updated residual-risk register.
- Pilot report with repository, deployment, classification, start/end, accepted
  risks, evidence links, and dated signatures.

Store durable outputs under `docs/evidence/stage-11/` or link the controlled
evidence system from the deployment change record.

## Exit criteria

- The duration/change-count threshold is met.
- There are zero privilege leaks and zero unreconciled integrity failures.
- Daily backups are verified and one isolated restore succeeds.
- Service objectives are met for seven consecutive days within the declared
  capacity envelope.
- All workflow, error, accessibility, latency, integration, and operator
  findings are dispositioned; no release blocker remains open.
- All readiness-checklist approvers sign the pilot report or record an approved
  residual risk, authorizing a production go/no-go review.

