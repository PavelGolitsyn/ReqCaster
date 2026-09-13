import assert from "node:assert/strict";
import test from "node:test";

import { createHttpAdapter } from "../../src/adapters/http/index.js";
import { TrustedIdentityResolver, staticIdentityLookup } from "../../src/application/identity.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";

const mappedIdentity = {
  agentId: "agent:reader",
  authentication: { audience: "spec-speaker", expiresAt: "2030-01-01T00:00:00.000Z", issuer: "trusted-issuer" },
  principal: { id: "human:owner" },
  role: "tester",
};

test("transport authentication precedes request validation and body role claims are ignored", async () => {
  const identity = new TrustedIdentityResolver({
    audience: "spec-speaker",
    issuers: ["trusted-issuer"],
    lookup: staticIdentityLookup([["opaque-good", mappedIdentity]]),
  });
  let calls = 0;
  const dispatcher = new ApplicationDispatcher({
    clock: { now: () => "2026-01-01T00:00:00.000Z" },
    services: { GetRequirementService: { execute: async () => { calls += 1; return { ok: true }; } } },
  });
  const adapter = createHttpAdapter(dispatcher, { identity });
  const malformed = { correlationId: "corr-auth", role: "requirements-manager", schemaVersion: "1.0.0" };
  await assert.rejects(adapter.dispatch("requirements.get", malformed, "opaque-bad"), { code: "FORBIDDEN" });
  await assert.rejects(adapter.dispatch("requirements.get", malformed, "opaque-good"), { code: "SCHEMA_VIOLATION" });
  await assert.rejects(adapter.dispatch("requirements.get", {}, "opaque-good"), { code: "SCHEMA_VIOLATION" });
  assert.equal(calls, 0);
});

test("security audit metadata includes attribution and policy decision but no credential", async () => {
  const events = [];
  const dispatcher = new ApplicationDispatcher({
    audit: { append: async (event) => events.push(event) },
    clock: { now: () => "2026-01-01T00:00:00.000Z" },
    services: { GetRequirementService: { execute: async () => ({ ok: true }) } },
  });
  await dispatcher.execute("requirements.get", {}, mappedIdentity);
  await assert.rejects(dispatcher.execute("requirements.get", {}, { ...mappedIdentity, role: "unknown" }), { code: "FORBIDDEN" });
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(({ decision }) => decision), ["allowed", "denied"]);
  assert.equal(events[0].principalId, "human:owner");
  assert.equal(events[0].role, "tester");
  assert.equal(events[0].policyVersion, "1");
  assert.equal(JSON.stringify(events).includes("opaque"), false);
});
