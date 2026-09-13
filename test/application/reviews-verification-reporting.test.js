import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CanonicalJsonRepository } from "../../src/adapters/repository/index.js";
import { AuthorizationPolicyEvaluator } from "../../src/application/authorization.js";
import { createAuthoringServices } from "../../src/application/services/authoring.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";
import { createReviewVerificationReportingServices } from "../../src/application/services/reviews-verification-reporting.js";

const manager = { agentId: "agent:manager", authentication: { issuer: "test" }, principal: { id: "human:manager" }, role: "requirements-manager" };
const reviewer = { agentId: "agent:reviewer", authentication: { issuer: "test" }, principal: { id: "human:reviewer" }, role: "reviewer" };
const tester = { agentId: "agent:tester", authentication: { issuer: "test" }, principal: { id: "human:tester" }, role: "tester" };
const envelope = (correlationId, idempotencyKey, expectedRepositoryRevision) => ({ correlationId, expectedRepositoryRevision, idempotencyKey, schemaVersion: "1.0.0" });

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "speccaster-stage7-"));
  const repository = new CanonicalJsonRepository(root);
  await repository.initialize();
  const authorization = new AuthorizationPolicyEvaluator();
  let now = "2026-09-13T12:00:00.000Z";
  const options = { authorization, repository };
  const services = { ...createAuthoringServices(options), ...createReviewVerificationReportingServices(options) };
  const dispatcher = new ApplicationDispatcher({ authorization, clock: { now: () => now }, services });
  return { dispatcher, repository, setNow: (value) => { now = value; } };
}

async function seed(repository) {
  await repository.execute(({ business }, allocation) => {
    business.requirements.push({
      acceptanceCriteria: [{ id: "AC-1", text: "The measured latency is at most 100 ms.", verificationMethod: "test" }],
      category: "quality", id: allocation.allocateRequirementId("business"), level: "business", owner: "team:platform", priority: "high",
      provenance: { accountablePrincipal: "human:seed", aiAssistance: { assisted: false }, createdAt: "2026-09-13T10:00:00.000Z", createdBy: "seed", updatedAt: "2026-09-13T10:00:00.000Z", updatedBy: "seed" },
      rationale: "Customers require responsive behavior.", sourceReferences: [{ type: "request", uri: "urn:request:1" }],
      statement: "The product shall respond within 100 ms.", status: "proposed", verificationMethods: ["test"], version: 1,
    });
    business.relationships.push({
      id: allocation.allocateRelationshipId(), rationale: "This result verifies the latency requirement.",
      provenance: { accountablePrincipal: "human:seed", aiAssistance: { assisted: false }, createdAt: "2026-09-13T10:00:00.000Z", createdBy: "seed", updatedAt: "2026-09-13T10:00:00.000Z", updatedBy: "seed" },
      source: { id: "BR-000001", kind: "requirement", version: 1 }, status: "valid", suspect: false,
      target: { artifactType: "evidence", externalId: "RESULT-1", externalVersion: "1", id: "RESULT-1", kind: "external:evidence", system: "lab", systemOfRecord: "lab" },
      type: "verified_by", version: 1,
    });
  }, { actor: "seed" });
}

