# Stage 7 — Reviews, Verification, and Reporting

## Outcome

Connect exact requirement versions to review decisions, verification plans/results, validation evidence, risks, defects, and reproducible reports while respecting the rule that AI `reviewer`, `tester`, and `implementer` agents are read-only.

## Work packages

### 7.1 Review records

Define review records with exact item/relationship versions, scope, purpose, participants, findings/comments, blocking severity, dispositions, decisions, accountable humans, time, and supersession/reopen history.

- `reviews.create` freezes or pins the reviewed versions.
- Read-only reviewer agents use read tools and return findings outside the repository.
- `requirements-manager` may record those findings with provenance and identify whether they were AI-generated, human-authored, or imported.
- Only an authorized accountable human decision submitted through the manager path records approval/rejection/abstention/signature.
- Closing requires blocking findings to be resolved or an explicit authorized exception.
- Viewing or commenting never counts as approval.

### 7.2 Verification planning

For every requirement requiring verification, store or link:

- method: test, demonstration, inspection, analysis, or combination;
- objective acceptance criteria: parameter, measurement method, threshold, and conditions;
- planned case/procedure reference and owner;
- environment/configuration/data/equipment references;
- applicability to release, variant, and exact requirement version.

Approval/readiness policy catches missing or subjective criteria early.

### 7.3 Verification and validation evidence

Define governed evidence references/records containing:

- stable external or internal evidence ID and version;
- requirement version(s) covered;
- case/procedure version, environment, configuration, dataset, executor, and time;
- expected and actual result summary;
- status: `not_run`, `passed`, `failed`, `blocked`, `waived`, `not_applicable`, `superseded`;
- artifact URI/checksum and source system of record;
- defect references, disposition, reviewer/acceptor, and acceptance time.

Passing coverage requires accepted passing evidence applicable to the current/baselined requirement and configuration—not merely a linked test case. Waived/deferred/not-applicable evidence requires rationale and authority. A requirement change marks older evidence potentially stale according to policy.

Because tester agents are read-only, the engine initially imports or records test results only through an authorized manager/integration principal. A future dedicated `test-results-writer` role requires an explicit policy change, not privilege reuse.

### 7.4 Reports

Implement reproducible report definitions for:

- business requirements specification;
- software requirements specification;
- requirements traceability matrix;
- source/design/implementation/verification coverage;
- orphan, broken, stale, and suspect links;
- review record and unresolved findings;
- change request and impact disposition;
- baseline manifest and baseline comparison;
- verification status and failed/waived/deferred evidence;
- release readiness;
- audit history.

Each generated report records project, current revision or baseline, normalized filters/query, population/coverage formula, generation time, generator version, template version, policy/config versions, output checksum, and requester. Reports generated from the same baseline, template, and options must be semantically reproducible.

### 7.5 Metrics and dashboards

- Counts by type, level, owner, priority, criticality, release, and status.
- Requirements without sources, verification plans, implementations, or accepted evidence.
- Verification pass/fail/blocked/not-run/waived counts with explicit denominator.
- Open review findings, suspect links, impacts, and changes by age/owner.
- Volatility with a documented population and change definition.
- Query drill-down from every metric to exact contributing records.
- Missing data is distinct from zero and dashboards respect authorization.

## Required tests

- A review always resolves to exact versions and remains unchanged after current edits.
- AI-generated findings/proposals carry provenance and cannot be mistaken for human approval.
- Closing review with blocking findings is denied without an authorized exception.
- Passing verification requires applicable accepted result, version, environment/configuration, and non-suspect relationship.
- Requirement changes invalidate only evidence selected by configured rules and never silently preserve passing status.
- Coverage metrics distinguish absent, planned, failed, stale, waived, and not-applicable.
- Report metadata and checksum/reproduction tests.
- Dashboard counts equal drill-down query populations under the same authorization scope.

## Deliverables

- Review schemas, workflows, and manager-only recording tools.
- Verification planning/evidence model and applicability evaluator.
- Versioned report templates and asynchronous bounded report jobs where needed.
- Metrics/coverage query library.
- Release-readiness report and evidence-chain examples.

## Exit criteria

- An authorized reader can follow a requirement from source through implementation reference and accepted verification/validation evidence.
- Review and approval records identify exact content, participant, decision, time, and rationale.
- AI activity never becomes an implicit approval or accepted test result.
- Reports are permission-aware, source-identifying, checksumed, and reproducible.
- Release readiness exposes unresolved requirements, links, evidence, risks, changes, and exceptions rather than reducing them to a misleading percentage.

