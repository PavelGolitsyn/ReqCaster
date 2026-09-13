import { cp, lstat, mkdir, open, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { canonicalBytes, parseStrictJson, sha256 } from "./canonical-json.js";
import { ImmutableBaselineStore } from "./baseline-store.js";
import { TamperEvidentAuditLog } from "./audit-log.js";
import { IntegrityError } from "./errors.js";
import { CanonicalJsonRepository } from "./repository.js";
import { acquireProjectLock } from "./lock.js";
import { enginePath } from "./paths.js";

async function files(root, relativeRoot = "") {
  const directory = join(root, relativeRoot);
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    const name = join(relativeRoot, entry.name);
    if ((await lstat(path)).isSymbolicLink()) throw new IntegrityError(`Backup refuses symbolic link ${name}`);
    if (entry.isDirectory()) output.push(...await files(root, name));
    else if (entry.isFile() && name !== "backup-manifest.json") output.push(name);
  }
  return output;
}

async function checksums(root) {
  return Object.fromEntries(await Promise.all((await files(root)).map(async (name) => [name, sha256(await readFile(join(root, name)))])));
}

async function exclusiveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, "wx", 0o400);
  try { await handle.writeFile(canonicalBytes(value)); await handle.sync(); }
  finally { await handle.close(); }
}

function assertTarget(source, destination) {
  if (!isAbsolute(destination)) throw new TypeError("Backup or restore destination must be absolute");
  const target = resolve(destination);
  const relation = relative(resolve(source), target);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) throw new TypeError("Backup or restore destination must be outside the source repository");
  return target;
}

export class RepositoryBackupManager {
  constructor({ repository }) {
    if (!repository?.withConsistencyPoint) throw new TypeError("A repository consistency-point port is required");
    this.repository = repository;
  }

  async create(destination, options = {}) {
    const target = assertTarget(this.repository.root, destination);
    return this.repository.withConsistencyPoint(async ({ checksums: sourceChecksums, repositoryRevision, root }) => {
      const releaseAudit = await acquireProjectLock(enginePath(root, "locks", "audit.lock"));
      const releaseBaselines = await acquireProjectLock(enginePath(root, "locks", "baselines.lock"));
      try {
      try { await lstat(target); throw new TypeError("Backup destination must not already exist"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      await mkdir(target, { recursive: false });
      for (const name of await files(root)) {
        if (name.startsWith(join(".engine", "locks")) || name.startsWith(join(".engine", "indexes")) || name.startsWith(join(".engine", "quarantine"))) continue;
        const output = join(target, name);
        await mkdir(dirname(output), { recursive: true });
        await cp(join(root, name), output, { errorOnExist: true, force: false, preserveTimestamps: true });
      }
      const copiedChecksums = await checksums(target);
      for (const [name, hash] of Object.entries(copiedChecksums)) if (sha256(await readFile(join(target, name))) !== hash) throw new IntegrityError(`Backup checksum failed for ${name}`);
      const manifest = {
        backupId: options.backupId ?? `backup-${new Date(options.now ?? Date.now()).toISOString().replaceAll(":", "-")}`,
        canonicalChecksums: sourceChecksums,
        completedAt: new Date(options.now ?? Date.now()).toISOString(),
        files: copiedChecksums,
        repositoryRevision,
        schemaVersion: "1.0.0",
      };
      await exclusiveJson(join(target, "backup-manifest.json"), manifest);
      return { destination: target, manifest };
      } finally { await releaseBaselines(); await releaseAudit(); }
    });
  }

  static async verify(source) {
    const root = await realpath(source);
    const manifest = parseStrictJson(await readFile(join(root, "backup-manifest.json")), { maximumBytes: 20_000_000 });
    const actual = await checksums(root);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new IntegrityError("Backup file set or checksums do not match its manifest");
    return { healthy: true, manifest };
  }

  static async restoreIsolated(source, destination, options = {}) {
    const backupRoot = await realpath(source);
    const target = assertTarget(backupRoot, destination);
    const verified = await RepositoryBackupManager.verify(backupRoot);
    try { await lstat(target); throw new TypeError("Restore destination must not already exist"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await mkdir(target, { recursive: false });
    for (const name of Object.keys(verified.manifest.files)) {
      const output = join(target, name);
      await mkdir(dirname(output), { recursive: true });
      await cp(join(backupRoot, name), output, { errorOnExist: true, force: false, preserveTimestamps: true });
    }
    const repository = new CanonicalJsonRepository(target, options.repositoryOptions);
    await repository.open();
    const validation = await repository.validate();
    const audit = await new TamperEvidentAuditLog(target, options.auditOptions).verify();
    const baselines = await new ImmutableBaselineStore(target).verify();
    const rebuilt = await repository.rebuildDerivedState();
    return { audit, baselines, destination: target, rebuilt, repository, validation, backupManifest: verified.manifest };
  }
}

export { checksums as repositoryChecksums };
