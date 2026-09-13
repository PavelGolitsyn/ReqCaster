import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CanonicalJsonRepository } from "../../src/adapters/repository/index.js";
import { createAuthoringServices, PreviewTokenStore } from "../../src/application/services/authoring.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";

const manager = {
  agentId: "agent:author",
  authentication: { issuer: "test" },
  principal: { id: "human:accountable" },
  role: "requirements-manager",
};
const tester = { ...manager, agentId: "agent:tester", role: "tester" };

function base(correlationId, idempotencyKey, expectedRepositoryRevision) {
  return { schemaVersion: "1.0.0", correlationId, idempotencyKey, expectedRepositoryRevision };
}

function businessDraft(statement = "The service shall retain governed records for 30 days.") {
  return {
    category: "functional",
    level: "business",
    owner: "platform-team",
    priority: "high",
    rationale: "Required by the records policy.",
    source: "records-policy",
    statement,
  };
}

async function harness(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "spec-speaker-authoring-"));
  const repository = new CanonicalJsonRepository(root, options.policy ? { policy: options.policy } : {});
  await repository.initialize();
  const previewStore = options.previewStore ?? new PreviewTokenStore();
  const services = createAuthoringServices({ repository, policy: options.policy, previewStore });
  const clock = options.clock ?? { now: () => "2026-09-13T12:00:00.000Z" };
  const dispatcher = new ApplicationDispatcher({ clock, services });
  return { dispatcher, previewStore, repository, root };
}

async function createBusiness(dispatcher, overrides = {}) {
  return dispatcher.execute("requirements.create", {
    ...base(overrides.correlationId ?? "corr-create", overrides.idempotencyKey ?? "create-key-0001", overrides.expectedRepositoryRevision ?? 0),
    draft: overrides.draft ?? businessDraft(),
  }, manager, { validateRequest: true });
}

test("create allocates IDs, records accountable provenance, defaults proposed, and returns advisory findings", async () => {
  const { dispatcher, repository } = await harness();
  const response = await createBusiness(dispatcher, { draft: businessDraft("The service should retain records quickly.") });
  assert.equal(response.repositoryRevision, 1);
  assert.equal(response.data.record.id, "BR-000001");
  assert.equal(response.data.record.status, "proposed");
  assert.equal(response.data.record.version, 1);
  assert.equal(response.data.record.provenance.createdBy, manager.agentId);
  assert.equal(response.data.record.provenance.accountablePrincipal, manager.principal.id);
  assert.ok(response.data.warnings.some(({ ruleId }) => ruleId === "REQ-QUALITY-004"));
  assert.equal((await repository.read()).business.requirements.length, 1);
});

test("normal create cannot self-select an advanced lifecycle status", async () => {
  const { dispatcher, repository } = await harness();
  await assert.rejects(createBusiness(dispatcher, { draft: { ...businessDraft(), status: "approved" } }), (error) => error.code === "SCHEMA_VIOLATION");
  assert.equal(await repository.revision(), 0);
});

test("committed create and update retries are durable and reject idempotency key reuse", async () => {
  const { dispatcher, repository, root } = await harness();
  const request = { ...base("corr-create", "durable-create-1", 0), draft: businessDraft() };
  const first = await dispatcher.execute("requirements.create", request, manager, { validateRequest: true });
  const [transactionId] = await readdir(join(root, ".engine", "transactions"));
  const manifest = JSON.parse(await readFile(join(root, ".engine", "transactions", transactionId, "manifest.json"), "utf8"));
  assert.equal(manifest.idempotency.correlationId, "corr-create");
  const reopened = new CanonicalJsonRepository(root);
  await reopened.open();
  const replayDispatcher = new ApplicationDispatcher({ clock: { now: () => "2026-09-14T00:00:00.000Z" }, services: createAuthoringServices({ repository: reopened }) });
  const replay = await replayDispatcher.execute("requirements.create", { ...request, correlationId: "corr-replay" }, manager, { validateRequest: true });
  assert.equal(replay.repositoryRevision, first.repositoryRevision);
  assert.equal(replay.data.record.id, first.data.record.id);
  assert.equal(replay.data.replayed, true);
  await assert.rejects(replayDispatcher.execute("requirements.create", { ...request, correlationId: "corr-reuse", draft: businessDraft("The service shall retain a different record." ) }, manager, { validateRequest: true }), (error) => error.code === "INVALID_ARGUMENT");

  const update = {
    ...base("corr-update", "durable-update-1", 1),
    expectedVersion: 1,
    id: "BR-000001",
    patch: { statement: "The service shall retain governed records for 60 days." },
    reason: "Retention policy changed.",
  };
  const changed = await replayDispatcher.execute("requirements.update", update, manager, { validateRequest: true });
  const updateReplay = await replayDispatcher.execute("requirements.update", { ...update, correlationId: "corr-update-replay" }, manager, { validateRequest: true });
  assert.equal(changed.data.item.version, 2);
  assert.equal(updateReplay.data.item.version, 2);
  assert.equal(await repository.revision(), 2);
});

