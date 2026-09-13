import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AuthorizationPolicyEvaluator } from "../../src/application/authorization.js";
import { GetRequirementService, ListRequirementsService, SearchRequirementsService } from "../../src/application/services/reads.js";
import { PersistentSearchIndex } from "../../src/adapters/repository/search-index.js";
import { EmbeddedSearchIndex } from "../../src/index/search-index.js";

function requirement(id, statement, options = {}) {
  return {
    category: options.category ?? "functional",
    customAttributes: options.customAttributes,
    id,
    level: id.startsWith("BR") ? "business" : "software",
    priority: options.priority,
    provenance: { updatedAt: options.updatedAt ?? "2026-01-01T00:00:00.000Z" },
    sourceReferences: options.sourceReferences,
    statement,
    status: options.status ?? "draft",
    verificationMethods: options.verificationMethods,
    version: options.version ?? 1,
    ...(options.retired ? { retirement: { rationale: "obsolete", retiredAt: "2026-01-02T00:00:00.000Z", retiredBy: "manager" } } : {}),
  };
}

function documents(revision = 7) {
  return {
    business: {
      documentType: "business",
      relationships: [],
      repositoryRevision: revision,
      requirements: [
        requirement("BR-000001", "The product shall preserve settings after restart.", { priority: "high", sourceReferences: [{ title: "Interview", type: "document", uri: "urn:private:1" }] }),
        requirement("BR-000002", "Retired setting behavior.", { retired: true, status: "retired" }),
      ],
      schemaVersion: "1.0.0",
    },
    software: {
      documentType: "software",
      relationships: [{ id: "RL-000001", source: { id: "SR-000001", kind: "requirement" }, suspect: true, target: { id: "BR-000001", kind: "requirement" }, type: "derives_from", version: 1 }],
      repositoryRevision: revision,
      requirements: [
        requirement("SR-000001", "The settings service shall durably persist settings before acknowledgement.", { customAttributes: { "confidential.hazard": "SECRET", allocation: "component-a", release: "R4", tags: ["storage"] }, priority: "critical", verificationMethods: ["test"] }),
        requirement("SR-000002", "The display service shall render settings.", { priority: "low" }),
        requirement("SR-000003", "The settings service shall persist a local cache.", { priority: "medium" }),
      ],
      schemaVersion: "1.0.0",
    },
  };
}

const identity = (role = "tester", authorization) => ({
  agentId: `agent:${role}`,
  authentication: { issuer: "test" },
  principal: { id: "human:owner" },
  role,
  ...(authorization ? { authorization } : {}),
});

function harness(options = {}) {
  let state = documents();
  const repository = { read: async () => structuredClone(state) };
  const authorization = new AuthorizationPolicyEvaluator({ policyVersion: "17", repositoryId: "repo-1" });
  const common = {
    authorization,
    cursorSecret: "test-only-secret",
    policy: { configurationVersion: "4", limits: { searchDefault: 2, searchMaximum: 3, timeoutMilliseconds: 10_000 } },
    repository,
    searchIndex: options.searchIndex ?? new EmbeddedSearchIndex(),
    ...options,
  };
  return {
    authorization,
    context: (caller = identity()) => ({ authorization, identity: caller, now: "2026-01-01T00:00:00.000Z" }),
    get: new GetRequirementService(common),
    list: new ListRequirementsService(common),
    search: new SearchRequirementsService(common),
    setRevision(revision) { state = documents(revision); },
  };
}

const request = (extra = {}) => ({ correlationId: "corr-read", schemaVersion: "1.0.0", ...extra });

test("exact get never falls back to malformed, title-bearing, or fuzzy identifiers", async () => {
  const app = harness();
  await assert.rejects(app.get.execute(request({ id: "SR-000001 Settings" }), app.context()), { code: "INVALID_ARGUMENT" });
  await assert.rejects(app.get.execute(request({ id: "sr-000001" }), app.context()), { code: "INVALID_ARGUMENT" });
  await assert.rejects(app.get.execute(request({ id: "SR-00001" }), app.context()), { code: "INVALID_ARGUMENT" });
  const found = await app.get.execute(request({ id: "SR-000001", relationships: "counts" }), app.context());
  assert.equal(found.data.id, "SR-000001");
  assert.deepEqual(found.data.relationshipCounts, { derives_from: 1 });
  assert.match(found.data.etag, /^"[a-f0-9]{64}"$/u);
});

