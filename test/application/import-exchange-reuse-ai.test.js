import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CanonicalJsonRepository } from "../../src/adapters/repository/index.js";
import { createAuthoringServices } from "../../src/application/services/authoring.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";
import { createImportExchangeServices, ImportPreviewStore, IntegrationContractRegistry } from "../../src/application/services/import-exchange.js";
import { createReuseAiGovernanceServices, ReusePreviewStore } from "../../src/application/services/reuse-ai-governance.js";
import { evaluateVerification } from "../../src/application/services/reviews-verification-reporting.js";
import { createTraceabilityServices } from "../../src/application/services/traceability.js";

const manager = { agentId: "agent:manager", authentication: { issuer: "test" }, principal: { id: "human:manager" }, role: "requirements-manager" };
const automatedManager = { ...manager, agentId: "agent:ai", principal: { id: "service:ai" } };
const reviewer = { ...manager, agentId: "agent:reviewer", role: "reviewer" };

function envelope(correlationId, idempotencyKey, expectedRepositoryRevision) {
  return { schemaVersion: "1.0.0", correlationId, idempotencyKey, expectedRepositoryRevision };
}

function draft(statement = "The product shall retain governed records for 30 days.") {
  return { category: "functional", level: "business", owner: "team:records", priority: "high", rationale: "Records policy requires retention.", statement };
}

async function harness(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "speccaster-stage8-"));
  const repository = new CanonicalJsonRepository(root);
  await repository.initialize();
  const shared = {
    aiPolicy: options.aiPolicy, importPreviewStore: options.importPreviewStore ?? new ImportPreviewStore(), repository,
    reusePreviewStore: options.reusePreviewStore ?? new ReusePreviewStore(),
  };
  const services = { ...createAuthoringServices(shared), ...createTraceabilityServices(shared), ...createImportExchangeServices(shared), ...createReuseAiGovernanceServices(shared) };
  const dispatcher = new ApplicationDispatcher({ clock: options.clock ?? { now: () => "2026-09-13T12:00:00.000Z" }, services });
  return { dispatcher, repository, root };
}

test("JSON import previews exact reconciliation, preserves canonical IDs, aliases foreign IDs, and commits idempotently", async () => {
  const { dispatcher, repository } = await harness();
  const content = JSON.stringify({
    schemaVersion: "vendor-2", requirements: [
      { id: "BR-000010", level: "business", statement: "The product shall retain records for 30 days.", category: "functional", owner: "team:records", priority: "high", rationale: "Policy." },
      { id: "VENDOR-SR-7", type: "software", text: "The archive service shall encrypt retained records.", category: "quality", owner: "team:archive", priority: "high", rationale: "Security policy.", verification_methods: ["test"] },
    ], relationships: [{ id: "RL-000009", type: "depends_on", sourceId: "BR-000010", targetId: "VENDOR-SR-7" }],
  });
  const previewRequest = { ...envelope("import-preview", "import-preview-001", 0), content, format: "json", mappingVersion: "1.0.0" };
  const preview = await dispatcher.execute("imports.preview", previewRequest, manager, { validateRequest: true });
  assert.equal(await repository.revision(), 0);
  assert.equal(preview.data.valid, true);
  assert.equal(preview.data.counts.created, 3);
  assert.equal(preview.data.items[0].idOutcome, "preserved");
  assert.equal(preview.data.items[1].idOutcome, "allocated");
  assert.match(preview.data.diffHash, /^[a-f0-9]{64}$/u);
  const commitRequest = { ...envelope("import-commit", "import-commit-001", 0), diffHash: preview.data.diffHash, previewToken: preview.data.previewToken };
  const committed = await dispatcher.execute("imports.commit", commitRequest, manager, { validateRequest: true });
  assert.equal(committed.repositoryRevision, 1);
  const documents = await repository.read();
  assert.equal(documents.business.requirements[0].id, "BR-000010");
  assert.equal(documents.software.requirements[0].sourceReferences[0].title, "VENDOR-SR-7");
  assert.equal(documents.business.relationships[0].id, "RL-000009");
  const replay = await dispatcher.execute("imports.commit", { ...commitRequest, correlationId: "import-replay" }, manager, { validateRequest: true });
  assert.equal(replay.data.replayed, true);
  assert.equal(await repository.revision(), 1);
});