test("updates constrain immutable fields, require material reasons, return bounded classified diffs, and reject stale versions", async () => {
  const { dispatcher, repository } = await harness();
  await createBusiness(dispatcher);
  const request = {
    ...base("corr-update", "update-key-0001", 1), expectedVersion: 1, id: "BR-000001",
    patch: { owner: "records-team", statement: "The service shall retain governed records for 60 days." },
  };
  await assert.rejects(dispatcher.execute("requirements.update", request, manager, { validateRequest: true }), (error) => error.code === "SCHEMA_VIOLATION");
  const response = await dispatcher.execute("requirements.update", { ...request, reason: "The retention decision changed." }, manager, { validateRequest: true });
  assert.deepEqual(response.data.diff.map(({ field, classification }) => [field, classification]), [["owner", "metadata-only"], ["statement", "material"]]);
  assert.equal(response.data.item.version, 2);
  await assert.rejects(dispatcher.execute("requirements.update", { ...request, ...base("corr-stale", "update-key-0002", 2), reason: "Retry stale content." }, manager, { validateRequest: true }), (error) => error.code === "VERSION_CONFLICT" && error.current.itemVersion === 2);
  assert.equal(await repository.revision(), 2);
});

test("adding an optional metadata field records absence safely without requiring a material reason", async () => {
  const { dispatcher, repository } = await harness();
  await createBusiness(dispatcher);
  const response = await dispatcher.execute("requirements.update", {
    ...base("corr-label", "update-label-001", 1), expectedVersion: 1, id: "BR-000001", patch: { shortLabel: "Records retention" },
  }, manager, { validateRequest: true });
  assert.equal(response.data.diff[0].before, null);
  assert.equal(response.data.diff[0].beforePresent, false);
  assert.equal(response.data.diff[0].classification, "metadata-only");
  assert.equal(await repository.revision(), 2);
});

test("large field changes return bounded hash-backed before and after snapshots", async () => {
  const { dispatcher } = await harness();
  await createBusiness(dispatcher);
  const criteria = Array.from({ length: 10 }, (_, index) => ({ id: `AC-${index + 1}`, text: `Observable result ${"x".repeat(1000)}`, verificationMethod: "test" }));
  const response = await dispatcher.execute("requirements.update", {
    ...base("corr-large", "update-large-001", 1), expectedVersion: 1, id: "BR-000001", patch: { acceptanceCriteria: criteria }, reason: "Add detailed verification criteria.",
  }, manager, { validateRequest: true });
  assert.equal(response.data.diff[0].after.truncated, true);
  assert.match(response.data.diff[0].after.hash, /^[a-f0-9]{64}$/u);
  assert.ok(response.data.diff[0].after.bytes > 8192);
});

