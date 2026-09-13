import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationPolicyEvaluator } from "../../src/application/authorization.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";
import { createAuthoringServices } from "../../src/application/services/authoring.js";
import { createTraceabilityServices } from "../../src/application/services/traceability.js";
import { assertValidRepositoryDocuments, createEmptyDocument } from "../../src/adapters/repository/validation.js";

const defaultPolicy = JSON.parse(await readFile(new URL("../../config/policy.v1.json", import.meta.url), "utf8"));
const manager = { agentId: "agent:manager", authentication: { issuer: "test" }, principal: { id: "human:manager" }, role: "requirements-manager" };
const tester = { agentId: "agent:tester", authentication: { issuer: "test" }, principal: { id: "human:tester" }, role: "tester" };
const base = (correlationId, idempotencyKey, expectedRepositoryRevision) => ({ correlationId, expectedRepositoryRevision, idempotencyKey, schemaVersion: "1.0.0" });

class MemoryRepository {
  constructor(policy) {
    this.policy = structuredClone(policy);
    this.documents = { business: createEmptyDocument("business"), software: createEmptyDocument("software") };
  }

  async read() { return structuredClone(this.documents); }
  async getPolicy() { return structuredClone(this.policy); }

  async execute(mutator, options = {}) {
    const revision = this.documents.business.repositoryRevision;
    if (options.expectedRepositoryRevision !== undefined && options.expectedRepositoryRevision !== revision) {
      const error = new Error("Expected repository revision does not match current revision");
      error.code = "VERSION_CONFLICT";
      throw error;
    }
    const documents = structuredClone(this.documents);
    const allocation = {
      allocateRelationshipId() {
        const id = `RL-${String(documents.business.nextRelationshipNumber).padStart(6, "0")}`;
        documents.business.nextRelationshipNumber += 1;
        documents.software.nextRelationshipNumber += 1;
        return id;
      },
      allocateRequirementId(level) {
        const prefix = level === "business" ? "BR" : "SR";
        const id = `${prefix}-${String(documents[level].nextRequirementNumber).padStart(6, "0")}`;
        documents[level].nextRequirementNumber += 1;
        return id;
      },
    };
    const result = await mutator(documents, allocation);
    documents.business.repositoryRevision = revision + 1;
    documents.software.repositoryRevision = revision + 1;
    assertValidRepositoryDocuments(documents.business, documents.software, this.policy);
    this.documents = documents;
    return { committed: true, repositoryRevision: revision + 1, result };
  }
}

function draft(level, statement) {
  return {
    category: "functional",
    level,
    owner: "team-a",
    priority: "high",
    rationale: "Needed by the governed product behavior.",
    statement,
    ...(level === "software" ? { verificationMethods: ["test"] } : {}),
  };
}

async function harness(options = {}) {
  const policy = structuredClone(options.policy ?? defaultPolicy);
  const repository = new MemoryRepository(policy);
  const authorization = new AuthorizationPolicyEvaluator();
  const serviceOptions = { authorization, policy, repository, snapshotProvider: options.snapshotProvider };
  const services = { ...createAuthoringServices(serviceOptions), ...createTraceabilityServices(serviceOptions) };
  const dispatcher = new ApplicationDispatcher({ authorization, clock: { now: () => "2026-09-13T12:00:00.000Z" }, services });
  return { dispatcher, repository };
}

async function seedPair(dispatcher) {
  await dispatcher.execute("requirements.create", { ...base("create-br", "create-br-key", 0), draft: draft("business", "The product shall retain user settings.") }, manager, { validateRequest: true });
  await dispatcher.execute("requirements.create", { ...base("create-sr", "create-sr-key", 1), draft: draft("software", "The settings service shall persist user settings.") }, manager, { validateRequest: true });
}

async function linkDerivation(dispatcher, revision = 2) {
  return dispatcher.execute("requirements.link", {
    ...base("link-derive", "link-derive-key", revision),
    rationale: "The software obligation realizes the business source.",
    relationshipType: "derives_from",
    source: { id: "SR-000001", kind: "requirement", version: 1 },
    target: { id: "BR-000001", kind: "requirement", version: 1 },
  }, manager, { validateRequest: true });
}