test("invalid, duplicate, conflicting, stale, or tampered imports never partially commit", async () => {
  const importPreviewStore = new ImportPreviewStore({ ttlMilliseconds: 1000 });
  let now = "2026-09-13T12:00:00.000Z";
  const { dispatcher, repository } = await harness({ clock: { now: () => now }, importPreviewStore });
  await dispatcher.execute("requirements.create", { ...envelope("seed", "seed-create-001", 0), draft: draft() }, manager, { validateRequest: true });
  const content = JSON.stringify({ requirements: [
    { id: "BR-000001", version: 9, ...draft("The product shall retain records for 90 days.") },
    { id: "DUP-1", ...draft("The product shall archive governed records.") },
    { id: "DUP-1", ...draft("The product shall archive duplicate records.") },
    { level: "software", category: "functional" },
  ] });
  const preview = await dispatcher.execute("imports.preview", { ...envelope("bad-preview", "bad-preview-001", 1), content, format: "json", mappingVersion: "1.0.0" }, manager, { validateRequest: true });
  assert.equal(preview.data.valid, false);
  assert.equal(preview.data.counts.conflicted, 1);
  assert.equal(preview.data.counts.duplicate, 1);
  assert.equal(preview.data.counts.incomplete, 1);
  await assert.rejects(dispatcher.execute("imports.commit", { ...envelope("bad-commit", "bad-commit-001", 1), diffHash: preview.data.diffHash, previewToken: preview.data.previewToken }, manager, { validateRequest: true }), (error) => error.code === "INVALID_ARGUMENT");
  await assert.rejects(dispatcher.execute("imports.commit", { ...envelope("tamper", "tamper-commit-01", 1), diffHash: "0".repeat(64), previewToken: preview.data.previewToken }, manager, { validateRequest: true }), (error) => error.code === "INVALID_ARGUMENT");
  now = "2026-09-13T12:00:02.000Z";
  await assert.rejects(dispatcher.execute("imports.commit", { ...envelope("expired", "expired-commit-1", 1), diffHash: preview.data.diffHash, previewToken: preview.data.previewToken }, manager, { validateRequest: true }), (error) => error.code === "PREVIEW_EXPIRED");
  assert.equal(await repository.revision(), 1);
  assert.equal((await repository.read()).business.requirements.length, 1);
});

test("CSV and ReqIF mapping fixtures report transformations and format-specific losses", async () => {
  const { dispatcher } = await harness();
  const csv = "source_id,type,text,category,owner,priority,rationale\r\nCSV-7,business,The product shall archive records.,functional,team:archive,high,Records policy.";
  const csvPreview = await dispatcher.execute("imports.preview", { ...envelope("csv-preview", "csv-preview-001", 0), content: csv, format: "csv", mappingVersion: "1.0.0" }, manager, { validateRequest: true });
  assert.equal(csvPreview.data.valid, true);
  assert.equal(csvPreview.data.counts.transformed, 1);
  assert.ok(csvPreview.data.losses.some(({ feature }) => feature === "relationships"));
  const reqif = '<REQ-IF VERSION="1.2"><SPEC-OBJECT IDENTIFIER="BR-000020" LONG-NAME="Retention" LEVEL="business" CATEGORY="functional" OWNER="team:records" PRIORITY="high" RATIONALE="Records policy."><THE-VALUE>The product shall retain records for 30 days.</THE-VALUE></SPEC-OBJECT></REQ-IF>';
  const reqifPreview = await dispatcher.execute("imports.preview", { ...envelope("reqif-preview", "reqif-preview-1", 0), content: reqif, format: "reqif", mappingVersion: "1.0.0" }, manager, { validateRequest: true });
  assert.equal(reqifPreview.data.valid, true);
  assert.equal(reqifPreview.data.source.version, "1.2");
  assert.ok(reqifPreview.data.losses.some(({ feature }) => feature === "attachments"));
});

test("committed imports remain durably replayable after the preview token expires", async () => {
  let now = "2026-09-13T12:00:00.000Z";
  const { dispatcher, repository } = await harness({ clock: { now: () => now }, importPreviewStore: new ImportPreviewStore({ ttlMilliseconds: 1000 }) });
  const content = JSON.stringify([{ ...draft(), id: "BR-000001" }]);
  const preview = await dispatcher.execute("imports.preview", { ...envelope("durable-preview", "durable-preview-1", 0), content, format: "json", mappingVersion: "1.0.0" }, manager, { validateRequest: true });
  const commit = { ...envelope("durable-commit", "durable-commit-01", 0), diffHash: preview.data.diffHash, previewToken: preview.data.previewToken };
  await dispatcher.execute("imports.commit", commit, manager, { validateRequest: true });
  now = "2026-09-13T12:00:02.000Z";
  const replay = await dispatcher.execute("imports.commit", { ...commit, correlationId: "durable-replay" }, manager, { validateRequest: true });
  assert.equal(replay.data.replayed, true);
  assert.equal(await repository.revision(), 1);
});

