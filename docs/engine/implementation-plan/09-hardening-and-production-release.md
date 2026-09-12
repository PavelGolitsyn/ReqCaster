# Stage 9 — Hardening and Production Release

## Outcome

Prove that the complete engine is secure, recoverable, observable, operable, and usable at projected production scale. Release only after the full governed lifecycle and failure paths have been exercised with representative data and concurrency.

## Work packages

### 9.1 Production capacity model

Define three-year projections for:

- business/software requirement counts and average/max record size;
- relationship count, density, and maximum useful traversal depth;
- item versions, audit events, baselines, reports, and evidence references;
- search/query concurrency and write contention;
- import/export sizes and report complexity;
- storage, backup, restore, rebuild, and retention growth.

Set service-level objectives for exact reads, common searches, bounded trace/impact, ordinary commits, baseline comparison, report generation, index rebuild, availability, RPO, and RTO. State excluded overload behavior.

### 9.2 Performance and scalability

- Benchmark exact reads, multi-filter search, coverage gaps, five-level trace/impact, bulk preview/commit, baseline comparison, RTM generation, startup validation, and index rebuild.
- Test peak supported concurrent readers plus realistic manager writes.
- Measure cold and warm operation, not only cached results.
- Enforce quotas, timeouts, cancellation, backpressure, queue limits, and graceful overload errors.
- Profile JSON parse/write memory and commit pause; document thresholds that trigger a future storage architecture review.
- Confirm derived indexes cannot become a correctness dependency.

### 9.3 Security hardening

- Complete threat modeling for identity spoofing, confused deputy, path traversal, malicious JSON/imports, injection, denial of service, stale authorization cache, audit tampering, backup leakage, and supply-chain compromise.
- Run dependency and secret scanning, static analysis, fuzzing of parsers/query inputs, and penetration tests of exposed adapters.
- Apply least-privilege service accounts, secure secret storage, TLS for remote transport, encryption at rest where the deployment requires it, and key rotation procedures.
- Verify logs, errors, metrics, traces, reports, and notifications do not leak disallowed requirement content.
- Test revocation and policy changes at action time, especially approval/baseline/change operations.

### 9.4 Reliability and recovery

- Soak test read/write/index/report workloads.
- Inject disk-full, permission, lock timeout, process termination, partial I/O, corrupt index, corrupt sidecar, clock skew, and downstream integration failures.
- Demonstrate deterministic transaction recovery and a fail-closed mode for integrity failures.
- Execute backup restore and disaster-recovery drills against the RPO/RTO.
- Verify upgrade and rollback preserve canonical files, versions, links, baselines, audit integrity, and configuration.

### 9.5 Observability and operations

- Health endpoints distinguish process health, repository validity, index freshness, audit integrity, queue health, and integration status.
- Metrics include latency/error rates by operation, authorization denials, lock contention, repository/index revision lag, audit failures, queue depth, backup status, and storage growth.
- Structured logs use correlation IDs and safe metadata.
- Alerts have owners, thresholds, runbooks, and anti-noise rules.
- Provide operational commands for validate, diagnose, integrity-check, rebuild index, rotate audit, backup, restore, migrate, and generate support bundle with redaction.

### 9.6 End-to-end acceptance and rollout

- Run the 14-step scenario from the plan index with representative requirements, risks, tests, changes, variants, and integrations.
- Include unauthorized calls, stale updates, rejected import rows, integration conflicts, failed verification, waivers, suspect links, and a crash during commit.
- Have requirements-manager, tester, implementer, reviewer, operations, security, and audit stakeholders exercise their intended workflows.
- Pilot one repository, monitor defined metrics, and document feedback/dispositions.
- Publish compatibility, migration, backup, rollback, retention, incident, and support policies.
- Use a go/no-go checklist with named accountable approvers.

### 9.7 Post-release lifecycle

- Schedule recovery drills, access reviews, dependency updates, integrity scans, and capacity reviews.
- Track requirements defects, search failures, trace gaps, escaped authorization issues, change lead time, and operator effort.
- Feed recurring issues into schema/policy/process changes through the same governed change approach.
- Define deprecation windows for tools, schemas, configuration, and export formats.
- Capture end-of-life and data-export obligations early.

## Required tests and evidence

- Load/soak benchmark report against signed-off volumes and service objectives.
- Security test report and remediation closure.
- Chaos/fault-injection matrix with expected and observed repository state.
- Backup/restore and upgrade/rollback rehearsal evidence.
- Authorization matrix rerun across all tools and identities.
- Complete end-to-end scenario report with reproducible baseline and report checksums.
- Accessibility/usability review of agent contracts, errors, and operator procedures.
- Pilot sign-off and residual-risk register.

## Deliverables

- Capacity model, performance baselines, and service objectives.
- Security assessment and deployment hardening guide.
- Dashboards, alerts, runbooks, and incident procedures.
- Backup/restore, disaster-recovery, migration, upgrade, and rollback packages.
- Production readiness checklist and signed pilot acceptance.
- Versioned release artifacts and compatibility statement.

## Exit criteria

- The end-to-end requirements lifecycle succeeds using tools only; no step needs direct JSON editing.
- High-cost operations meet agreed objectives at projected volume/concurrency or have explicit safe limits.
- Crash, corruption, overload, and downstream failure modes preserve or clearly quarantine governed data.
- Authorization, audit integrity, backup/restore, upgrade/rollback, and secret handling pass independent review.
- Operators can diagnose and recover the service from documented procedures.
- The pilot demonstrates usable workflows for all four agent roles without privilege leakage.
- Residual risks and deferred capabilities are explicit, owned, and approved for release.

