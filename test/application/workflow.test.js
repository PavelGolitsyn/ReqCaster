import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CanonicalJsonRepository } from "../../src/adapters/repository/index.js";
import { AuthorizationPolicyEvaluator } from "../../src/application/authorization.js";
import { createAuthoringServices } from "../../src/application/services/authoring.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";
import { createTraceabilityServices } from "../../src/application/services/traceability.js";
import { createWorkflowServices, TransactionalOutbox } from "../../src/application/services/workflow.js";

const manager = { agentId: "agent:manager", authentication: { issuer: "test" }, principal: { id: "human:manager" }, role: "requirements-manager" };
const tester = { agentId: "agent:tester", authentication: { issuer: "test" }, principal: { id: "human:tester" }, role: "tester" };
const base = (correlationId, idempotencyKey, expectedRepositoryRevision) => ({ correlationId, expectedRepositoryRevision, idempotencyKey, schemaVersion: "1.0.0" });

function draft(statement = "The product shall retain governed settings for 30 days.") {
  return {
    acceptanceCriteria: [{ id: "AC-1", text: "Retention is observed for 30 days.", verificationMethod: "test" }],
    category: "functional",
    level: "business",
    owner: "team:platform",
    priority: "high",
    rationale: "The records policy requires retention.",
    source: "records-policy",
    sourceReferences: [{ type: "policy", uri: "https://example.test/policy" }],
    statement,
  };
}

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "spec-speaker-workflow-"));
  const repository = new CanonicalJsonRepository(root);
  await repository.initialize();
  const authorization = new AuthorizationPolicyEvaluator();
  let now = "2026-09-13T12:00:00.000Z";
  const options = { authorization, repository };
  const services = { ...createAuthoringServices(options), ...createTraceabilityServices(options), ...createWorkflowServices(options) };
  const dispatcher = new ApplicationDispatcher({ authorization, clock: { now: () => now }, services });
  return { dispatcher, repository, root, setNow: (value) => { now = value; } };
}

async function createAndCover(dispatcher, statement) {
  const created = await dispatcher.execute("requirements.create", { ...base("create", "create-workflow-1", 0), draft: draft(statement) }, manager, { validateRequest: true });
  await dispatcher.execute("requirements.link", {
    ...base("link", "link-workflow-001", 1),
    rationale: "The evidence verifies the requirement.",
    relationshipType: "verified_by",
    source: { id: created.data.record.id, kind: "requirement", version: 1 },
    target: { artifactType: "evidence", externalId: "EV-1", kind: "external:evidence", system: "test-system", systemOfRecord: "test-system" },
  }, manager, { validateRequest: true });
  return created.data.record.id;
}

async function transition(dispatcher, revision, version, toStatus, extra = {}) {
  return dispatcher.execute("requirements.transition", {
    ...base(`transition-${toStatus}`, `transition-${toStatus}-key`, revision),
    expectedPolicyVersion: "1",
    expectedVersion: version,
    id: "BR-000001",
    rationale: `Move the governed requirement to ${toStatus}.`,
    toStatus,
    ...extra,
  }, manager, { validateRequest: true });
}

