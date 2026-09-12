import { readFile } from "node:fs/promises";
import { validatePolicy } from "../src/domain/policy.js";
import { POLICY_DOCUMENT_SCHEMA } from "../src/contracts/definitions.js";
import { validate } from "../src/contracts/validator.js";

const policy = JSON.parse(await readFile("config/policy.v1.json", "utf8"));
const issues = validatePolicy(policy);
if (issues.length) throw new Error(`Policy fixture invalid: ${issues.join("; ")}`);
const structuralIssues = validate(POLICY_DOCUMENT_SCHEMA, policy);
if (structuralIssues.length) throw new Error(`Policy schema violation: ${JSON.stringify(structuralIssues)}`);

for (const file of ["config/policy.v1.json", "config/authorization.v1.json", "test/fixtures/repositories/empty/repository.json", "test/fixtures/repositories/valid/repository.json", "test/fixtures/repositories/legacy/repository.json"]) {
  JSON.parse(await readFile(file, "utf8"));
}
for (const file of ["test/fixtures/repositories/invalid/repository.json", "test/fixtures/repositories/corrupted/repository.json"]) {
  const fixture = JSON.parse(await readFile(file, "utf8"));
  if (!fixture.expectedFailure) throw new Error(`${file} must identify its expected failure`);
}
console.log("Schemas and fixtures are internally consistent");