test("retired records are hidden unless explicitly requested", async () => {
  const app = harness();
  await assert.rejects(app.get.execute(request({ id: "BR-000002" }), app.context()), { code: "NOT_FOUND" });
  const result = await app.get.execute(request({ id: "BR-000002", includeRetired: true }), app.context());
  assert.equal(result.data.status, "retired");
});

test("named baselines and exact item versions retain explicit source metadata", async () => {
  const baseline = documents(3);
  baseline.software.requirements[0].statement = "Baselined statement.";
  const snapshotProvider = {
    readBaseline: async (id) => id === "release-1" ? baseline : null,
    readVersion: async (id, version) => id === "SR-000001" && version === 9
      ? { ...baseline.software.requirements[0], statement: "Historic statement.", version: 9 }
      : null,
  };
  const app = harness({ snapshotProvider });
  const baselineResult = await app.get.execute(request({ baselineId: "release-1", id: "SR-000001" }), app.context());
  assert.equal(baselineResult.data.statement, "Baselined statement.");
  assert.deepEqual(baselineResult.source, { baselineId: "release-1", kind: "baseline", repositoryRevision: 3 });
  const versionResult = await app.get.execute(request({ id: "SR-000001", version: 9 }), app.context());
  assert.equal(versionResult.data.statement, "Historic statement.");
  assert.equal(versionResult.source.kind, "version");
  assert.equal(versionResult.source.itemVersion, 9);
});

test("component-scoped callers receive indistinguishable not-found behavior", async () => {
  const app = harness();
  const scoped = identity("tester", { components: ["component-b"] });
  await assert.rejects(app.get.execute(request({ id: "SR-000001" }), app.context(scoped)), { code: "NOT_FOUND" });
  const listed = await app.list.execute(request({ sort: { direction: "asc", field: "id" } }), app.context(scoped));
  assert.equal(listed.page.returnedCount, 0);
  assert.equal(listed.data.indexStatus, "authorization-scan");
});

test("field scopes partition cached results and suppress unauthorized searchable fields", async () => {
  const app = harness();
  const wide = await app.get.execute(request({ id: "SR-000001", preset: "full", includeRetired: true }), app.context());
  assert.equal(wide.data.customAttributes["confidential.hazard"], undefined);
  const narrowIdentity = identity("tester", { fields: ["status"] });
  const narrow = await app.get.execute(request({ id: "SR-000001", preset: "full", includeRetired: true }), app.context(narrowIdentity));
  assert.deepEqual(Object.keys(narrow.data).sort(), ["etag", "id", "status"]);
  const hiddenMatch = await app.search.execute(request({ query: "durably", projection: ["status"] }), app.context(narrowIdentity));
  assert.equal(hiddenMatch.page.returnedCount, 0);
});

test("search combines relevance, exact phrases, filters, predicates, and compact snippets", async () => {
  const app = harness();
  const result = await app.search.execute(request({
    filters: { hasSuspectLinks: true, priority: ["critical"], verificationMethod: ["test"] },
    query: '"durably persist" settings',
  }), app.context());
  assert.equal(result.data.items[0].id, "SR-000001");
  assert.deepEqual(result.data.items[0].matchedFields, ["statement"]);
  assert.ok(result.data.items[0].snippets.statement.length < 241);
  assert.deepEqual(result.data.appliedFilters, { hasSuspectLinks: true, priority: ["critical"], verificationMethod: ["test"] });
});

test("structured filters compose with AND semantics across representative combinations", async () => {
  const filters = [
    { level: ["software"] },
    { status: ["draft"] },
    { priority: ["critical"] },
    { verificationMethod: ["test"] },
    { hasSuspectLinks: true },
    { missingSource: false },
  ];
  for (let left = 0; left < filters.length; left += 1) {
    for (let right = left + 1; right < filters.length; right += 1) {
      const app = harness();
      const combined = { ...filters[left], ...filters[right] };
      const result = await app.search.execute(request({ filters: combined, query: "durably" }), app.context());
      assert.deepEqual(result.data.items.map(({ id }) => id), ["SR-000001"], stableJsonForTest(combined));
    }
  }
});

