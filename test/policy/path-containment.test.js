import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDocumentPath, normalizeRequirementsRoot } from "../../src/adapters/repository/paths.js";

test("requirements root is operator-configured and absolute", () => {
  assert.equal(normalizeRequirementsRoot("/srv/spec-speaker/project-a"), "/srv/spec-speaker/project-a");
  for (const value of [".", "../project", "project", "", null]) {
    assert.throws(() => normalizeRequirementsRoot(value), TypeError);
  }
});

test("only fixed canonical filenames can resolve under the root", () => {
  assert.equal(canonicalDocumentPath("/srv/project", "business-requirements.json"), "/srv/project/business-requirements.json");
  for (const value of ["../../etc/passwd", "/etc/passwd", ".engine/audit", "business-requirements.json/../secret"] ) {
    assert.throws(() => canonicalDocumentPath("/srv/project", value), TypeError);
  }
});
