# Production readiness and rollout

## Go / no-go checklist

The release is a no-go if any required evidence is missing, a critical/high
security finding is open, a representative workload misses an objective without
an approved safe limit, restore cannot meet RPO/RTO, or an integrity check is
unhealthy.

| Gate | Accountable approver | Evidence | Status |
| --- | --- | --- | --- |
| Product lifecycle and usability | Requirements lead | End-to-end and pilot report | Pending pilot signature |
| Verification workflows | Test lead | Authorization and acceptance suites | Automated evidence complete |
| Runtime/release compatibility | Engineering lead | CI, benchmark, artifact checksum | Automated evidence complete |
| Security and privacy | Security lead | Threat model, scan, review | Pending independent signature |
| Backup, DR, alerts, runbooks | Operations lead | Recovery rehearsal and runbook | Automated rehearsal complete; production drill pending |
| Audit and retention | Audit/compliance lead | Integrity output and retention decision | Pending policy signature |

Code completion does not authorize production traffic. Named people, date,
scope, accepted residual risks, and signatures must be added to the deployment
change record by the listed approvers.

## Pilot and rollout

1. Select one non-critical repository inside the Year 3 envelope. Record data
   owner, classification, initial checksums, tool/schema versions, and rollback
   point.
2. Requirements manager imports and repairs data; tester, implementer, and
   reviewer execute their read-only workflows. Operations and security observe
   denials, queue, index, audit, backup and storage signals.
3. Run for two weeks or 500 governed changes, whichever is later. Disposition
   all workflow, error-message, accessibility, latency and operator feedback.
4. Require zero privilege leaks, zero unreconciled integrity failures, verified
   daily backups, one isolated restore, and objectives met for seven consecutive
   days.
5. Obtain all checklist signatures, then expand 10%, 25%, 50%, and 100%, with a
   24-hour hold and rollback checkpoint at each step.

## Post-release lifecycle

| Activity | Cadence | Owner |
| --- | --- | --- |
| Integrity scan and backup verification | Daily | Operations |
| Recovery drill | Quarterly | Operations + audit |
| Access/policy review | Quarterly and after role changes | Security + requirements lead |
| Dependency/runtime update review | Monthly | Engineering + security |
| Capacity and SLO review | Quarterly | Service owner |
| Incident/runbook exercise | Semi-annually | Operations + security |
| Schema/export deprecation review | Each release | Product + engineering |

Track requirements defects, search failures, trace gaps, escaped authorization
issues, change lead time, operator effort, queue saturation and restore time.
Recurring defects become governed schema, policy, process, or tool changes.
Published API, schema, configuration and export formats receive at least 12
months' notice before removal; security fixes may shorten the window with an
approved migration. At end of life, provide verified JSON/CSV exports, baseline
and audit evidence, documented keys, retention disposition, and destruction
confirmation.
