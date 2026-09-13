import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseStrictJson } from "../../src/adapters/repository/canonical-json.js";
import { ApplicationError } from "../../src/application/errors.js";
import { AuthorizationPolicyEvaluator } from "../../src/application/authorization.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";
import { validate } from "../../src/contracts/validator.js";
import { buildSearchIndex, searchIndex } from "../../src/index/search-index.js";

const production = JSON.parse(await readFile(new URL("../../config/production.v1.json", import.meta.url), "utf8"));
const productionSchema = JSON.parse(await readFile(new URL("../../schemas/v1/production.schema.json", import.meta.url), "utf8"));

test("production limits are strict and default telemetry cannot be configured to collect content", () => {
  assert.deepEqual(validate(productionSchema, production), []);
  assert.ok(validate(productionSchema, { ...production, telemetry: { ...production.telemetry, safeMetadataOnly: false } }).length);
  assert.ok(validate(productionSchema, { ...production, admission: { ...production.admission, maximumQueue: 100_000 } }).length);
  assert.ok(validate(productionSchema, { ...production, unknown: true }).length);
});

test("strict JSON and query fuzz corpus terminates with data or a controlled validation error", () => {
  const corpus = [
    "", "null", "[]", "{}", "{\"a\":1,\"a\":2}", "{\"__proto__\":{\"polluted\":true}}",
    "{\"n\":1e999}", "{\"n\":NaN}", "{\"x\":\"\\ud800\"}", "[1,2,]", "{} trailing",
  ];
  let state = 0x1a2b3c4d;
  for (let index = 0; index < 250; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const length = state % 128;
    corpus.push(Array.from({ length }, (_, offset) => String.fromCharCode(32 + ((state >>> (offset % 24)) + offset * 17) % 95)).join(""));
  }
  const started = performance.now();
  for (const input of corpus) {
    try { parseStrictJson(Buffer.from(input), { maximumBytes: 1_024 }); }
    catch (error) { assert.ok(error instanceof Error); assert.ok((error.message?.length ?? 0) <= 1_000); }
  }

  const documents = {
    business: { relationships: [], repositoryRevision: 1, requirements: [{ category: "functional", id: "BR-000001", level: "business", statement: "The system shall remain bounded.", status: "approved", version: 1 }], schemaVersion: "1.0.0" },
    software: { relationships: [], repositoryRevision: 1, requirements: [], schemaVersion: "1.0.0" },
  };
  const index = buildSearchIndex(documents);
  for (const query of corpus) {
    try { searchIndex(index, { deadline: Date.now() + 100, query }); }
    catch (error) { assert.match(error.message, /quote|timeout/u); }
  }
  assert.ok(performance.now() - started < 2_000);
  assert.equal({}.polluted, undefined);
});

test("authorization and expiry changes are evaluated at each action without a stale decision cache", async () => {
  let permissions = ["requirements:read"];
  const evaluator = new AuthorizationPolicyEvaluator({
    policyVersion: "production-1",
    rolePermissions: { implementer: permissions },
  });
  let calls = 0;
  const dispatcher = new ApplicationDispatcher({
    authorization: { ...evaluator, evaluate: (...arguments_) => evaluator.evaluate(...arguments_), canReadItem: (...arguments_) => evaluator.canReadItem(...arguments_), allowedFields: (...arguments_) => evaluator.allowedFields(...arguments_), get policyVersion() { return evaluator.policyVersion; } },
    clock: { now: () => "2026-09-13T12:00:00.000Z" },
    services: { GetRequirementService: { execute: async () => { calls += 1; return { repositoryRevision: 0 }; } } },
  });
  const identity = { agentId: "agent", authentication: { expiresAt: "2026-09-14T00:00:00.000Z", issuer: "test" }, principal: { id: "human" }, role: "implementer" };
  await dispatcher.execute("requirements.get", {}, identity);
  permissions.length = 0;
  evaluator.rolePermissions = { implementer: permissions };
  await assert.rejects(dispatcher.execute("requirements.get", {}, identity), (error) => error.code === "FORBIDDEN");
  assert.equal(calls, 1);
});

test("safe error envelopes omit causes and confidential parser input", () => {
  const error = new ApplicationError("INVALID_ARGUMENT", "Request could not be processed", { cause: new Error("SECRET requirement content") });
  const serialized = JSON.stringify(error.toEnvelope("corr-safe"));
  assert.doesNotMatch(serialized, /SECRET|requirement content|cause/u);
});
