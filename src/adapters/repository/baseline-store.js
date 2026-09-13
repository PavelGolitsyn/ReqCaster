import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { canonicalBytes, canonicalHash, parseStrictJson } from "./canonical-json.js";
import { IntegrityError, RepositoryError } from "./errors.js";
import { acquireProjectLock } from "./lock.js";
import { enginePath, normalizeRequirementsRoot } from "./paths.js";

const clone = (value) => structuredClone(value);

async function immutableWrite(path, value) {
  const handle = await open(path, "wx", 0o400);
  try { await handle.writeFile(canonicalBytes(value)); await handle.sync(); }
  finally { await handle.close(); }
  await chmod(path, 0o400);
}

function manifestHash(manifest) {
  const value = clone(manifest);
  delete value.manifestChecksum;
  return canonicalHash(value);
}

export class ImmutableBaselineStore {
  constructor(configuredRoot) {
    this.root = normalizeRequirementsRoot(configuredRoot);
  }

  async initialize() {
    await mkdir(enginePath(this.root, "baselines"), { recursive: true });
    await mkdir(enginePath(this.root, "locks"), { recursive: true });
    return this;
  }

  async nextId() {
    await this.initialize();
    const entries = await readdir(enginePath(this.root, "baselines"), { withFileTypes: true });
    const maximum = entries.filter((entry) => entry.isDirectory()).map(({ name }) => /^BL-([0-9]{6})$/u.exec(name)).filter(Boolean).reduce((value, match) => Math.max(value, Number(match[1])), 0);
    return `BL-${String(maximum + 1).padStart(6, "0")}`;
  }

  async create(manifest, snapshot) {
    await this.initialize();
    const release = await acquireProjectLock(enginePath(this.root, "locks", "baselines.lock"));
    try {
      if (!/^BL-[0-9]{6}$/u.test(manifest?.baselineId ?? "")) throw new TypeError("Baseline identity is invalid");
      const directory = enginePath(this.root, "baselines", manifest.baselineId);
      await mkdir(directory, { recursive: false });
      const snapshotChecksum = canonicalHash(snapshot);
      const complete = { ...clone(manifest), integrityProof: { algorithm: "sha256", snapshotChecksum }, schemaVersion: "1.0.0", snapshotChecksum };
      complete.manifestChecksum = manifestHash(complete);
      await immutableWrite(join(directory, "snapshot.json"), snapshot);
      await immutableWrite(join(directory, "manifest.json"), complete);
      return clone(complete);
    } finally { await release(); }
  }

  async get(id) {
    if (!/^BL-[0-9]{6}$/u.test(id ?? "")) throw new RepositoryError("NOT_FOUND", "Baseline was not found");
    let manifest;
    let snapshot;
    try {
      manifest = parseStrictJson(await readFile(enginePath(this.root, "baselines", id, "manifest.json")), { maximumBytes: 5_000_000 });
      snapshot = parseStrictJson(await readFile(enginePath(this.root, "baselines", id, "snapshot.json")), { maximumBytes: 50_000_000 });
    } catch (error) {
      if (error.code === "ENOENT") throw new RepositoryError("NOT_FOUND", "Baseline was not found");
      throw error;
    }
    if (manifest.baselineId !== id || manifest.manifestChecksum !== manifestHash(manifest) || manifest.snapshotChecksum !== canonicalHash(snapshot)) throw new IntegrityError(`Baseline ${id} integrity verification failed`);
    return { documents: clone(snapshot.documents), manifest: clone(manifest), policy: clone(snapshot.policy) };
  }

  async readBaseline(id) { return this.get(id); }

  async list() {
    await this.initialize();
    const entries = await readdir(enginePath(this.root, "baselines"), { withFileTypes: true });
    const output = [];
    for (const entry of entries.filter((value) => value.isDirectory() && /^BL-[0-9]{6}$/u.test(value.name)).sort((a, b) => a.name.localeCompare(b.name))) {
      output.push((await this.get(entry.name)).manifest);
    }
    return output;
  }

  async verify() {
    const baselines = await this.list();
    return { baselineCount: baselines.length, healthy: true, manifestChecksums: Object.fromEntries(baselines.map((manifest) => [manifest.baselineId, manifest.manifestChecksum])) };
  }

  async amend(id, amendment) {
    await this.get(id);
    const directory = enginePath(this.root, "baselines", id, "amendments");
    await mkdir(directory, { recursive: true });
    const names = (await readdir(directory)).filter((name) => /^[0-9]{6}\.json$/u.test(name)).sort();
    const previous = names.length ? parseStrictJson(await readFile(join(directory, names.at(-1)))) : null;
    const sequence = names.length + 1;
    const record = { ...clone(amendment), amendmentId: `${id}-A${String(sequence).padStart(6, "0")}`, baselineId: id, previousHash: previous?.amendmentHash ?? null, sequence };
    record.amendmentHash = canonicalHash(record);
    await immutableWrite(join(directory, `${String(sequence).padStart(6, "0")}.json`), record);
    return clone(record);
  }
}