test("transition inspection is read-only and transition commands enforce gates, policy versions, permissions, and attributable exceptions", async () => {
  const { dispatcher, repository } = await harness();
  await createAndCover(dispatcher, "The product shall retain governed settings TBD.");
  const inspected = await dispatcher.execute("requirements.possibleTransitions", { correlationId: "inspect", id: "BR-000001", schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.equal(await repository.revision(), 2);
  assert.equal(inspected.data.transitions.find(({ to }) => to === "reviewed").allowed, false);
  assert.ok(inspected.data.transitions.find(({ to }) => to === "reviewed").blockers.some(({ code }) => code === "permission"));
  await assert.rejects(transition(dispatcher, 2, 1, "reviewed"), (error) => error.code === "INVALID_ARGUMENT" && error.details.some(({ reason }) => reason.includes("placeholder")));
  await assert.rejects(dispatcher.execute("requirements.transition", {
    ...base("bad-policy", "bad-policy-key1", 2), expectedPolicyVersion: "0", expectedVersion: 1, id: "BR-000001", rationale: "Try stale policy.", toStatus: "reviewed",
  }, manager, { validateRequest: true }), (error) => error.code === "VERSION_CONFLICT");
  const moved = await transition(dispatcher, 2, 1, "reviewed", { exception: { approver: "human:manager", rationale: "The placeholder is an accepted scoped exception.", reviewAt: "2026-10-01T00:00:00.000Z", scope: ["blocking-tbds"] } });
  assert.equal(moved.data.item.status, "reviewed");
  assert.equal(moved.data.item.lifecycleHistory[0].accountablePrincipal, "human:manager");
  assert.equal(moved.data.policyVersion, "1");
  assert.equal((await repository.read()).business.changeControl.outbox[0].eventType, "requirement.transitioned");
  await assert.rejects(dispatcher.execute("requirements.transition", {
    ...base("deny-transition", "deny-transition-1", 3), expectedPolicyVersion: "1", expectedVersion: 2, id: "BR-000001", rationale: "A read must not imply approval.", toStatus: "approved",
    evidenceReferences: [{ id: "review-1", status: "accepted", type: "review-decision" }],
  }, tester, { validateRequest: true }), (error) => error.code === "FORBIDDEN");
});

test("approved content requires an approved exact-version change and implementation commits requirements, suspect links, impacts, history, and outbox atomically", async () => {
  const { dispatcher, repository } = await harness();
  await createAndCover(dispatcher);
  await transition(dispatcher, 2, 1, "reviewed");
  await transition(dispatcher, 3, 2, "approved", { evidenceReferences: [{ id: "review-1", status: "accepted", type: "review-decision" }] });
  const baselineSnapshot = structuredClone(await repository.read());
  await assert.rejects(dispatcher.execute("requirements.update", {
    ...base("direct", "direct-update-01", 4), expectedVersion: 3, id: "BR-000001", patch: { statement: "The product shall retain governed settings for 60 days." }, reason: "The policy changed.",
  }, manager, { validateRequest: true }), (error) => error.code === "INVALID_ARGUMENT" && error.message.includes("approved or baselined"));

  const created = await dispatcher.execute("changes.create", {
    ...base("change-create", "change-create-01", 4), accountableOwner: "team:platform", rationale: "The retention period increased.", source: "records-policy-v2", title: "Increase retention",
    proposedChanges: [{ expectedVersion: 3, id: "BR-000001", operation: "update", patch: { statement: "The product shall retain governed settings for 60 days." }, reason: "The records policy changed." }],
  }, manager, { validateRequest: true });
  assert.equal(created.data.change.id, "CH-000001");
  const triaged = await dispatcher.execute("changes.triage", { ...base("triage", "change-triage-1", 5), accountableOwner: "team:platform", changeId: "CH-000001", expectedVersion: 1 }, manager, { validateRequest: true });
  const analyzed = await dispatcher.execute("changes.analyze", { ...base("analyze", "change-analyze-1", 6), changeId: "CH-000001", expectedVersion: triaged.data.change.version }, manager, { validateRequest: true });
  assert.equal(analyzed.data.change.impactSnapshot.repositoryRevision, 6);
  assert.equal(analyzed.data.change.impacts[0].artifact.id, "test-system:evidence:EV-1");
  const dispositioned = await dispatcher.execute("changes.dispositionImpact", {
    ...base("disposition", "change-disposition-1", 7), changeId: "CH-000001", disposition: "accepted", expectedVersion: analyzed.data.change.version,
    impact: analyzed.data.change.impacts[0].artifact, owner: "human:manager", rationale: "The evidence owner will reverify after implementation.",
  }, manager, { validateRequest: true });
  const decided = await dispatcher.execute("changes.decide", {
    ...base("decide", "change-decide-01", 8), authority: "human:manager", changeId: "CH-000001", decision: "approve", expectedVersion: dispositioned.data.change.version, rationale: "The assessed change is authorized.",
  }, manager, { validateRequest: true });
  assert.equal(decided.data.change.status, "approved");
  const preview = await dispatcher.execute("changes.previewImplementation", { ...base("preview", "change-preview-1", 9), changeId: "CH-000001", expectedVersion: decided.data.change.version }, manager, { validateRequest: true });
  assert.equal(await repository.revision(), 9);
  const committed = await dispatcher.execute("changes.commitImplementation", { correlationId: "commit", idempotencyKey: "change-commit-01", previewToken: preview.data.previewToken, schemaVersion: "1.0.0" }, manager, { validateRequest: true });
  assert.equal(committed.repositoryRevision, 10);
  assert.equal(committed.data.change.status, "verifying");
  const documents = await repository.read();
  assert.equal(documents.business.requirements[0].version, 4);
  assert.equal(documents.business.requirements[0].statement.includes("60 days"), true);
  assert.equal(documents.business.relationships[0].status, "suspect");
  assert.equal(documents.business.changeControl.changes[0].implementation.diffHash, preview.data.diffHash);
  assert.equal(baselineSnapshot.business.requirements[0].statement.includes("30 days"), true);
  assert.equal(baselineSnapshot.business.requirements[0].version, 3);

  await assert.rejects(dispatcher.execute("changes.close", {
    ...base("close-blocked", "change-close-01", 10), authority: "human:manager", changeId: "CH-000001", evidenceReferences: [{ id: "verification-1", status: "passed", type: "verification" }], expectedVersion: committed.data.change.version, rationale: "Close after verification.",
  }, manager, { validateRequest: true }), (error) => error.code === "INVALID_ARGUMENT" && error.details.some(({ reason }) => reason.includes("suspect")));
  await dispatcher.execute("requirements.reassessLink", { ...base("reassess", "change-reassess-1", 10), assessment: "updated", expectedVersion: 2, id: "RL-000001", rationale: "Evidence was updated for the revised requirement." }, manager, { validateRequest: true });
  const closed = await dispatcher.execute("changes.close", {
    ...base("close", "change-close-02", 11), authority: "human:manager", changeId: "CH-000001", evidenceReferences: [{ id: "verification-1", status: "passed", type: "verification" }], expectedVersion: committed.data.change.version, rationale: "Verification passed and impacts are resolved.",
  }, manager, { validateRequest: true });
  assert.equal(closed.data.change.status, "closed");
});

test("truncated impact analysis blocks decision unless explicitly accepted and outbox failures are retryable without duplicate delivery keys", async () => {
  const { dispatcher, repository, setNow } = await harness();
  await createAndCover(dispatcher);
  const created = await dispatcher.execute("changes.create", {
    ...base("create-change", "truncate-create-1", 2), accountableOwner: "team:platform", rationale: "Assess a bounded graph.", source: "owner-request", title: "Bounded analysis",
    proposedChanges: [{ expectedVersion: 1, id: "BR-000001", operation: "update", patch: { owner: "team:new" } }],
  }, manager, { validateRequest: true });
  await dispatcher.execute("changes.triage", { ...base("triage", "truncate-triage-1", 3), accountableOwner: "team:platform", changeId: created.data.change.id, expectedVersion: 1 }, manager, { validateRequest: true });
  const analyzed = await dispatcher.execute("changes.analyze", { ...base("analyze", "truncate-analyze-1", 4), changeId: created.data.change.id, expectedVersion: 2, nodeLimit: 1 }, manager, { validateRequest: true });
  assert.equal(analyzed.data.change.status, "analyzing");
  assert.equal(analyzed.data.blockers[0].code, "impact-truncated");
  const accepted = await dispatcher.execute("changes.analyze", {
    ...base("reanalyze", "truncate-analyze-2", 5), acceptTruncation: true, changeId: created.data.change.id, expectedVersion: 3, nodeLimit: 1, truncationRationale: "The bounded external-only edge is sufficient for this administrative edit.",
  }, manager, { validateRequest: true });
  assert.equal(accepted.data.change.status, "ready_for_decision");
  assert.equal(accepted.data.change.impactSnapshot.truncationAcceptance.authority, "human:manager");

  let attempts = 0;
  const keys = [];
  const outbox = new TransactionalOutbox({
    clock: { now: () => "2026-09-13T13:00:00.000Z" },
    handler: { deliver: async (_event, { idempotencyKey }) => { attempts += 1; keys.push(idempotencyKey); if (attempts === 1) throw new Error("temporary failure"); } },
    repository,
  });
  setNow("2026-09-13T13:00:00.000Z");
  const failed = await outbox.deliverNext();
  assert.equal(failed.event.status, "failed");
  const delivered = await outbox.deliverNext();
  assert.equal(delivered.event.status, "delivered");
  assert.equal(keys[0], keys[1]);
});
