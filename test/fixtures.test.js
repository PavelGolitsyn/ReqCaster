import assert from "node:assert/strict";
import test from "node:test";
import { parseRequirementId } from "../src/domain/identifiers.js";
import { makeLargeRepository } from "../fixtures/repositories/large.js";

test("large repository fixture is deterministic and remains within v1 ID capacity", () => {
  const fixture = makeLargeRepository(10000);
  assert.equal(fixture.business.length, 10000);
  assert.equal(fixture.business[0].id, "BR-000001");
  assert.equal(fixture.business.at(-1).id, "BR-010000");
  assert.ok(fixture.business.every((record) => parseRequirementId(record.id)));
  assert.equal(new Set(fixture.business.map((record) => record.id)).size, 10000);
});