test("reviews freeze exact versions, identify AI findings, deny read-only recording, and enforce blocking closure", async () => {
  const { dispatcher, repository } = await harness(); await seed(repository);
  const created = await dispatcher.execute("reviews.create", {
    ...envelope("review-create", "review-create-01", 1), purpose: "Approve latency behavior.", requirementIds: ["BR-000001"], reviewType: "formal", title: "Latency review",
  }, manager, { validateRequest: true });
  assert.deepEqual(created.data.review.requirementVersions, [{ id: "BR-000001", version: 1 }]);
  assert.deepEqual(created.data.review.relationshipVersions, [{ id: "RL-000001", version: 1 }]);

  const finding = await dispatcher.execute("reviews.recordFinding", {
    ...envelope("finding", "review-find-001", 2), aiProvenance: { model: "review-model", provider: "test-provider", suggestionId: "suggestion-1" },
    author: "agent:reviewer", expectedVersion: 1, origin: "ai", reviewId: created.data.review.id, severity: "blocking", summary: "The threshold conditions are incomplete.",
  }, manager, { validateRequest: true });
  assert.equal(finding.data.finding.origin, "ai");
  assert.ok(finding.data.finding.aiProvenance);

  await assert.rejects(dispatcher.execute("reviews.recordDecision", {
    ...envelope("implicit", "implicit-deny-01", 3), decision: "approve", expectedVersion: 2, id: created.data.review.id, rationale: "Viewing is not approval.",
  }, reviewer, { validateRequest: true }), (error) => error.code === "FORBIDDEN");
  await assert.rejects(dispatcher.execute("reviews.recordDecision", {
    ...envelope("close-denied", "close-denied-01", 3), decision: "close", expectedVersion: 2, id: created.data.review.id, rationale: "Try to close.",
  }, manager, { validateRequest: true }), (error) => error.code === "INVALID_ARGUMENT");

  const disposed = await dispatcher.execute("reviews.dispositionFinding", {
    ...envelope("dispose", "dispose-find-001", 3), disposition: "resolved", expectedVersion: 2, findingId: finding.data.finding.id,
    rationale: "The procedure now defines load and warm-up conditions.", reviewId: created.data.review.id,
  }, manager, { validateRequest: true });
  await dispatcher.execute("reviews.recordDecision", {
    ...envelope("approve", "approve-review-1", 4), decision: "approve", expectedVersion: disposed.data.reviewVersion, id: created.data.review.id, rationale: "The reviewed exact versions are acceptable.",
  }, manager, { validateRequest: true });
  await dispatcher.execute("reviews.recordDecision", {
    ...envelope("close", "close-review-001", 5), decision: "close", expectedVersion: 4, id: created.data.review.id, rationale: "All blocking findings are resolved.",
  }, manager, { validateRequest: true });
  await repository.execute(({ business }) => { business.requirements[0].owner = "team:performance"; business.requirements[0].version += 1; }, { actor: "later-edit" });
  const read = await dispatcher.execute("reviews.get", { correlationId: "review-read", reviewId: created.data.review.id, schemaVersion: "1.0.0" }, reviewer, { validateRequest: true });
  assert.deepEqual(read.data.review.requirementVersions, [{ id: "BR-000001", version: 1 }]);
  assert.equal(read.data.review.status, "closed");
});