test("draft validation is read-only, labels heuristic findings, and does not leak hidden duplicate IDs", async () => {
  const { dispatcher, repository } = await harness();
  const hiddenDraft = { ...businessDraft(), customAttributes: { allocation: ["private"] } };
  await createBusiness(dispatcher, { draft: hiddenDraft });
  const before = await repository.revision();
  const response = await dispatcher.execute("requirements.validateDraft", {
    schemaVersion: "1.0.0", correlationId: "corr-validation", draft: { ...businessDraft(), statement: `${hiddenDraft.statement} TBD.` },
  }, { ...tester, authorization: { components: ["public"], repositories: ["default"] } }, { validateRequest: true });
  assert.equal(await repository.revision(), before);
  assert.equal(response.data.acceptedAutomatically, false);
  assert.ok(response.data.findings.some(({ source, ruleId }) => source === "heuristic" && ruleId === "REQ-QUALITY-008"));
  assert.ok(!response.data.findings.some(({ ruleId }) => ruleId === "REQ-QUALITY-009"));
  assert.ok(response.data.rules.every(({ version }) => version === response.data.ruleCatalogVersion));
});

test("an explicitly promoted quality rule becomes a governed blocking gate", async () => {
  const seed = await harness();
  const policy = await seed.repository.getPolicy();
  policy.qualityRules.promotedRuleIds = ["REQ-QUALITY-004"];
  const { dispatcher, repository } = await harness({ policy });
  await assert.rejects(createBusiness(dispatcher, { draft: businessDraft("The service should retain records quickly.") }), (error) => error.code === "SCHEMA_VIOLATION" && error.details.some(({ reason }) => reason.includes("REQ-QUALITY-004")));
  assert.equal(await repository.revision(), 0);
});

test("retirement retains the requirement, reports impact, and records supersession separately", async () => {
  const { dispatcher, repository } = await harness();
  await createBusiness(dispatcher);
  await createBusiness(dispatcher, { correlationId: "corr-create-2", idempotencyKey: "create-key-0002", expectedRepositoryRevision: 1, draft: businessDraft("The replacement service shall retain governed records for 90 days.") });
  const response = await dispatcher.execute("requirements.retire", {
    ...base("corr-retire", "retire-key-0001", 2), expectedVersion: 1, id: "BR-000001", reason: "Replaced by the longer retention obligation.", replacementId: "BR-000002",
  }, manager, { validateRequest: true });
  assert.equal(response.data.item.status, "retired");
  assert.equal(response.data.item.version, 2);
  assert.equal(response.data.impact.supersession.replacementId, "BR-000002");
  const documents = await repository.read();
  assert.equal(documents.business.requirements.length, 2);
  assert.deepEqual(documents.business.relationships[0].source.id, "BR-000002");
  assert.deepEqual(documents.business.relationships[0].target.id, "BR-000001");
});

test("bulk preview is side-effect free and commit is all-or-nothing with the exact preview scope", async () => {
  let now = "2026-09-13T12:00:00.000Z";
  const { dispatcher, repository } = await harness({ clock: { now: () => now } });
  const previewRequest = {
    ...base("corr-preview", "preview-key-0001", 0),
    operations: [
      { operation: "create", draft: businessDraft() },
      { operation: "create", draft: businessDraft("The archive service shall preserve audit records for 365 days.") },
    ],
  };
  const preview = await dispatcher.execute("requirements.bulkPreview", previewRequest, manager, { validateRequest: true });
  assert.equal(await repository.revision(), 0);
  assert.deepEqual(preview.data.summary.affectedIds, ["BR-000001", "BR-000002"]);
  now = "2026-09-13T12:01:00.000Z";
  const commit = await dispatcher.execute("requirements.bulkCommit", { schemaVersion: "1.0.0", correlationId: "corr-commit", idempotencyKey: "bulk-commit-0001", previewToken: preview.data.previewToken }, manager, { validateRequest: true });
  assert.equal(commit.repositoryRevision, 1);
  assert.deepEqual(commit.data.summary.affectedIds, preview.data.summary.affectedIds);
  assert.equal((await repository.read()).business.requirements.length, 2);
  const replay = await dispatcher.execute("requirements.bulkCommit", { schemaVersion: "1.0.0", correlationId: "corr-commit-replay", idempotencyKey: "bulk-commit-0001", previewToken: preview.data.previewToken }, manager, { validateRequest: true });
  assert.equal(replay.data.replayed, true);
  assert.equal(await repository.revision(), 1);
});

