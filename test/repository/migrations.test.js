import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalBytes, canonicalHash, CanonicalJsonRepository, MIGRATIONS, MigrationRunner, parseStrictJson, sha256 } from "../../src/adapters/repository/index.js";

async function legacyRepository(version = "0.9.0") {
  const root = await mkdtemp(join(tmpdir(), "speccaster-migration-"));
  const repository = new CanonicalJsonRepository(root);
  await repository.initialize();
  const paths = [join(root, "business-requirements.json"), join(root, "software-requirements.json")];
  const documents = await Promise.all(paths.map(async (path) => parseStrictJson(await readFile(path))));
  for (const document of documents) {
    document.schemaVersion = version;
    document.revision = document.repositoryRevision;
    delete document.repositoryRevision;
    delete document.documentType;
    delete document.nextRelationshipNumber;
  }
  const bytes = documents.map(canonicalBytes);
  await Promise.all(paths.map((path, index) => writeFile(path, bytes[index])));
  await writeFile(join(root, ".engine", "versions", "current.json"), canonicalBytes({
    businessHash: sha256(bytes[0]),
    revision: 0,
    schemaVersion: "1.0.0",
    softwareHash: sha256(bytes[1]),
    transactionHash: null,
  }));
  return { repository, root };
}

test("the registered migration is deterministic and idempotent", () => {
  const input = {
    business: { nextRequirementNumber: 1, requirements: [], relationships: [], revision: 0, schemaVersion: "0.9.0" },
    software: { nextRequirementNumber: 1, requirements: [], relationships: [], revision: 0, schemaVersion: "0.9.0" },
  };
  const once = MIGRATIONS[0].migrate(structuredClone(input));
  const twice = MIGRATIONS[0].migrate(structuredClone(once));
  assert.equal(canonicalHash(once), canonicalHash(twice));
});

test("migration preview is side-effect free, migration backs up, and backup restore is verified", async () => {
  const { repository } = await legacyRepository();
  const runner = new MigrationRunner(repository, MIGRATIONS);
  const preview = await runner.preview();
  assert.equal(preview.required, true);
  assert.equal(preview.sourceSchemaVersion, "0.9.0");
  assert.equal(preview.targetSchemaVersion, "1.0.0");
  assert.equal((await runner.preview()).sourceSchemaVersion, "0.9.0");
  const migrated = await runner.run({ actor: "test", toolVersion: "test" });
  assert.equal(migrated.committed, true);
  await repository.open();
  assert.equal(await repository.revision(), 1);
  const restored = await repository.restoreMigrationBackup(migrated.migrationId);
  assert.equal(restored.restoredSchemaVersion, "0.9.0");
  assert.equal((await runner.run({ actor: "test" })).committed, true);
});

test("unknown future schema versions are refused", async () => {
  const { repository } = await legacyRepository("9.0.0");
  await assert.rejects(new MigrationRunner(repository, MIGRATIONS).preview(), /Unsupported future schema version/);
});