test("link commands enforce endpoints, versions, duplicates, ownership, and reversible retirement", async () => {
  const { dispatcher, repository } = await harness();
  await seedPair(dispatcher);
  const linked = await linkDerivation(dispatcher);
  assert.equal(linked.data.relationship.status, "valid");
  assert.equal(linked.data.relationship.id, "RL-000001");
  const documents = await repository.read();
  assert.equal(documents.software.relationships.length, 1);
  assert.equal(documents.business.relationships.length, 0);

  await assert.rejects(dispatcher.execute("requirements.link", {
    ...base("link-duplicate", "link-duplicate-key", 3), rationale: "Duplicate derivation.", relationshipType: "derives_from",
    source: { id: "SR-000001", kind: "requirement", version: 1 }, target: { id: "BR-000001", kind: "requirement", version: 1 },
  }, manager, { validateRequest: true }), /equivalent relationship/u);
  await assert.rejects(dispatcher.execute("requirements.link", {
    ...base("link-stale", "link-stale-key", 3), relationshipType: "derives_from", rationale: "Stale endpoint test.",
    source: { id: "SR-000001", kind: "requirement", version: 2 }, target: { id: "BR-000001", kind: "requirement", version: 1 },
  }, manager, { validateRequest: true }), (error) => error.code === "VERSION_CONFLICT");

  const removed = await dispatcher.execute("requirements.unlink", { ...base("unlink", "unlink-key-01", 3), expectedVersion: 1, id: "RL-000001", rationale: "The derivation no longer applies." }, manager, { validateRequest: true });
  assert.equal(removed.data.relationship.version, 2);
  assert.equal(removed.data.relationship.history.at(-1).action, "retired");
  assert.ok((await repository.read()).software.relationships[0].retirement);
});

