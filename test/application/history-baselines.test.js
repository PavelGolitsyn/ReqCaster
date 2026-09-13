import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ImmutableBaselineStore, RepositoryBackupManager, TamperEvidentAuditLog, CanonicalJsonRepository } from "../../src/adapters/repository/index.js";
import { AuthorizationPolicyEvaluator } from "../../src/application/authorization.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";
import { createHistoryBaselineServices, readiness } from "../../src/application/services/history-baselines.js";

const manager = { agentId: "agent:manager", authentication: { issuer: "test" }, principal: { id: "human:manager" }, role: "requirements-manager" };

async function harness(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "speccaster-stage6-"));
  const audit = new TamperEvidentAuditLog(root, { segmentSize: options.segmentSize ?? 2 });
  const repository = new CanonicalJsonRepository(root, { audit });
  await repository.initialize();
  const baselineStore = new ImmutableBaselineStore(root);
  const authorization = new AuthorizationPolicyEvaluator();
  const serviceOptions = { audit, authorization, baselineStore, repository };
  const services = createHistoryBaselineServices(serviceOptions);
  const dispatcher = new ApplicationDispatcher({ audit, authorization, clock: { now: () => "2026-09-13T12:00:00.000Z" }, services });
  return { audit, baselineStore, dispatcher, repository, root, services };
}

function seedReady({ business, software }, allocation) {
  const common = { acceptanceCriteria: [{ id: "AC-1", text: "The result is observable.", verificationMethod: "test" }], category: "functional", owner: "team", priority: "high", rationale: "Approved product need.", sourceReferences: [{ type: "policy", uri: "urn:policy:1" }], status: "approved", version: 1 };
  business.requirements.push({ ...common, id: allocation.allocateRequirementId("business"), level: "business", statement: "The product shall preserve settings." });
  software.requirements.push({ ...common, id: allocation.allocateRequirementId("software"), level: "software", statement: "The service shall persist settings.", verificationMethods: ["test"] });
  software.relationships.push({ id: allocation.allocateRelationshipId(), rationale: "Derived obligation.", source: { id: "SR-000001", kind: "requirement", version: 1 }, suspect: false, target: { id: "BR-000001", kind: "requirement", version: 1 }, type: "derives_from", version: 1 });
  business.relationships.push({ id: allocation.allocateRelationshipId(), rationale: "Business verification.", source: { id: "BR-000001", kind: "requirement", version: 1 }, suspect: false, target: { id: "TEST-BR", kind: "external:test" }, type: "verified_by", version: 1 });
  software.relationships.push({ id: allocation.allocateRelationshipId(), rationale: "Software verification.", source: { id: "SR-000001", kind: "requirement", version: 1 }, suspect: false, target: { id: "TEST-SR", kind: "external:test" }, type: "verified_by", version: 1 });
  business.qualityControl = { evidence: [], nextEvidenceNumber: 1, nextFindingNumber: 1, nextPlanNumber: 2, nextReviewNumber: 1, reviews: [], schemaVersion: "1.0.0", verificationPlans: [{ acceptanceCriteria: [{ conditions: "Configured system", measurementMethod: "observe result", parameter: "settings persistence", threshold: "settings remain available" }], configuration: "test", createdAt: "2026-09-13T12:00:00.000Z", createdBy: "seed", id: "VP-000001", methods: ["test"], owner: "team", procedure: { id: "TEST-SR", version: "1" }, requirementId: "SR-000001", requirementVersion: 1, status: "planned", updatedAt: "2026-09-13T12:00:00.000Z", version: 1 }] };
}

test("mixed transactions reconstruct exact item and relationship versions with attributable field changes", async () => {
  const { repository } = await harness();
  await repository.execute(seedReady, { actor: "agent:a", provenance: { command: "seed", correlationId: "corr-1", principalId: "human:a", reason: "initial", role: "requirements-manager" } });
  await repository.execute(({ business }) => { const item = business.requirements[0]; item.owner = "team-b"; item.version += 1; }, { actor: "agent:b", provenance: { command: "update", correlationId: "corr-2", principalId: "human:b", reason: "transfer", role: "requirements-manager" } });
  await repository.execute(({ software }) => { const link = software.relationships[0]; link.retirement = { rationale: "No longer derives.", retiredAt: "2026-09-13T12:00:00.000Z", retiredBy: "agent:b" }; link.version += 1; }, { actor: "agent:b" });
  assert.equal((await repository.readVersion("BR-000001", 1)).record.owner, "team");
  assert.equal((await repository.readVersion("BR-000001", 2)).record.owner, "team-b");
  assert.equal((await repository.readVersion("RL-000001", 2)).record.retirement.rationale, "No longer derives.");
  const history = await repository.history("BR-000001");
  assert.deepEqual(history.map(({ version }) => version), [1, 2]);
  assert.equal(history[1].provenance.principalId, "human:b");
  assert.ok(history[1].changes.some(({ path }) => path === "/owner"));
});

test("audit verification crosses rotation boundaries and detects modification", async () => {
  const { audit, root } = await harness({ segmentSize: 2 });
  for (let index = 0; index < 5; index += 1) await audit.append({ event: "attempt", operation: "test", timestamp: "2026-09-13T12:00:00.000Z" });
  assert.deepEqual(await audit.verify(), { algorithm: "sha256", eventCount: 5, healthy: true, segmentCount: 3, tailHash: (await audit.list({ limit: 10 })).events.at(-1).eventHash });
  const path = join(root, ".engine", "audit", "events", "000000000003.json");
  const event = JSON.parse(await readFile(path, "utf8"));
  event.operation = "tampered";
  await chmod(path, 0o600);
  await writeFile(path, `${JSON.stringify(event, null, 2)}\n`);
  await assert.rejects(audit.verify(), (error) => error.code === "INTEGRITY_FAILURE");
});