test("verification requires accepted applicable evidence and only configured changes make it stale", async () => {
  const { dispatcher, repository } = await harness(); await seed(repository);
  const plan = await dispatcher.execute("verification.recordPlan", {
    ...envelope("plan", "verify-plan-001", 1), acceptanceCriteria: [{ conditions: "Steady state at 50 requests/s.", measurementMethod: "p95 from the lab trace", parameter: "response latency", threshold: "<= 100 ms" }],
    configuration: "linux-x64:release", methods: ["test"], owner: "team:quality", procedure: { id: "TC-LATENCY", version: "2" }, requirementId: "BR-000001", requirementVersion: 1,
  }, manager, { validateRequest: true });
  assert.equal(plan.data.plan.status, "planned");
  await assert.rejects(dispatcher.execute("verification.recordEvidence", {
    ...envelope("tester-write", "tester-write-001", 2), acceptanceDecision: "accept", actualResult: "p95 was 82 ms", artifactChecksum: "a".repeat(64), artifactUri: "urn:result:1", authority: "human:tester", caseId: "TC-LATENCY", caseVersion: "2", configuration: "linux-x64:release", environment: "lab-a", executedAt: "2026-09-13T11:00:00.000Z", executor: "agent:tester", expectedResult: "p95 <= 100 ms", externalId: "RESULT-1", externalVersion: "1", origin: "human", relationshipId: "RL-000001", requirementVersions: [{ id: "BR-000001", version: 1 }], sourceSystem: "lab", status: "passed",
  }, tester, { validateRequest: true }), (error) => error.code === "FORBIDDEN");
  await dispatcher.execute("verification.recordEvidence", {
    ...envelope("evidence", "verify-result-01", 2), acceptanceDecision: "accept", actualResult: "p95 was 82 ms", artifactChecksum: "a".repeat(64), artifactUri: "urn:result:1", authority: "human:manager", caseId: "TC-LATENCY", caseVersion: "2", configuration: "linux-x64:release", environment: "lab-a", executedAt: "2026-09-13T11:00:00.000Z", executor: "agent:tester", expectedResult: "p95 <= 100 ms", externalId: "RESULT-1", externalVersion: "1", origin: "human", relationshipId: "RL-000001", requirementVersions: [{ id: "BR-000001", version: 1 }], sourceSystem: "lab", status: "passed",
  }, manager, { validateRequest: true });
  let status = await dispatcher.execute("verification.status", { configuration: "linux-x64:release", correlationId: "status-1", requirementIds: ["BR-000001"], schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.equal(status.data.items[0].status, "passed");

  await dispatcher.execute("requirements.update", { ...envelope("owner", "owner-change-001", 3), expectedVersion: 1, id: "BR-000001", patch: { owner: "team:performance" } }, manager, { validateRequest: true });
  status = await dispatcher.execute("verification.status", { configuration: "linux-x64:release", correlationId: "status-2", requirementIds: ["BR-000001"], schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.equal(status.data.items[0].status, "passed", "non-sensitive owner change carries evidence forward");

  await dispatcher.execute("requirements.update", { ...envelope("statement", "statement-change", 4), expectedVersion: 2, id: "BR-000001", patch: { statement: "The product shall respond within 80 ms." }, reason: "The latency objective became stricter." }, manager, { validateRequest: true });
  status = await dispatcher.execute("verification.status", { configuration: "linux-x64:release", correlationId: "status-3", requirementIds: ["BR-000001"], schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.equal(status.data.items[0].status, "stale");
  assert.equal((await repository.read()).business.qualityControl.evidence[0].potentiallyStale, true);
});

test("reports are semantically reproducible and dashboard counts equal drill-down populations", async () => {
  const { dispatcher, setNow, repository } = await harness(); await seed(repository);
  const first = await dispatcher.execute("requirements.report", { correlationId: "report-1", filters: { release: "R1" }, reportType: "readiness", schemaVersion: "1.0.0", templateVersion: "2.0.0" }, reviewer, { validateRequest: true });
  setNow("2026-09-13T13:00:00.000Z");
  const second = await dispatcher.execute("requirements.report", { correlationId: "report-2", filters: { release: "R1" }, reportType: "readiness", schemaVersion: "1.0.0", templateVersion: "2.0.0" }, reviewer, { validateRequest: true });
  assert.equal(first.data.metadata.outputChecksum, second.data.metadata.outputChecksum);
  assert.equal(first.data.metadata.reportId, second.data.metadata.reportId);
  assert.notEqual(first.data.metadata.generatedAt, second.data.metadata.generatedAt);
  const recalled = await dispatcher.execute("requirements.report", { correlationId: "report-read", reportId: first.data.metadata.reportId, reportType: "readiness", schemaVersion: "1.0.0" }, reviewer, { validateRequest: true });
  assert.equal(recalled.data.metadata.outputChecksum, first.data.metadata.outputChecksum);

  const dashboard = await dispatcher.execute("metrics.dashboard", { correlationId: "metrics", groupBy: "owner", schemaVersion: "1.0.0" }, reviewer, { validateRequest: true });
  assert.equal(dashboard.data.denominator, dashboard.data.groups.reduce((sum, bucket) => sum + bucket.count, 0));
  for (const bucket of dashboard.data.groups) assert.equal(bucket.count, bucket.recordIds.length);
});