test("bulk preview reports partial validation failure without persistence and tokens reject tampering, expiration, and concurrent revisions", async () => {
  let now = "2026-09-13T12:00:00.000Z";
  const previewStore = new PreviewTokenStore({ ttlMilliseconds: 1000 });
  const { dispatcher, repository } = await harness({ clock: { now: () => now }, previewStore });
  const invalid = await dispatcher.execute("requirements.bulkPreview", {
    ...base("corr-invalid", "preview-invalid-1", 0), operations: [{ operation: "create", draft: businessDraft() }, { operation: "update", id: "BR-999999", expectedVersion: 1, patch: { owner: "x" } }],
  }, manager, { validateRequest: true });
  assert.equal(invalid.data.valid, false);
  assert.equal(invalid.data.errors.length, 1);
  assert.equal(await repository.revision(), 0);

  const fresh = await dispatcher.execute("requirements.bulkPreview", { ...base("corr-fresh", "preview-fresh-01", 0), operations: [{ operation: "create", draft: businessDraft() }] }, manager, { validateRequest: true });
  await assert.rejects(dispatcher.execute("requirements.bulkCommit", { schemaVersion: "1.0.0", correlationId: "corr-tamper", idempotencyKey: "bulk-tamper-001", previewToken: `${fresh.data.previewToken}x` }, manager, { validateRequest: true }), (error) => error.code === "PREVIEW_EXPIRED");
  now = "2026-09-13T12:00:02.000Z";
  await assert.rejects(dispatcher.execute("requirements.bulkCommit", { schemaVersion: "1.0.0", correlationId: "corr-expired", idempotencyKey: "bulk-expired-01", previewToken: fresh.data.previewToken }, manager, { validateRequest: true }), (error) => error.code === "PREVIEW_EXPIRED");

  now = "2026-09-13T12:00:03.000Z";
  const concurrent = await dispatcher.execute("requirements.bulkPreview", { ...base("corr-concurrent", "preview-concur-1", 0), operations: [{ operation: "create", draft: businessDraft() }] }, manager, { validateRequest: true });
  await createBusiness(dispatcher, { correlationId: "corr-outside", idempotencyKey: "outside-create-1" });
  await assert.rejects(dispatcher.execute("requirements.bulkCommit", { schemaVersion: "1.0.0", correlationId: "corr-conflict", idempotencyKey: "bulk-conflict-01", previewToken: concurrent.data.previewToken }, manager, { validateRequest: true }), (error) => error.code === "VERSION_CONFLICT");
  assert.equal(await repository.revision(), 1);
});

test("read-only roles cannot persist through authoring or validation endpoints", async () => {
  const { dispatcher, repository } = await harness();
  await assert.rejects(dispatcher.execute("requirements.create", { ...base("corr-denied", "denied-create-1", 0), draft: businessDraft() }, tester, { validateRequest: true }), (error) => error.code === "FORBIDDEN");
  await dispatcher.execute("requirements.validateDraft", { schemaVersion: "1.0.0", correlationId: "corr-safe", draft: businessDraft() }, tester, { validateRequest: true });
  assert.equal(await repository.revision(), 0);
});

test("out-of-band canonical edits enter integrity failure and preserve the last committed checksum", async () => {
  const { dispatcher, repository, root } = await harness();
  await createBusiness(dispatcher);
  const integrityBefore = await readFile(join(root, ".engine", "versions", "current.json"), "utf8");
  const path = join(root, "business-requirements.json");
  const document = JSON.parse(await readFile(path, "utf8"));
  document.requirements[0].statement = "The directly edited service shall bypass governance.";
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
  await assert.rejects(repository.read(), (error) => error.code === "INTEGRITY_FAILURE");
  assert.equal(await readFile(join(root, ".engine", "versions", "current.json"), "utf8"), integrityBefore);
});
