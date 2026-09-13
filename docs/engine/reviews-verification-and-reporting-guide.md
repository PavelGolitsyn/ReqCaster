# Reviews, verification, and reporting

Stage 7 stores review, verification-plan, and verification-evidence records in the business canonical document's governed `qualityControl` envelope. These records participate in the same atomic commit, optimistic concurrency, canonical validation, audit provenance, backup, recovery, and baseline snapshot mechanisms as requirements and relationships.

## Service wiring

Add `createReviewVerificationReportingServices(options)` to the service map supplied to `ApplicationDispatcher`. Pass the same repository, authorization evaluator, baseline store, and audit log used by the other service factories. A bounded `ReportRegistry` may be shared when generated reports must be recalled by `reportId`.

The manager-only command surface is:

- `reviews.create`, `reviews.recordFinding`, `reviews.dispositionFinding`, `reviews.recordDecision`, and `reviews.reopen`;
- `verification.recordPlan` and `verification.recordEvidence`.

The read surface is `reviews.get`, `verification.status`, `requirements.report`, and `metrics.dashboard`. Reviewer, tester, and implementer roles can use only this read surface. Reading, commenting outside the engine, generating a report, or returning an AI proposal never creates a decision or accepted result.

## Review evidence chain

`reviews.create` resolves the selected requirements and relationships immediately and stores their exact IDs and versions. Later edits do not alter that frozen scope. A manager may record findings obtained from a human, an AI reviewer, or an import. AI findings require provider, model, and suggestion identifiers and remain findings; they cannot be decisions.

An approval, rejection, abstention, close, or reopen operation is attributable to the authenticated human principal. Closing fails while a blocking finding remains open unless that same principal supplies a reasoned exception with a future expiry or review time. Dispositioning a finding and approving a review are separate actions.

Example chain:

```text
RV-000001 v1  scope BR-000001@1, RL-000001@1
RV-000001 v2  FN-000001 recorded (origin=ai, severity=blocking)
RV-000001 v3  FN-000001 resolved by human:manager
RV-000001 v4  approve decision by human:manager
RV-000001 v5  closed by human:manager
```

## Verification applicability

A verification plan records one exact requirement version, one or more approved methods, objective criteria (parameter, measurement method, threshold, and conditions), a versioned case/procedure, an owner, and configuration context.

Evidence records contain a stable internal and external ID/version, exact covered requirement versions, case version, environment, configuration, dataset, executor/time, expected and actual summaries, result status, artifact URI and SHA-256 checksum, system of record, defects, disposition, and origin. AI-originated evidence carries model/run provenance. `acceptanceDecision: "record-only"` preserves a result without using it for passing coverage. `acceptanceDecision: "accept"` requires an authenticated human authority matching the caller.

Passing status requires all of the following:

1. accepted evidence with `status: "passed"`;
2. matching release, variant, and configuration filters when supplied;
3. applicability to the current/baselined requirement under the configured staleness rules;
4. a valid, non-suspect `verified_by` or `validated_by` relationship unless policy disables that gate.

The default policy marks evidence potentially stale after changes to `statement`, `acceptanceCriteria`, `verificationMethods`, or `criticality`. Changes outside `verification.staleOnFields`, such as owner reassignment, carry accepted evidence forward. This makes invalidation selective and explicit.

`verification.status` distinguishes `absent`, `planned`, `not_run`, `pending_acceptance`, `failed`, `blocked`, `stale`, `waived`, `not_applicable`, and `passed`. It returns both the full population denominator and an applicable denominator that excludes `not_applicable` records.

## Reproducible reports and metrics

`requirements.report` supports requirements specifications, traceability, coverage, orphan, review, change, baseline, comparison, verification, readiness, audit, and history projections. Each result includes:

- current revision or immutable baseline source;
- normalized filters and an explicit population formula;
- generator, template, policy, and configuration versions;
- generation time and requesting principal;
- deterministic semantic output checksum and content-derived report ID;
- a truncation flag for the bounded synchronous population.

Generation time and requester attribution are intentionally outside the semantic checksum. Consequently, the same source, template, options, authorization scope, and generator version produce the same checksum. Report recall is restricted to the exact authorization scope that generated it.

The release-readiness projection exposes requirement lifecycle and verification state, unresolved findings, suspect links, open changes, failed/blocked/waived/not-applicable evidence, and risk relationships. It does not collapse readiness into a single percentage.

`metrics.dashboard` returns every count with its sorted contributing record IDs. Missing group values use a distinct `key: null, missing: true` bucket, including an explicit zero-count bucket when no records are missing. The denominator therefore equals the sum of drill-down populations under the same authorization scope.
