import assert from "node:assert/strict";
import test from "node:test";
import { ApplicationError, ERROR_CODES } from "../../src/application/errors.js";
import { TOOL_CATALOG } from "../../src/application/services/catalog.js";
import { SCHEMAS, TOOL_DEFINITIONS } from "../../src/contracts/definitions.js";
import { validate } from "../../src/contracts/validator.js";

function roundTrip(schema, value) {
  const decoded = JSON.parse(JSON.stringify(value));
  assert.deepEqual(validate(schema, decoded), []);
  return decoded;
}

test("every planned tool has a unique owner, permission, input/output schema, and documented errors", () => {
  assert.equal(new Set(TOOL_CATALOG.map((tool) => tool.name)).size, TOOL_CATALOG.length);
  for (const tool of TOOL_CATALOG) {
    assert.match(tool.service, /Service$/);
    assert.ok(tool.permission);
    assert.ok(SCHEMAS[tool.input], `${tool.name} input schema`);
    assert.ok(SCHEMAS[tool.output], `${tool.name} output schema`);
    assert.ok(tool.errors.includes("FORBIDDEN"));
    assert.ok(tool.errors.includes("INTERNAL_ERROR"));
  }
  assert.equal(TOOL_DEFINITIONS.length, TOOL_CATALOG.length);
});

test("representative query request and response round trip", () => {
  roundTrip(SCHEMAS.GetRequest, {
    schemaVersion: "1.0.0",
    correlationId: "corr-123",
    id: "BR-000042",
    projection: ["statement", "status"],
  });
  roundTrip(SCHEMAS.OperationResponse, {
    schemaVersion: "1.0.0",
    repositoryRevision: 12,
    correlationId: "corr-123",
    data: { id: "BR-000042", statement: "The product shall preserve governed decisions." },
  });
});

test("representative command request round trips with concurrency and idempotency metadata", () => {
  roundTrip(SCHEMAS.CreateRequest, {
    schemaVersion: "1.0.0",
    correlationId: "corr-create",
    idempotencyKey: "caller-key-0001",
    expectedRepositoryRevision: 12,
    draft: { level: "business", statement: "The service shall retain baselines.", category: "functional" },
  });
});

test("stable errors round trip and preserve conflict metadata", () => {
  const error = new ApplicationError("VERSION_CONFLICT", "The supplied version is stale", {
    details: [{ path: "/expectedVersion", reason: "expected 3, current is 4" }],
    current: { repositoryRevision: 19, itemVersion: 4 },
  }).toEnvelope("corr-conflict");
  roundTrip(SCHEMAS.ErrorResponse, error);
  assert.deepEqual(new Set(ERROR_CODES), new Set(SCHEMAS.ErrorResponse.properties.error.properties.code.enum));
});

test("unknown fields and filesystem paths are unavailable in API requests", () => {
  const base = { schemaVersion: "1.0.0", correlationId: "corr-path", id: "BR-000001" };
  for (const hostile of [
    { requirementsRoot: "../../etc" },
    { path: "/tmp/business-requirements.json" },
    { root: "..\\..\\Windows" },
  ]) assert.ok(validate(SCHEMAS.GetRequest, { ...base, ...hostile }).some((issue) => issue.reason === "is not allowed"));
  assert.ok(validate(SCHEMAS.GetRequest, { ...base, id: "../../etc/passwd" }).length > 0);
});

test("pagination and graph limits are structural contract failures", () => {
  const search = { schemaVersion: "1.0.0", correlationId: "corr-search", limit: 101 };
  const trace = { schemaVersion: "1.0.0", correlationId: "corr-trace", id: "SR-000001", direction: "both", depth: 6 };
  assert.ok(validate(SCHEMAS.SearchRequest, search).length > 0);
  assert.ok(validate(SCHEMAS.TraceRequest, trace).length > 0);
});
