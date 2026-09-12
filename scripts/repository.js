#!/usr/bin/env node
import { canonicalStringify, CanonicalJsonRepository, MIGRATIONS, MigrationRunner } from "../src/adapters/repository/index.js";

const [command, rootArgument, commandArgument] = process.argv.slice(2);
if (!command || !rootArgument) {
  console.error("Usage: node scripts/repository.js <init|validate|diagnose|recover|rebuild-derived-state|migration-preview|migrate|restore-migration> <absolute-root> [migration-id]");
  process.exitCode = 2;
} else {
  const root = rootArgument;
  const repository = new CanonicalJsonRepository(root);
  try {
    let result;
    if (command === "init") result = await repository.initialize();
    else if (command === "migration-preview") result = await new MigrationRunner(repository, MIGRATIONS).preview();
    else if (command === "migrate") result = await new MigrationRunner(repository, MIGRATIONS).run({ actor: "operator:cli" });
    else if (command === "restore-migration") result = await repository.restoreMigrationBackup(commandArgument);
    else {
      if (command === "validate") result = await repository.validate();
      else if (command === "diagnose") result = await repository.diagnose();
      else if (command === "recover") result = { actions: await repository.recover() };
      else if (command === "rebuild-derived-state") result = await repository.rebuildDerivedState();
      else throw new TypeError(`Unknown repository command: ${command}`);
    }
    process.stdout.write(canonicalStringify(result));
  } catch (error) {
    process.stderr.write(canonicalStringify({ code: error.code ?? "INTERNAL_ERROR", details: error.details ?? [], message: error.message }));
    process.exitCode = 1;
  }
}
