import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CanonicalJsonRepository } from "../../src/adapters/repository/index.js";

async function repository(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "spec-speaker-repository-"));
  const instance = new CanonicalJsonRepository(root, options);
  await instance.initialize();
  return { instance, root };
}

function addBusiness({ business }, { allocateRequirementId }, statement = "The product shall preserve settings.") {
  const id = allocateRequirementId("business");
  business.requirements.push({ category: "functional", id, level: "business", statement, status: "draft", version: 1 });
  return id;
}

test("initialization creates the fixed layout, revision zero, and compliant allocators", async () => {
  const { instance, root } = await repository();
  const documents = await instance.read();
  assert.equal(documents.business.repositoryRevision, 0);
  assert.equal(documents.software.repositoryRevision, 0);
  assert.equal(documents.business.nextRequirementNumber, 1);
  assert.equal(documents.software.nextRequirementNumber, 1);
  for (const name of ["business-requirements.json", "software-requirements.json", ".engine/versions/current.json", ".engine/schemas/v1/business-requirements.schema.json"]) await readFile(join(root, name));
});

test("concurrent creates allocate unique monotonic IDs and writers serialize", async () => {
  const { instance } = await repository();
  const results = await Promise.all(Array.from({ length: 40 }, (_, index) => instance.execute((documents, context) => addBusiness(documents, context, `Requirement ${index}`))));
  const ids = results.map(({ result }) => result).sort();
  assert.deepEqual(ids, Array.from({ length: 40 }, (_, index) => `BR-${String(index + 1).padStart(6, "0")}`));
  assert.equal(await instance.revision(), 40);
});

test("relationship allocation is global and synchronized", async () => {
  const { instance } = await repository();
  await instance.execute(({ business, software }, context) => {
    const businessId = addBusiness({ business }, context);
    const softwareId = context.allocateRequirementId("software");
    software.requirements.push({ category: "functional", id: softwareId, level: "software", statement: "The software shall preserve settings.", status: "draft", version: 1 });
    software.relationships.push({ id: context.allocateRelationshipId(), source: { id: softwareId, kind: "requirement" }, suspect: false, target: { id: businessId, kind: "requirement" }, type: "derives_from", version: 1 });
  });
  const documents = await instance.read();
  assert.equal(documents.business.nextRelationshipNumber, 2);
  assert.equal(documents.software.nextRelationshipNumber, 2);
  assert.equal(documents.software.relationships[0].id, "RL-000001");
});

test("invalid content and non-monotonic changes never commit", async () => {
  const { instance } = await repository();
  await instance.execute(addBusiness);
  await assert.rejects(instance.execute(({ business }) => { business.requirements[0].status = "invalid"; }), /validation failed/);
  await assert.rejects(instance.execute(({ business }) => { business.requirements[0].statement = "Changed without a version"; }), (error) => error.details.some(({ reason }) => reason.includes("must increase")));
  await assert.rejects(instance.execute(({ business }) => { business.requirements.length = 0; }), (error) => error.details.some(({ reason }) => reason.includes("physically deleted")));
  assert.equal(await instance.revision(), 1);
});

test("optimistic repository revision conflicts fail before mutation", async () => {
  const { instance } = await repository();
  await instance.execute(addBusiness, { expectedRepositoryRevision: 0 });
  let called = false;
  await assert.rejects(instance.execute(() => { called = true; }, { expectedRepositoryRevision: 0 }), (error) => error.code === "VERSION_CONFLICT");
  assert.equal(called, false);
});

test("concurrent readers observe complete revisions while a writer commits", async () => {
  const { instance } = await repository();
  const operations = [instance.execute(addBusiness), ...Array.from({ length: 20 }, () => instance.read())];
  const results = await Promise.all(operations);
  for (const documents of results.slice(1)) assert.equal(documents.business.repositoryRevision, documents.software.repositoryRevision);
});

for (const faultPoint of ["before-candidates", "after-candidates", "after-prepared", "after-business-rename", "after-software-rename", "after-integrity", "after-committed"]) {
  test(`recovery yields an old or new complete pair after fault at ${faultPoint}`, async () => {
    const { instance, root } = await repository();
    await assert.rejects(instance.execute(addBusiness, { faultInjector(step) { if (step === faultPoint) throw new Error(`fault:${step}`); } }), /fault:/);
    const reopened = new CanonicalJsonRepository(root);
    await reopened.open();
    const documents = await reopened.read();
    assert.equal(documents.business.repositoryRevision, documents.software.repositoryRevision);
    assert.ok([0, 1].includes(documents.business.repositoryRevision));
    assert.equal(documents.business.requirements.length, documents.business.repositoryRevision);
  });
}

test("corrupt prepared candidates are quarantined and both before-images are restored", async () => {
  const { instance, root } = await repository();
  await assert.rejects(instance.execute(addBusiness, { faultInjector(step) { if (step === "after-prepared") throw new Error("crash"); } }), /crash/);
  const [transaction] = await readdir(join(root, ".engine", "transactions"));
  await writeFile(join(root, ".engine", "transactions", transaction, "after-business.json"), "{corrupt\n");
  const reopened = new CanonicalJsonRepository(root);
  await reopened.open();
  assert.equal(await reopened.revision(), 0);
  assert.ok((await readdir(join(root, ".engine", "quarantine"))).length > 0);
});
