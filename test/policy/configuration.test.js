import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePolicy } from "../../src/domain/policy.js";
import { POLICY_DOCUMENT_SCHEMA } from "../../src/contracts/definitions.js";
import { validate } from "../../src/contracts/validator.js";

const policy = JSON.parse(await readFile(new URL("../../config/policy.v1.json", import.meta.url), "utf8"));

test("default policy is internally consistent", () => {
  assert.deepEqual(validatePolicy(policy), []);
  assert.deepEqual(validate(POLICY_DOCUMENT_SCHEMA, policy), []);
});

test("policy schema rejects unknown configuration fields", () => {
  assert.ok(validate(POLICY_DOCUMENT_SCHEMA, { ...policy, undocumentedOverride: true }).length > 0);
});

test("contradictory and duplicate transitions are rejected", () => {
  const candidate = structuredClone(policy);
  candidate.transitions.push({ from: "draft", to: "draft", permission: "requirements:mutate" });
  candidate.transitions.push(structuredClone(candidate.transitions[0]));
  const issues = validatePolicy(candidate);
  assert.ok(issues.some((issue) => issue.includes("self transition")));
  assert.ok(issues.some((issue) => issue.includes("duplicate transition")));
});

test("invalid relationship endpoints and cardinality are rejected", () => {
  const candidate = structuredClone(policy);
  candidate.relationships.push({ type: "bad", direction: "sideways", sourceKinds: ["unknown"], targetKinds: ["software"], maxTargets: 0 });
  const issues = validatePolicy(candidate);
  assert.ok(issues.some((issue) => issue.includes("unknown endpoint")));
  assert.ok(issues.some((issue) => issue.includes("positive")));
  assert.ok(issues.some((issue) => issue.includes("direction")));
});

test("coverage rules must reference known lifecycle states and relationship rules", () => {
  const candidate = structuredClone(policy);
  candidate.coverageRules.push({ level: "software", statuses: ["imaginary"], requiredRelationshipTypes: ["unknown"] });
  const issues = validatePolicy(candidate);
  assert.ok(issues.some((issue) => issue.includes("coverage status")));
  assert.ok(issues.some((issue) => issue.includes("coverage relationship")));
});

test("contradictory and non-positive limits are rejected", () => {
  const candidate = structuredClone(policy);
  candidate.limits.searchDefault = 101;
  candidate.limits.searchMaximum = 100;
  candidate.limits.bulkMaximum = 0;
  const issues = validatePolicy(candidate);
  assert.ok(issues.includes("searchDefault cannot exceed searchMaximum"));
  assert.ok(issues.some((issue) => issue.includes("bulkMaximum")));
});

test("only known advisory quality rules can be promoted to governed gates", () => {
  const candidate = structuredClone(policy);
  candidate.qualityRules.promotedRuleIds = ["REQ-QUALITY-004", "REQ-STRUCT-001", "REQ-QUALITY-999"];
  const issues = validatePolicy(candidate);
  assert.equal(issues.filter((issue) => issue.includes("promoted quality rule")).length, 2);
});