test("JSON export identifies its governed source and reconstructs supported content on re-import", async () => {
  const first = await harness();
  await first.dispatcher.execute("requirements.create", { ...envelope("seed", "export-seed-001", 0), draft: { ...draft(), sourceReferences: [{ type: "policy", uri: "urn:policy:records" }] } }, manager, { validateRequest: true });
  await first.dispatcher.execute("requirements.create", { ...envelope("seed-two", "export-seed-002", 1), draft: draft("The product shall archive governed records.") }, manager, { validateRequest: true });
  await first.dispatcher.execute("requirements.link", { ...envelope("link", "export-link-001", 2), rationale: "Retention depends on the archive.", relationshipType: "depends_on", sourceExpectedVersion: 1, sourceId: "BR-000001", targetExpectedVersion: 1, targetId: "BR-000002" }, manager, { validateRequest: true });
  const exported = await first.dispatcher.execute("exports.generate", { correlationId: "export", format: "json", schemaVersion: "1.0.0" }, reviewer, { validateRequest: true });
  assert.equal(exported.data.source.repositoryRevision, 3);
  assert.equal(exported.data.losses.length, 0);
  const second = await harness();
  const preview = await second.dispatcher.execute("imports.preview", { ...envelope("roundtrip-preview", "roundtrip-prev-1", 0), content: exported.data.content, format: "json", mappingVersion: "1.0.0" }, manager, { validateRequest: true });
  assert.equal(preview.data.valid, true);
  await second.dispatcher.execute("imports.commit", { ...envelope("roundtrip-commit", "roundtrip-commit", 0), diffHash: preview.data.diffHash, previewToken: preview.data.previewToken }, manager, { validateRequest: true });
  const reconstructed = (await second.repository.read()).business.requirements[0];
  assert.deepEqual({ id: reconstructed.id, statement: reconstructed.statement, status: reconstructed.status, version: reconstructed.version }, { id: "BR-000001", statement: draft().statement, status: "proposed", version: 1 });
  assert.deepEqual(reconstructed.sourceReferences, [{ type: "policy", uri: "urn:policy:records" }]);
  assert.equal((await second.repository.read()).business.relationships[0].type, "depends_on");
});

test("field-scoped exports redact confidential requirement fields", async () => {
  const { dispatcher } = await harness();
  await dispatcher.execute("requirements.create", { ...envelope("seed", "scoped-seed-001", 0), draft: draft() }, manager, { validateRequest: true });
  const scoped = { ...reviewer, authorization: { fields: ["status"] } };
  const exported = await dispatcher.execute("exports.generate", { correlationId: "scoped-export", format: "json", schemaVersion: "1.0.0" }, scoped, { validateRequest: true });
  const record = JSON.parse(exported.data.content).requirements[0];
  assert.deepEqual(record, { id: "BR-000001", status: "proposed" });
});

test("reuse propagation requires a disposition for every use and preserves intentional divergence", async () => {
  const { dispatcher, repository } = await harness();
  await dispatcher.execute("requirements.create", { ...envelope("source", "reuse-source-01", 0), draft: draft() }, manager, { validateRequest: true });
  const adopted = await dispatcher.execute("reuse.adopt", { ...envelope("adopt", "reuse-adopt-001", 1), applicability: { variant: "medical" }, mode: "controlled-clone", rationale: "Reuse the common retention rule.", sourceExpectedVersion: 1, sourceId: "BR-000001", sourceRepository: "default" }, manager, { validateRequest: true });
  assert.equal(adopted.data.record.reuse.originId, "BR-000001");
  await dispatcher.execute("requirements.update", { ...envelope("source-update", "source-update-01", 2), expectedVersion: 1, id: "BR-000001", patch: { statement: "The product shall retain governed records for 60 days." }, reason: "The policy changed." }, manager, { validateRequest: true });
  await assert.rejects(dispatcher.execute("reuse.previewPropagation", { ...envelope("missing-disposition", "missing-disp-01", 3), dispositions: [], sourceExpectedVersion: 2, sourceId: "BR-000001" }, manager, { validateRequest: true }), (error) => error.code === "INVALID_ARGUMENT");
  const preview = await dispatcher.execute("reuse.previewPropagation", { ...envelope("retain", "retain-preview-1", 3), dispositions: [{ action: "retain-divergence", id: "BR-000002", rationale: "The medical variant remains at 30 days." }], sourceExpectedVersion: 2, sourceId: "BR-000001" }, manager, { validateRequest: true });
  await dispatcher.execute("reuse.commitPropagation", { ...envelope("retain-commit", "retain-commit-01", 3), diffHash: preview.data.diffHash, previewToken: preview.data.previewToken }, manager, { validateRequest: true });
  const clone = (await repository.read()).business.requirements.find(({ id }) => id === "BR-000002");
  assert.equal(clone.statement, draft().statement);
  assert.equal(clone.reuse.synchronizationState, "intentional-divergence");
  assert.equal(clone.reuse.divergenceRationale, "The medical variant remains at 30 days.");
});

