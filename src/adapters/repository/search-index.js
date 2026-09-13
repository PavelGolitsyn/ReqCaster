import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename } from "node:fs/promises";
import { dirname } from "node:path";

import { buildSearchIndex, searchIndex, SEARCH_INDEX_VERSION } from "../../index/search-index.js";
import { canonicalBytes, parseStrictJson } from "./canonical-json.js";
import { enginePath, normalizeRequirementsRoot } from "./paths.js";

async function durableReplace(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, path);
}

function assertIndex(index) {
  if (index?.indexVersion !== SEARCH_INDEX_VERSION || !Number.isInteger(index.repositoryRevision) || !Array.isArray(index.entries)) {
    throw new TypeError("Derived search index has an invalid format");
  }
  if (index.entries.some((entry) => typeof entry?.id !== "string" || !entry.text || !entry.tokens || !entry.facets)) {
    throw new TypeError("Derived search index contains an invalid entry");
  }
}

export class PersistentSearchIndex {
  constructor(configuredRoot, options = {}) {
    this.root = normalizeRequirementsRoot(configuredRoot);
    this.path = enginePath(this.root, "indexes", "repository.json");
    this.options = options;
    this.current = null;
    this.stale = true;
    this.lastError = null;
  }

  async prepare() {
    await mkdir(this.root, { recursive: true });
    this.root = await realpath(this.root);
    for (const path of [enginePath(this.root), enginePath(this.root, "indexes")]) {
      try { if ((await lstat(path)).isSymbolicLink()) throw new TypeError("Derived index path must not be a symbolic link"); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      await mkdir(path, { recursive: true });
    }
    this.path = enginePath(this.root, "indexes", "repository.json");
  }

  async load() {
    try {
      await this.prepare();
      const bytes = await readFile(this.path);
      const index = parseStrictJson(bytes, { maximumBytes: this.options.maximumBytes ?? 100_000_000 });
      if (!bytes.equals(canonicalBytes(index))) throw new TypeError("Derived search index is not canonically serialized");
      assertIndex(index);
      this.current = index;
      this.stale = false;
      this.lastError = null;
      return this;
    } catch (error) {
      this.markStale(error);
      return this;
    }
  }

  async rebuild(documents, options = {}) {
    await this.prepare();
    const index = buildSearchIndex(documents, { ...this.options, ...options });
    await durableReplace(this.path, canonicalBytes(index));
    this.current = index;
    this.stale = false;
    this.lastError = null;
    return structuredClone(index);
  }

  markStale(error) {
    this.stale = true;
    this.lastError = error?.message ?? String(error ?? "unknown error");
  }

  async health() {
    if (!this.current && this.stale) await this.load();
    return { available: Boolean(this.current), lastError: this.lastError, repositoryRevision: this.current?.repositoryRevision, stale: this.stale };
  }

  async query(specification) {
    if (!this.current || this.stale) throw new Error("Derived search index is unavailable or stale");
    return searchIndex(this.current, specification);
  }
}