test("trace walks stored-once links in both directions and reports bounded cycles and truncation", async () => {
  const { dispatcher } = await harness();
  await seedPair(dispatcher);
  await linkDerivation(dispatcher);
  const upstream = await dispatcher.execute("requirements.trace", { correlationId: "trace-up", direction: "upstream", id: "SR-000001", schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.deepEqual(upstream.data.nodes.map(({ id }) => id), ["SR-000001", "BR-000001"]);
  assert.equal(upstream.data.paths[0].relationship.direction, "upstream");
  const downstream = await dispatcher.execute("requirements.trace", { correlationId: "trace-down", direction: "downstream", id: "BR-000001", schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.deepEqual(downstream.data.nodes.map(({ id }) => id), ["BR-000001", "SR-000001"]);
  const truncated = await dispatcher.execute("requirements.trace", { correlationId: "trace-limit", direction: "both", id: "SR-000001", nodeLimit: 1, schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.equal(truncated.data.complete, false);
  assert.equal(truncated.data.truncationReason, "node-limit");
  assert.equal(truncated.data.continuation.required, true);
});

test("self-links, configured cardinality overflow, and directed cycles are rejected", async () => {
  const policy = structuredClone(defaultPolicy);
  policy.relationships.find(({ type }) => type === "decomposes").maxTargets = 1;
  const { dispatcher } = await harness({ policy });
  for (const [index, statement] of ["The product shall expose setting A.", "The product shall expose setting B.", "The product shall expose setting C."].entries()) {
    await dispatcher.execute("requirements.create", { ...base(`create-${index}`, `create-key-${index}`, index), draft: draft("business", statement) }, manager, { validateRequest: true });
  }
  const link = (sourceId, targetId, revision, key) => dispatcher.execute("requirements.link", {
    ...base(key, `${key}-idempotency`, revision), relationshipType: "decomposes", rationale: "Governed decomposition.",
    source: { id: sourceId, kind: "requirement", version: 1 }, target: { id: targetId, kind: "requirement", version: 1 },
  }, manager, { validateRequest: true });
  await assert.rejects(link("BR-000001", "BR-000001", 3, "self-link"), /cannot link an endpoint to itself/u);
  await link("BR-000001", "BR-000002", 3, "first-child");
  await assert.rejects(link("BR-000001", "BR-000003", 4, "second-child"), /cardinality/u);
  await link("BR-000002", "BR-000003", 4, "nested-child");
  await assert.rejects(link("BR-000003", "BR-000001", 5, "cycle-link"), /prohibited cycle/u);
});

test("material changes atomically mark configured relationships suspect and manager reassessment retains trigger history", async () => {
  const { dispatcher, repository } = await harness();
  await seedPair(dispatcher);
  await linkDerivation(dispatcher);
  const updated = await dispatcher.execute("requirements.update", {
    ...base("update-br", "update-br-key", 3), expectedVersion: 1, id: "BR-000001", patch: { statement: "The product shall retain user settings for 30 days." }, reason: "Retention duration changed.",
  }, manager, { validateRequest: true });
  assert.deepEqual(updated.data.suspectRelationships, [{ id: "RL-000001", rule: "target-content-change", version: 2 }]);
  let relationship = (await repository.read()).software.relationships[0];
  assert.equal(relationship.status, "suspect");
  assert.equal(relationship.history.at(-1).triggeringItemVersion, 2);
  assert.deepEqual(relationship.history.at(-1).changedFields, ["statement"]);

  const metadataOnly = await dispatcher.execute("requirements.update", {
    ...base("update-owner", "update-owner-key", 4), expectedVersion: 2, id: "BR-000001", patch: { owner: "team-b" },
  }, manager, { validateRequest: true });
  assert.deepEqual(metadataOnly.data.suspectRelationships, []);

  await assert.rejects(dispatcher.execute("requirements.reassessLink", { ...base("deny-assess", "deny-assess-key", 5), assessment: "valid", expectedVersion: 2, id: "RL-000001", rationale: "Reviewed." }, tester, { validateRequest: true }), (error) => error.code === "FORBIDDEN");
  await dispatcher.execute("requirements.reassessLink", { ...base("assess", "assess-link-key", 5), assessment: "not_affected", expectedVersion: 2, id: "RL-000001", rationale: "The derivation remains correct." }, manager, { validateRequest: true });
  relationship = (await repository.read()).software.relationships[0];
  assert.equal(relationship.status, "valid");
  assert.equal(relationship.version, 3);
  assert.deepEqual(relationship.history.map(({ action }) => action), ["created", "suspect-marked", "reassessed"]);
});

test("coverage, orphan, impact, external metadata, and baseline snapshots expose governed context", async () => {
  const policy = structuredClone(defaultPolicy);
  policy.coverageRules = [{ level: "software", statuses: ["proposed"], requiredRelationshipTypes: ["derives_from", "verified_by"] }];
  let baseline;
  const repository = new MemoryRepository(policy);
  const authorization = new AuthorizationPolicyEvaluator();
  const snapshotProvider = { readBaseline: async (id) => id === "release-1" ? baseline : null };
  const serviceOptions = { authorization, policy, repository, snapshotProvider };
  const dispatcher = new ApplicationDispatcher({ authorization, clock: { now: () => "2026-09-13T12:00:00.000Z" }, services: { ...createAuthoringServices(serviceOptions), ...createTraceabilityServices(serviceOptions) } });
  await seedPair(dispatcher);
  await linkDerivation(dispatcher);
  await dispatcher.execute("requirements.link", {
    ...base("link-test", "link-test-key", 3), relationshipType: "verified_by", rationale: "This test provides planned verification.",
    source: { id: "SR-000001", kind: "requirement", version: 1 },
    target: { artifactType: "test", externalId: "TC-42", kind: "external:test", system: "test-manager", systemOfRecord: "test-manager", uri: "https://tests.example/TC-42" },
  }, manager, { validateRequest: true });
  baseline = await repository.read();

  const coverage = await dispatcher.execute("requirements.coverage", { correlationId: "coverage", level: "software", schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.deepEqual(coverage.data.population, { denominator: 2, evaluated: 2, numerator: 2 });
  assert.equal(coverage.data.configurationVersion, policy.configurationVersion);
  assert.equal(coverage.source.kind, "current");
  const orphans = await dispatcher.execute("requirements.orphans", { correlationId: "orphans", schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.deepEqual(orphans.data.items, []);
  const impact = await dispatcher.execute("requirements.impact", { correlationId: "impact", direction: "both", id: "SR-000001", schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.deepEqual(impact.data.directlyAffected.map(({ id }) => id).sort(), ["BR-000001", "test-manager:test:TC-42"]);
  assert.equal(impact.data.groups.artifactType.test.count, 1);
  const fromExternal = await dispatcher.execute("requirements.trace", {
    correlationId: "trace-external", direction: "upstream", schemaVersion: "1.0.0",
    starts: [{ artifactType: "test", externalId: "TC-42", kind: "external:test", system: "test-manager", systemOfRecord: "test-manager", uri: "https://tests.example/TC-42" }],
  }, tester, { validateRequest: true });
  assert.deepEqual(fromExternal.data.nodes.map(({ id }) => id), ["test-manager:test:TC-42", "SR-000001", "BR-000001"]);

  await dispatcher.execute("requirements.unlink", { ...base("unlink-live", "unlink-live-key", 4), expectedVersion: 1, id: "RL-000001", rationale: "Removed from current state." }, manager, { validateRequest: true });
  const historic = await dispatcher.execute("requirements.trace", { baselineId: "release-1", correlationId: "trace-baseline", direction: "upstream", id: "SR-000001", schemaVersion: "1.0.0" }, tester, { validateRequest: true });
  assert.deepEqual(historic.data.nodes.map(({ id }) => id), ["SR-000001", "BR-000001"]);
  assert.equal(historic.source.repositoryRevision, 4);
});