test("audit verification detects deletion and reordering, including tail deletion", async () => {
  for (const mode of ["delete", "reorder"]) {
    const root = await mkdtemp(join(tmpdir(), `speccaster-audit-${mode}-`));
    const audit = new TamperEvidentAuditLog(root, { segmentSize: 2 });
    for (let index = 0; index < 4; index += 1) await audit.append({ event: "attempt", operation: `${mode}-${index}` });
    const directory = join(root, ".engine", "audit", "events");
    if (mode === "delete") await unlink(join(directory, "000000000004.json"));
    else {
      const first = join(directory, "000000000001.json"); const second = join(directory, "000000000002.json"); const temporary = join(directory, "swap.tmp");
      await rename(first, temporary); await rename(second, first); await rename(temporary, second);
    }
    await assert.rejects(audit.verify(), (error) => error.code === "INTEGRITY_FAILURE");
  }
});

test("readiness reports governed blocker categories and accepts attributable expiring exceptions", async () => {
  const { repository } = await harness();
  await repository.execute(seedReady, { actor: "seed" });
  const documents = await repository.read();
  const policy = await repository.getPolicy();
  const item = documents.business.requirements[0];
  item.status = "proposed";
  delete item.owner;
  item.statement += " TBD";
  documents.business.relationships = [];
  documents.software.relationships = documents.software.relationships.filter(({ type }) => type === "derives_from");
  documents.software.relationships[0].suspect = true;
  documents.software.relationships.push({ id: "RL-999999", source: { id: "SR-000001", kind: "requirement" }, suspect: false, target: { id: "BR-000001", kind: "requirement" }, type: "conflicts_with", version: 1 });
  documents.business.changeControl = { baselineMemberships: [], changes: [{ affectedRequirementIds: ["BR-000001"], id: "CH-000001", proposedChanges: [], status: "analyzed" }], nextChangeNumber: 2, nextOutboxNumber: 1, outbox: [], schemaVersion: "1.0.0" };
  documents.business.qualityControl.verificationPlans = [];
  const context = { identity: manager, now: "2026-09-13T12:00:00.000Z" };
  const checked = readiness(documents, policy, { requirementIds: ["BR-000001", "SR-000001"] }, context);
  for (const code of ["STATUS_NOT_ALLOWED", "MISSING_OWNER", "UNRESOLVED_TBD", "MISSING_COVERAGE", "SUSPECT_LINK", "BLOCKING_CONFLICT", "OPEN_CHANGE_REQUEST", "MISSING_VERIFICATION_PLAN"]) assert.ok(checked.blockers.some((entry) => entry.code === code), code);
  const excepted = readiness(documents, policy, { requirementIds: ["BR-000001", "SR-000001"], exceptions: [{ authority: "human:manager", code: "STATUS_NOT_ALLOWED", expiresAt: "2026-10-01T00:00:00.000Z", rationale: "Approved temporary lifecycle exception.", requirementId: "BR-000001" }] }, context);
  assert.ok(!excepted.blockers.some((entry) => entry.code === "STATUS_NOT_ALLOWED" && entry.requirementId === "BR-000001"));
  assert.equal(excepted.exceptions.length, 1);
});

test("readiness pins an immutable baseline and comparison reports later current edits", async () => {
  const { baselineStore, dispatcher, repository } = await harness();
  await repository.execute(seedReady, { actor: "seed" });
  const readiness = await dispatcher.execute("baselines.checkReadiness", { correlationId: "ready", requirementIds: ["BR-000001", "SR-000001"], schemaVersion: "1.0.0" }, manager, { validateRequest: true });
  assert.equal(readiness.data.ready, true);
  const created = await dispatcher.execute("baselines.create", { approvalReferences: [{ id: "approval-1", type: "review" }], correlationId: "baseline", expectedRepositoryRevision: 1, idempotencyKey: "baseline-key-1", name: "Release 1", purpose: "Release milestone", readinessToken: readiness.data.readinessToken, requirementIds: ["BR-000001", "SR-000001"], schemaVersion: "1.0.0" }, manager, { validateRequest: true });
  const id = created.data.manifest.baselineId;
  await repository.execute(({ business }) => { business.requirements[0].owner = "new-team"; business.requirements[0].version += 1; });
  assert.equal((await baselineStore.get(id)).documents.business.requirements[0].owner, "team");
  const compared = await dispatcher.execute("requirements.compare", { correlationId: "compare", left: `baseline:${id}`, right: "current", schemaVersion: "1.0.0" }, manager, { validateRequest: true });
  assert.ok(compared.data.items.some(({ id: itemId, fields }) => itemId === "BR-000001" && fields.some(({ path }) => path === "/owner")));
  const manifestPath = join((await baselineStore.get(id)).manifest.baselineId === id ? repository.root : "", ".engine", "baselines", id, "manifest.json");
  await assert.rejects(writeFile(manifestPath, "{}\n"), (error) => error.code === "EACCES");
});

test("backup verification and isolated restore reproduce governed checksums and rebuild indexes", async () => {
  const { repository, root } = await harness();
  await repository.execute(seedReady, { actor: "seed" });
  const backup = `${root}-backup`;
  const restored = `${root}-restored`;
  const created = await new RepositoryBackupManager({ repository }).create(backup, { now: "2026-09-13T12:00:00.000Z" });
  assert.equal(created.manifest.repositoryRevision, 1);
  const result = await RepositoryBackupManager.restoreIsolated(backup, restored);
  assert.deepEqual(result.validation.checksums, created.manifest.canonicalChecksums);
  assert.equal(result.rebuilt.requirements, 2);
  assert.equal(result.audit.healthy, true);
});
