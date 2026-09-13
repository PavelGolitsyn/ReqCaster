# Stage 10 — Deployment Readiness and Independent Assurance

## Outcome

Turn the completed Stage 0–9 implementation into a deployable v1.0.0 release
candidate in a named target environment. Close the deployment-only controls
that automated Stage 9 evidence could not prove, while keeping production
traffic disabled.

## Entry criteria

- The Stage 9 automated evidence is complete and reproducible.
- The candidate artifact, API/schema versions, Node runtime, and configuration
  are identified.
- A non-critical pilot repository and accountable owners can be named.
- The release remains **no-go** under the current readiness checklist until
  this stage and the controlled pilot pass.

## Work packages

### 10.1 Evidence intake and gate ownership

- Review the [end-to-end acceptance](../../evidence/stage-09/end-to-end-acceptance.md),
  [performance baseline](../../evidence/stage-09/performance-baseline.md),
  [security assessment](../../evidence/stage-09/security-assessment.md),
  [fault-injection matrix](../../evidence/stage-09/fault-injection-matrix.md),
  [recovery rehearsal](../../evidence/stage-09/recovery-upgrade-rollback.md),
  and [residual-risk register](../../evidence/stage-09/residual-risk-register.md).
- Create the deployment change record and name the requirements, test,
  engineering, security, operations, audit, and data owners.
- Record the target environment, data classification, pilot scope, release
  checksum, compatibility versions, evidence locations, and decision dates.
- Convert every pending item in the
  [production readiness checklist](../../production/release-readiness.md) into
  an owned action with an acceptance condition. Missing ownership is a blocker.

### 10.2 Environment hardening

- Run the service as a dedicated non-login account limited to one requirements
  root, with no write access to application code.
- Configure TLS 1.2 or later, approved issuer and audience checks, secret-manager
  credentials, encryption for classified data and backups, key rotation, and
  destination-specific egress rules.
- Prove that request role claims are ignored and that authorization uses the
  authenticated transport identity at action time.
- Validate telemetry allowlists and confirm logs, metrics, traces, alerts, and
  support bundles contain no governed content or credentials.
- Pin Node >= 22, reproduce the build, sign the candidate artifact, and record
  its checksum and configuration manifest.

### 10.3 Independent security and policy review

- Perform an independent review of the exposed transport, identity mapping,
  TLS, secret storage, service-account ACLs, host hardening, volume encryption,
  backup encryption, and key rotation.
- Penetration-test the deployed adapters within the declared limits, including
  spoofing, confused-deputy, traversal, malformed input, overload, revocation,
  and information-disclosure cases.
- Close all critical/high findings. Lower findings require an owner, due date,
  compensating control, and explicit risk acceptance.
- Obtain the security/privacy and audit/retention decisions required by the
  readiness checklist.

### 10.4 Deployment recovery and operations proof

- Configure dashboards and every alert in the
  [operations runbook](../../production/operations-and-incident-response.md),
  then test routing, ownership, anti-noise behavior, and escalation.
- On the production filesystem, exercise disk-full and process-termination
  recovery while recording volume telemetry, fault time, recovered revision,
  checksums, RPO, and RTO.
- Back up through the encrypted production backup store and network path;
  restore into a new isolated directory; validate repository, audit, baselines,
  and indexes; and demonstrate RPO <= 24 hours and RTO <= 60 minutes.
- Rehearse upgrade, migration preview, rollback, fail-closed integrity response,
  credential revocation, index rebuild, and redacted support-bundle creation.
- Verify the target host against the documented
  [capacity envelope and service objectives](../../production/capacity-and-service-objectives.md).

## Required evidence

- Completed deployment-control checklist and environment/configuration manifest.
- Independent security report, penetration-test report, and remediation log.
- Production-filesystem fault drill and encrypted-store restore report.
- Alert-routing, incident-tabletop, upgrade, and rollback records.
- Updated residual-risk register with named owners and approvals.
- Signed candidate artifact checksum and reproducible CI result.

Store durable outputs under `docs/evidence/stage-10/` or in the controlled
deployment evidence system, with stable links from the deployment change record.
Do not commit secrets, credentials, governed requirement bodies, or sensitive
penetration-test details.

## Exit criteria

- No critical/high security finding is open.
- The deployed environment satisfies the security and operations requirements.
- The production-path restore and fault drill meet the stated RPO/RTO and
  preserve canonical, audit, baseline, and configuration integrity.
- Dashboards, alerts, runbooks, on-call ownership, and rollback authority work
  in the target environment.
- Every non-pilot readiness gate is signed or has an explicitly approved
  residual risk.
- The requirements lead, security lead, and operations lead authorize entry
  into the controlled pilot; production rollout remains disabled.

