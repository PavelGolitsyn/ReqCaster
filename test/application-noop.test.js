import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ApplicationDispatcher } from "../src/application/services/dispatcher.js";

test("a semantic no-op command produces no repository or audit changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "speccaster-noop-"));
  const canonical = join(directory, "business-requirements.json");
  const audit = join(directory, "audit.jsonl");
  await writeFile(canonical, "{\"repositoryRevision\":7}\n");
  await writeFile(audit, "");
  const before = [await readFile(canonical), await readFile(audit)];
  let repositoryWrites = 0;
  let auditWrites = 0;
  const dispatcher = new ApplicationDispatcher({
    clock: { now: () => "2026-01-01T00:00:00Z" },
    services: {
      UpdateRequirementService: {
        execute: async () => ({ schemaVersion: "1.0.0", repositoryRevision: 7, correlationId: "noop", data: { changed: false } }),
      },
    },
  });
  const response = await dispatcher.execute("requirements.update", {}, {
    role: "requirements-manager",
    agentId: "agent:manager",
    principal: { id: "human:owner" },
    authentication: { issuer: "test" },
  });
  if (response.data.changed) repositoryWrites += 1;
  if (response.data.changed) auditWrites += 1;
  const after = [await readFile(canonical), await readFile(audit)];
  assert.equal(repositoryWrites, 0);
  assert.equal(auditWrites, 0);
  assert.deepEqual(after, before);
});
