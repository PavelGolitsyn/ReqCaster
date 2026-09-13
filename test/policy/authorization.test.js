import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { authorize, ROLE_PERMISSIONS, ROLES } from "../../src/application/authorization.js";
import { TOOL_CATALOG } from "../../src/application/services/catalog.js";
import { ApplicationDispatcher } from "../../src/application/services/dispatcher.js";

const identity = (role) => ({
  role,
  agentId: `agent:${role}`,
  principal: { id: "human:accountable-owner" },
  authentication: { issuer: "test-issuer", subject: `agent:${role}` },
});

const fixture = JSON.parse(await readFile(new URL("../../config/authorization.v1.json", import.meta.url), "utf8"));

test("authorization fixture matches the executable role policy", () => {
  assert.equal(fixture.scope, "repository");
  assert.deepEqual(fixture.roles, ROLE_PERMISSIONS);
});

for (const tool of TOOL_CATALOG) {
  for (const role of ROLES) {
    const expected = ROLE_PERMISSIONS[role].includes(tool.permission);
    test(`${role} ${expected ? "may" : "may not"} call ${tool.name}`, () => {
      if (expected) assert.doesNotThrow(() => authorize(identity(role), tool.permission));
      else assert.throws(() => authorize(identity(role), tool.permission), { code: "FORBIDDEN" });
    });
  }
}

test("payload-like identities without trusted authentication are denied", () => {
  assert.throws(() => authorize({ role: "requirements-manager", agentId: "forged", principal: { id: "forged" } }, "requirements:mutate"), { code: "FORBIDDEN" });
});

test("agent and accountable principal are distinct required values", () => {
  const caller = identity("requirements-manager");
  assert.notEqual(caller.agentId, caller.principal.id);
  assert.doesNotThrow(() => authorize(caller, "requirements:decide"));
});

test("unknown and expired identities are denied by default", () => {
  assert.throws(() => authorize(identity("unknown"), "requirements:read"), { code: "FORBIDDEN" });
  const expired = identity("tester");
  expired.authentication.expiresAt = "2020-01-01T00:00:00.000Z";
  assert.throws(() => authorize(expired, "requirements:read", { now: "2026-01-01T00:00:00.000Z" }), { code: "FORBIDDEN" });
});

test("malformed and empty explicit authorization scopes fail closed", () => {
  assert.throws(() => authorize({ ...identity("tester"), authorization: { repositories: "default" } }, "requirements:read"), { code: "FORBIDDEN" });
  assert.throws(() => authorize({ ...identity("tester"), authorization: { repositories: [] } }, "requirements:read"), { code: "FORBIDDEN" });
});

test("authorization denial occurs before a mutation service can run", async () => {
  let serviceCalls = 0;
  const dispatcher = new ApplicationDispatcher({
    clock: { now: () => "2026-01-01T00:00:00Z" },
    services: { CreateRequirementService: { execute: async () => { serviceCalls += 1; } } },
  });
  await assert.rejects(dispatcher.execute("requirements.create", {}, identity("implementer")), { code: "FORBIDDEN" });
  assert.equal(serviceCalls, 0);
});
