import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createHttpAdapter } from "../../src/adapters/http/index.js";
import {
  CanonicalJsonRepository,
  ImmutableBaselineStore,
  PersistentSearchIndex,
} from "../../src/adapters/repository/index.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";
import {
  BoundedExecutionGate,
  EngineHealthService,
  OperationalTelemetry,
  sanitizeOperationalMetadata,
  SupportBundleGenerator,
} from "../../src/operations/index.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("bounded execution enforces FIFO queue limits, cancellation, and deadlines", async () => {
  const gate = new BoundedExecutionGate({ maximumConcurrent: 1, maximumQueue: 1, timeoutMilliseconds: 100 });
  let release;
  const blocker = gate.run("blocker", () => new Promise((resolve) => { release = resolve; }));
  await wait(1);
  const controller = new AbortController();
  const queued = gate.run("queued", async () => "never", { signal: controller.signal });
  await assert.rejects(gate.run("overload", async () => "never"), (error) => error.code === "SERVICE_UNAVAILABLE" && error.retryable);
  controller.abort();
  await assert.rejects(queued, (error) => error.code === "CANCELLED");
  release("done");
  assert.equal(await blocker, "done");
  await assert.rejects(gate.run("timeout", async ({ signal }) => {
    while (!signal.aborted) await wait(2);
  }, { timeoutMilliseconds: 5 }), (error) => error.code === "TIMEOUT" && error.retryable);
  await wait(5);
  assert.deepEqual(gate.health().totals, { cancelled: 1, completed: 1, failed: 0, rejected: 1, timedOut: 1 });
});

test("queued deadlines expire even while all execution slots remain occupied", async () => {
  const gate = new BoundedExecutionGate({ maximumConcurrent: 1, maximumQueue: 1, timeoutMilliseconds: 100 });
  let release;
  const blocker = gate.run("blocker", () => new Promise((resolve) => { release = resolve; }));
  await wait(1);
  const queued = gate.run("queued", async () => "late", { timeoutMilliseconds: 5 });
  await assert.rejects(queued, (error) => error.code === "TIMEOUT");
  assert.equal(gate.health().queueDepth, 0);
  release("done");
  await blocker;
});

test("operational telemetry excludes content, credentials, arbitrary errors, and payload fields", () => {
  const telemetry = new OperationalTelemetry({ clock: { now: () => "2026-09-13T12:00:00.000Z" }, sink: () => { throw new Error("export unavailable"); } });
  const safe = sanitizeOperationalMetadata({
    correlationId: "corr-safe",
    credential: "token-secret",
    message: "requirement body secret",
    operation: "requirements.get",
    payload: { statement: "private statement" },
    repositoryRevision: 4,
    statement: "private statement",
  });
  assert.deepEqual(safe, { correlationId: "corr-safe", operation: "requirements.get", repositoryRevision: 4 });
  telemetry.recordOperation({ ...safe, durationMilliseconds: 12, outcome: "success" });
  telemetry.increment("authorization.denials");
  telemetry.gauge("queue.depth", 2);
  const serialized = JSON.stringify(telemetry.snapshot());
  assert.doesNotMatch(serialized, /secret|private statement|credential|payload|message/u);
  assert.match(serialized, /corr-safe/u);
  assert.equal(telemetry.snapshot().counters["authorization.denials"], 1);
  assert.equal(telemetry.snapshot().gauges["queue.depth"], 2);
});

test("dispatcher records safe operation metrics and transport exposes detailed health", async () => {
  const telemetry = new OperationalTelemetry();
  const gate = new BoundedExecutionGate({ maximumConcurrent: 1, maximumQueue: 1, telemetry });
  const dispatcher = new ApplicationDispatcher({
    clock: { now: () => "2026-09-13T12:00:00.000Z" },
    executionGate: gate,
    services: { GetRequirementService: { execute: async () => ({ correlationId: "corr", data: {}, repositoryRevision: 2, schemaVersion: "1.0.0" }) } },
    telemetry,
  });
  const identity = { agentId: "agent", authentication: { issuer: "test" }, principal: { id: "human" }, role: "tester" };
  const result = await dispatcher.execute("requirements.get", { correlationId: "corr", id: "BR-000001", schemaVersion: "1.0.0" }, identity, { validateRequest: true });
  assert.equal(result.repositoryRevision, 2);
  assert.equal(telemetry.snapshot().operations[0].outcome, "success");
  const adapter = createHttpAdapter(dispatcher, { health: { check: async () => ({ schemaVersion: "1.0.0", status: "healthy" }) } });
  assert.equal((await adapter.health()).status, "healthy");
});

test("health distinguishes repository, index, audit, queue, integration, backup, and storage state", async () => {
  const root = await mkdtemp(join(tmpdir(), "speccaster-health-"));
  const searchIndex = new PersistentSearchIndex(root);
  const repository = new CanonicalJsonRepository(root, { searchIndex });
  await repository.initialize();
  await repository.rebuildDerivedState();
  const health = new EngineHealthService({
    backupStatus: async () => ({ ageSeconds: 10, available: true, healthy: true }),
    baselines: new ImmutableBaselineStore(root),
    executionGate: new BoundedExecutionGate(),
    integrations: { issueTracker: async () => ({ healthy: true, message: "SECRET INTEGRATION DETAIL", token: "SECRET TOKEN" }) },
    repository,
    searchIndex,
  });
  const result = await health.check();
  assert.equal(result.status, "healthy");
  assert.equal(result.checks.repository.repositoryRevision, 0);
  assert.equal(result.checks.index.repositoryRevision, 0);
  assert.equal(result.checks.audit.healthy, true);
  assert.equal(result.checks.queue.queueDepth, 0);
  assert.equal(result.checks.integrations.issueTracker.healthy, true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|message|token/u);
  assert.ok(result.checks.storage.totalBytes > 0);
});

test("support bundles are exclusive, outside the repository, and metadata-only", async () => {
  const root = await mkdtemp(join(tmpdir(), "speccaster-support-"));
  const repository = new CanonicalJsonRepository(root);
  await repository.initialize();
  const health = new EngineHealthService({ repository });
  const telemetry = new OperationalTelemetry();
  telemetry.log("error", "operation.completed", { message: "SECRET REQUIREMENT BODY", operation: "requirements.get", outcome: "error" });
  const bundle = join(tmpdir(), `speccaster-support-${crypto.randomUUID()}.json`);
  const generator = new SupportBundleGenerator({
    clock: { now: () => "2026-09-13T12:00:00.000Z" },
    health,
    releaseVersion: "1.0.0",
    repository,
    telemetry,
  });
  await generator.create(bundle);
  const content = await readFile(bundle, "utf8");
  assert.doesNotMatch(content, /SECRET REQUIREMENT BODY/u);
  assert.doesNotMatch(content, /business-requirements|software-requirements/u);
  assert.equal(JSON.parse(content).release.version, "1.0.0");
  await assert.rejects(generator.create(bundle), (error) => error.code === "EEXIST");
  await assert.rejects(generator.create(join(root, "bundle.json")), /outside the repository/u);
});
