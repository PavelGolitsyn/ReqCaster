import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalStringify, createEmptyDocument, parseStrictJson, validateRepositoryDocuments } from "../../src/adapters/repository/index.js";

const policy = JSON.parse(await readFile(new URL("../../config/policy.v1.json", import.meta.url)));

function validPair() {
  const business = createEmptyDocument("business");
  const software = createEmptyDocument("software");
  business.nextRequirementNumber = 2;
  software.nextRequirementNumber = 2;
  business.nextRelationshipNumber = 2;
  software.nextRelationshipNumber = 2;
  business.requirements.push({
    acceptanceCriteria: [{ id: "AC-1", text: "A measurable result", verificationMethod: "test" }],
    category: "functional",
    customAttributes: { "safety.case": undefined },
    id: "BR-000001",
    level: "business",
    provenance: { createdAt: "2026-01-01T00:00:00.000Z", createdBy: "manager", updatedAt: "2026-01-01T00:00:00.000Z", updatedBy: "manager" },
    sourceReferences: [{ title: "Source", type: "document", uri: "urn:source:1" }],
    statement: "The product shall retain data.",
    status: "draft",
    version: 1,
  });
  delete business.requirements[0].customAttributes;
  software.requirements.push({ category: "quality", id: "SR-000001", level: "software", statement: "The service shall persist data.", status: "draft", version: 1 });
  software.relationships.push({
    id: "RL-000001",
    source: { id: "SR-000001", kind: "requirement", version: 1 },
    suspect: false,
    target: { id: "BR-000001", kind: "requirement", version: 1 },
    type: "derives_from",
    version: 1,
  });
  return { business, software };
}

test("golden business, software, relationship, reference, criterion, and provenance records validate", () => {
  const { business, software } = validPair();
  assert.deepEqual(validateRepositoryDocuments(business, software, policy), []);
});

test("published golden canonical documents cover every v1 record subtype", async () => {
  const directory = new URL("../fixtures/repositories/canonical-v1/", import.meta.url);
  const [businessBytes, softwareBytes] = await Promise.all([
    readFile(new URL("business-requirements.json", directory)),
    readFile(new URL("software-requirements.json", directory)),
  ]);
  const business = parseStrictJson(businessBytes);
  const software = parseStrictJson(softwareBytes);
  assert.equal(canonicalStringify(business), businessBytes.toString("utf8"));
  assert.equal(canonicalStringify(software), softwareBytes.toString("utf8"));
  assert.deepEqual(validateRepositoryDocuments(business, software, policy), []);
});

test("duplicate IDs, wrong prefixes, title-bearing IDs, vocabulary errors, broken links, and unknown fields are rejected", () => {
  const mutations = [
    ({ business }) => { business.requirements.push({ ...business.requirements[0] }); },
    ({ business }) => { business.requirements[0].id = "SR-000001"; },
    ({ business }) => { business.requirements[0].id = "BR-data-000001"; },
    ({ business }) => { business.requirements[0].status = "published"; },
    ({ software }) => { software.relationships[0].target.id = "BR-000999"; },
    ({ software }) => { software.relationships[0].target.version = 2; },
    ({ business }) => { business.requirements[0].unexpected = true; },
  ];
  for (const mutate of mutations) {
    const documents = validPair();
    mutate(documents);
    assert.ok(validateRepositoryDocuments(documents.business, documents.software, policy).length > 0);
  }
});

test("configured required metadata is blocking for approved records", () => {
  const documents = validPair();
  documents.business.requirements[0].status = "approved";
  const issues = validateRepositoryDocuments(documents.business, documents.software, policy);
  assert.ok(issues.some(({ path }) => path.endsWith("/rationale")));
  assert.ok(issues.some(({ path }) => path.endsWith("/owner")));
});

test("retired records remain explicit and active records cannot carry retirement metadata", () => {
  const documents = validPair();
  documents.business.requirements[0].status = "retired";
  assert.ok(validateRepositoryDocuments(documents.business, documents.software, policy).some(({ path }) => path.endsWith("/retirement")));
  documents.business.requirements[0].retirement = { retiredAt: "2026-01-02T00:00:00.000Z", retiredBy: "manager", rationale: "Superseded" };
  assert.deepEqual(validateRepositoryDocuments(documents.business, documents.software, policy), []);
});

test("non-canonical timestamps and over-deep custom attributes are rejected", () => {
  const documents = validPair();
  documents.business.requirements[0].provenance.updatedAt = "2026-01-01T00:00:00Z";
  documents.business.requirements[0].customAttributes = { nested: { nested: { nested: { nested: { nested: { nested: true } } } } } };
  const issues = validateRepositoryDocuments(documents.business, documents.software, policy);
  assert.ok(issues.some(({ reason }) => reason.includes("canonical UTC timestamp")));
  assert.ok(issues.some(({ reason }) => reason.includes("custom attribute depth")));
});

test("large allowed arrays validate and configured array limits reject cleanly", () => {
  const documents = validPair();
  documents.business.requirements = Array.from({ length: 2000 }, (_, index) => ({
    category: "functional",
    id: `BR-${String(index + 1).padStart(6, "0")}`,
    level: "business",
    statement: `Requirement ${index + 1}`,
    status: "draft",
    version: 1,
  }));
  documents.business.nextRequirementNumber = 2001;
  documents.software.relationships = [];
  documents.business.nextRelationshipNumber = 1;
  documents.software.nextRelationshipNumber = 1;
  assert.deepEqual(validateRepositoryDocuments(documents.business, documents.software, policy), []);
  documents.business.requirements = new Array(100001).fill(null);
  assert.ok(validateRepositoryDocuments(documents.business, documents.software, policy).some(({ reason }) => reason === "must be a bounded array"));
});
