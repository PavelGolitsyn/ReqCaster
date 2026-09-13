#!/usr/bin/env node
import {
  canonicalStringify,
  CanonicalJsonRepository,
  ImmutableBaselineStore,
  MIGRATIONS,
  MigrationRunner,
  PersistentSearchIndex,
  RepositoryBackupManager,
  TamperEvidentAuditLog,
} from "../src/adapters/repository/index.js";
import { EngineHealthService, OperationalTelemetry, SupportBundleGenerator } from "../src/operations/index.js";

const [command, rootArgument, commandArgument] = process.argv.slice(2);
if (!command || !rootArgument) {
  console.error("Usage: node scripts/repository.js <init|validate|diagnose|recover|integrity-check|rebuild-index|rotate-audit|backup|verify-backup|restore|migration-preview|migrate|restore-migration|support-bundle> <absolute-root> [absolute-path-or-migration-id]");
  process.exitCode = 2;
} else {
  const root = rootArgument;
  const repository = new CanonicalJsonRepository(root);
  try {
    let result;
    if (command === "verify-backup") result = await RepositoryBackupManager.verify(root);
    else if (command === "restore") result = await RepositoryBackupManager.restoreIsolated(root, commandArgument).then(({ audit, backupManifest, baselines, destination, rebuilt, validation }) => ({ audit, backupManifest, baselines, destination, rebuilt, validation }));
    else if (command === "init") result = await repository.initialize();
    else if (command === "migration-preview") result = await new MigrationRunner(repository, MIGRATIONS).preview();
    else if (command === "migrate") result = await new MigrationRunner(repository, MIGRATIONS).run({ actor: "operator:cli" });
    else if (command === "restore-migration") result = await repository.restoreMigrationBackup(commandArgument);
    else if (command === "backup") result = await new RepositoryBackupManager({ repository }).create(commandArgument);
    else if (command === "rotate-audit") result = await new TamperEvidentAuditLog(root).checkpoint({ actor: "operator:cli" });
    else if (command === "integrity-check") result = {
      audit: await new TamperEvidentAuditLog(root).verify(),
      baselines: await new ImmutableBaselineStore(root).verify(),
      repository: await repository.validate(),
    };
    else if (command === "support-bundle") {
      const searchIndex = new PersistentSearchIndex(root);
      const audit = new TamperEvidentAuditLog(root);
      const baselines = new ImmutableBaselineStore(root);
      const health = new EngineHealthService({ audit, baselines, repository, searchIndex });
      result = await new SupportBundleGenerator({ health, releaseVersion: "1.0.0", repository, telemetry: new OperationalTelemetry() }).create(commandArgument);
    }
    else {
      if (command === "validate") result = await repository.validate();
      else if (command === "diagnose") result = await repository.diagnose();
      else if (command === "recover") result = { actions: await repository.recover() };
      else if (command === "rebuild-derived-state" || command === "rebuild-index") result = await repository.rebuildDerivedState();
      else throw new TypeError(`Unknown repository command: ${command}`);
    }
    process.stdout.write(canonicalStringify(result));
  } catch (error) {
    process.stderr.write(canonicalStringify({ code: error.code ?? "INTERNAL_ERROR", details: error.details ?? [], message: error.message }));
    process.exitCode = 1;
  }
}