function stableJsonForTest(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

test("list pagination is stable and stale cursors are rejected after a revision change", async () => {
  const app = harness();
  const first = await app.list.execute(request({ limit: 2, sort: { direction: "asc", field: "id" } }), app.context());
  assert.deepEqual(first.data.items.map(({ id }) => id), ["BR-000001", "SR-000001"]);
  assert.equal(first.page.truncated, true);
  const second = await app.list.execute(request({ cursor: first.page.nextCursor, limit: 2, sort: { direction: "asc", field: "id" } }), app.context());
  assert.deepEqual(second.data.items.map(({ id }) => id), ["SR-000002", "SR-000003"]);
  await assert.rejects(app.list.execute(request({ cursor: first.page.nextCursor, limit: 2, sort: { direction: "asc", field: "id" } }), app.context(identity("tester", { fields: ["status"] }))), /Cursor is stale/u);
  app.setRevision(8);
  await assert.rejects(app.list.execute(request({ cursor: first.page.nextCursor, limit: 2, sort: { direction: "asc", field: "id" } }), app.context()), /Cursor is stale/u);
});

test("a stale or failed index falls back to bounded canonical scanning", async () => {
  const broken = { health: async () => ({ repositoryRevision: 7, stale: false }), markStale() {}, query: async () => { throw new Error("corrupt"); } };
  const app = harness({ searchIndex: broken });
  const result = await app.search.execute(request({ query: "display" }), app.context());
  assert.equal(result.data.indexStatus, "canonical-fallback");
  assert.equal(result.data.items[0].id, "SR-000002");
});

test("query, projection, response, and cursor abuse is bounded", async () => {
  const app = harness({ responseSizeMaximum: 32 });
  await assert.rejects(app.search.execute(request({ query: "x".repeat(1001) }), app.context()), { code: "INVALID_ARGUMENT" });
  await assert.rejects(app.search.execute(request({ query: '"unclosed' }), app.context()), { code: "INVALID_ARGUMENT" });
  await assert.rejects(app.search.execute(request({ cursor: "forged.cursor" }), app.context()), { code: "INVALID_ARGUMENT" });
  await assert.rejects(app.search.execute(request({ query: "settings", projection: ["statement"] }), app.context()), /response-size ceiling/u);

  const projectionApp = harness({ policy: { configurationVersion: "4", limits: { searchDefault: 20, searchMaximum: 100, timeoutMilliseconds: 10_000 } } });
  await assert.rejects(projectionApp.search.execute(request({ limit: 20, preset: "full" }), projectionApp.context()), /Projection is too large/u);

  const literalApp = harness();
  const regexLiteral = await literalApp.search.execute(request({ query: ".*(a+)+$" }), literalApp.context());
  assert.ok(regexLiteral.page.returnedCount <= 2);

  const timeoutIndex = { health: async () => ({ repositoryRevision: 7, stale: false }), query: async () => { throw new Error("Search timeout exceeded"); } };
  const timeoutApp = harness({ searchIndex: timeoutIndex });
  await assert.rejects(timeoutApp.search.execute(request({ query: "settings" }), timeoutApp.context()), /bounded execution time/u);
});

test("one-hop relationship summaries obey the configured graph-node ceiling", async () => {
  const state = documents();
  state.software.relationships.push({ id: "RL-000002", source: { id: "SR-000001", kind: "requirement" }, suspect: false, target: { id: "SR-000002", kind: "requirement" }, type: "supersedes", version: 1 });
  const authorization = new AuthorizationPolicyEvaluator();
  const get = new GetRequirementService({ authorization, policy: { limits: { graphNodeMaximum: 1 } }, repository: { read: async () => state } });
  const result = await get.execute(request({ id: "SR-000001", relationships: "summary" }), { authorization, identity: identity(), now: "2026-01-01T00:00:00.000Z" });
  assert.equal(result.data.relationships.length, 1);
  assert.equal(result.data.relationshipsTruncated, true);
});

test("the persistent index detects corruption and rebuilds entirely from canonical documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "spec-speaker-index-"));
  const index = new PersistentSearchIndex(root);
  await index.rebuild(documents());
  assert.deepEqual((await index.query({ query: "display" })).map(({ entry }) => entry.id), ["SR-000002"]);
  await writeFile(join(root, ".engine", "indexes", "repository.json"), "not json\n");
  const corrupted = await new PersistentSearchIndex(root).load();
  assert.equal((await corrupted.health()).stale, true);
  await corrupted.rebuild(documents());
  assert.equal((await corrupted.health()).stale, false);
});