test("AI content remains a proposal, requires human acceptance, preserves provenance, and records later human edits", async () => {
  const { dispatcher, repository } = await harness({ aiPolicy: { allowExternalProcessing: false, protectedFields: ["statement"] } });
  await dispatcher.execute("requirements.create", { ...envelope("source", "ai-source-0001", 0), draft: draft() }, manager, { validateRequest: true });
  const proposalRequest = { ...envelope("ai-proposal", "ai-proposal-001", 1), draft: draft("The product shall retain encrypted records for 30 days."), model: "model-1", processor: "internal", promptTemplateVersion: "requirements-v2", provider: "internal", rationale: "Drafted from the records requirement.", ruleVersion: "quality-v1", runId: "run-1", service: "requirements-assistant", sourceItems: [{ id: "BR-000001", version: 1 }] };
  const proposed = await dispatcher.execute("ai.proposeRequirement", proposalRequest, manager, { validateRequest: true });
  assert.equal(proposed.data.proposal.status, "proposed");
  assert.equal(proposed.data.proposal.provenance.aiAssistance.proposalStatus, "proposed");
  await assert.rejects(dispatcher.execute("ai.acceptProposal", { ...envelope("ai-denied", "ai-denied-0001", 2), expectedVersion: 1, id: "BR-000002", proposedContentHash: proposed.data.proposedContentHash, rationale: "Automated acceptance." }, automatedManager, { validateRequest: true }), (error) => error.code === "FORBIDDEN");
  const accepted = await dispatcher.execute("ai.acceptProposal", { ...envelope("ai-accept", "ai-accept-0001", 2), acceptedPatch: { owner: "team:security" }, expectedVersion: 1, id: "BR-000002", proposedContentHash: proposed.data.proposedContentHash, rationale: "Reviewed against the security policy." }, manager, { validateRequest: true });
  assert.equal(accepted.data.lifecycleStatusChanged, false);
  assert.equal(accepted.data.item.status, "proposed");
  assert.equal(accepted.data.item.provenance.aiAssistance.acceptance.principal, "human:manager");
  await dispatcher.execute("requirements.update", { ...envelope("human-edit", "human-edit-0001", 3), expectedVersion: 2, id: "BR-000002", patch: { shortLabel: "Encrypted record retention" } }, manager, { validateRequest: true });
  const item = (await repository.read()).business.requirements.find(({ id }) => id === "BR-000002");
  assert.deepEqual(item.provenance.aiAssistance.humanEdits[0].fields, ["shortLabel"]);
  await assert.rejects(dispatcher.execute("ai.proposeRequirement", { ...proposalRequest, ...envelope("external", "external-ai-001", 4), processor: "external", protectedFieldsIncluded: true, runId: "run-2" }, manager, { validateRequest: true }), (error) => error.code === "FORBIDDEN");
});

test("integration contracts reject silent two-way last-write-wins", () => {
  const base = { cadence: "event", compatibility: { schema: "1" }, conflictDetection: { compareVersions: true }, conflictResolutionOwner: "team:requirements", deadLetter: { owner: "team:integration" }, fieldOwnership: { statement: "speccaster" }, id: "pilot", identityMapping: { id: "externalId" }, lifecycleSemantics: { delete: "retire" }, orderingReplay: { key: "aggregateId" }, permissions: { classification: "internal" }, reconciliation: { counts: true }, retry: { idempotent: true, ordered: true }, rollback: { strategy: "disable-and-replay" }, version: "1.0.0" };
  assert.throws(() => new IntegrationContractRegistry().register({ ...base, conflictPolicy: "last-write-wins", direction: "two-way" }), /last-write-wins/u);
  assert.equal(new IntegrationContractRegistry([{ ...base, direction: "event-outbox" }]).list().length, 1);
});

test("variant verification coverage is evaluated independently", () => {
  const requirement = { id: "BR-000001", level: "business", version: 1 };
  const evidence = (id, variant, status) => ({ acceptance: { principal: "human:manager" }, id, potentiallyStale: false, requirementVersions: [{ id: requirement.id, version: 1 }], status, variant });
  const documents = { business: { qualityControl: { evidence: [evidence("EV-000001", "variant-a", "failed"), evidence("EV-000002", "variant-b", "passed")], verificationPlans: [] }, relationships: [], requirements: [requirement] }, software: { relationships: [], requirements: [] } };
  assert.equal(evaluateVerification(documents, requirement, { variant: "variant-a" }, { verification: { requireNonSuspectRelationship: false } }).status, "failed");
  assert.equal(evaluateVerification(documents, requirement, { variant: "variant-b" }, { verification: { requireNonSuspectRelationship: false } }).status, "passed");
});
