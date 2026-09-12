import assert from "node:assert/strict";
import test from "node:test";
import { formatRelationshipId, formatRequirementId, parseRelationshipId, parseRequirementId } from "../../src/domain/identifiers.js";

test("canonical identifier properties hold across the full six-digit shape", () => {
  let state = 0x12345678;
  for (let index = 0; index < 10000; index += 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    const number = state % 1000000;
    for (const [prefix, level] of [["BR", "business"], ["SR", "software"]]) {
      const value = `${prefix}-${String(number).padStart(6, "0")}`;
      const parsed = parseRequirementId(value);
      assert.equal(parsed.value, value);
      assert.equal(parsed.level, level);
      assert.equal(parsed.number, number);
    }
  }
});

test("title-bearing and ambiguous identifiers are rejected", () => {
  for (const value of [
    "BR-LOGIN-000001", "SR-payment-000001", "BR-1", "BR-000000-title",
    "br-000001", " SR-000001", "SR-000001 ", "SR_000001", "SR-０００００１",
  ]) assert.equal(parseRequirementId(value), null, value);
});

test("non-string identifier values are rejected", () => {
  for (const value of [null, undefined, 1, {}, []]) assert.equal(parseRequirementId(value), null);
});

test("allocatable identifiers format exactly and overflow explicitly", () => {
  assert.equal(formatRequirementId("business", 1), "BR-000001");
  assert.equal(formatRequirementId("software", 999999), "SR-999999");
  assert.deepEqual(parseRelationshipId(formatRelationshipId(42)), { value: "RL-000042", number: 42 });
  assert.throws(() => formatRequirementId("business", 1000000), RangeError);
  assert.throws(() => formatRelationshipId(0), RangeError);
});
