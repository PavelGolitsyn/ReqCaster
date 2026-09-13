import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

import { canonicalBytes, canonicalHash, parseStrictJson } from "./canonical-json.js";
import { IntegrityError } from "./errors.js";
import { acquireProjectLock } from "./lock.js";
import { enginePath, normalizeRequirementsRoot } from "./paths.js";

const VERSION = "1.0.0";

function timestamp(value = new Date().toISOString()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Audit timestamp is invalid");
  return date.toISOString();
}

async function durableExclusive(path, value) {
  const handle = await open(path, "wx", 0o400);
  try { await handle.writeFile(canonicalBytes(value)); await handle.sync(); }
  finally { await handle.close(); }
  await chmod(path, 0o400);
}

async function replaceHead(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(canonicalBytes(value)); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, path);
}

function eventHash(record) {
  const copy = structuredClone(record);
  delete copy.eventHash;
  return canonicalHash(copy);
}

function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, withoutUndefined(entry)]));
  return value;
}

function assertEvent(record, expectedSequence, expectedPreviousHash) {
  if (!record || record.schemaVersion !== VERSION || record.sequence !== expectedSequence) throw new IntegrityError("Audit event sequence is invalid");
  if (record.previousHash !== expectedPreviousHash) throw new IntegrityError(`Audit chain is broken at sequence ${expectedSequence}`);
  if (!/^AUD-[0-9]{12}-[a-f0-9-]{36}$/u.test(record.id ?? "")) throw new IntegrityError("Audit event identity is invalid");
  if (record.eventHash !== eventHash(record)) throw new IntegrityError(`Audit event ${record.id} was modified`);
  timestamp(record.timestamp);
}

/** Append-only, hash-chained governed audit storage. Operational logging belongs elsewhere. */
export class TamperEvidentAuditLog {
  constructor(configuredRoot, options = {}) {
    this.root = normalizeRequirementsRoot(configuredRoot);
    this.segmentSize = options.segmentSize ?? 10_000;
    if (!Number.isInteger(this.segmentSize) || this.segmentSize < 1) throw new TypeError("Audit segment size must be positive");
  }

  async initialize() {
    await mkdir(enginePath(this.root, "audit", "events"), { recursive: true });
    await mkdir(enginePath(this.root, "locks"), { recursive: true });
    try { await durableExclusive(enginePath(this.root, "audit", "head.json"), { auditId: randomUUID(), eventCount: 0, schemaVersion: VERSION, segmentSize: this.segmentSize, tailHash: null }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    return this;
  }

  async append(event) {
    await this.initialize();
    const release = await acquireProjectLock(enginePath(this.root, "locks", "audit.lock"));
    try {
      const verified = await this.verify();
      if (event?.transactionId) {
        const existing = (await this.#records()).find((record) => record.transactionId === event.transactionId && record.event === event.event);
        if (existing) return structuredClone(existing);
      }
      const sequence = verified.eventCount + 1;
      const record = {
        ...withoutUndefined(structuredClone(event)),
        id: `AUD-${String(sequence).padStart(12, "0")}-${randomUUID()}`,
        previousHash: verified.tailHash,
        schemaVersion: VERSION,
        segment: Math.floor((sequence - 1) / this.segmentSize) + 1,
        sequence,
        timestamp: timestamp(event?.timestamp),
      };
      record.eventHash = eventHash(record);
      await durableExclusive(join(enginePath(this.root, "audit", "events"), `${String(sequence).padStart(12, "0")}.json`), record);
      const head = await this.#head();
      await replaceHead(enginePath(this.root, "audit", "head.json"), { ...head, eventCount: sequence, tailHash: record.eventHash });
      return structuredClone(record);
    } finally { await release(); }
  }

  async list(options = {}) {
    const records = await this.#records();
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return { events: structuredClone(records.slice(offset, offset + limit)), total: records.length };
  }

  async verify() {
    const records = await this.#records();
    let head;
    try { head = await this.#head(); }
    catch (error) { if (error.code === "ENOENT" && !records.length) return { algorithm: "sha256", eventCount: 0, healthy: true, segmentCount: 0, tailHash: null }; throw error; }
    if (head.schemaVersion !== VERSION || !Number.isInteger(head.segmentSize) || head.segmentSize < 1 || !Number.isInteger(head.eventCount) || head.eventCount < 0) throw new IntegrityError("Audit chain head is invalid");
    let previousHash = null;
    let previousSegment = 1;
    for (const [index, record] of records.entries()) {
      assertEvent(record, index + 1, previousHash);
      const expectedSegment = Math.floor(index / head.segmentSize) + 1;
      if (record.segment !== expectedSegment || record.segment < previousSegment) throw new IntegrityError(`Audit segment boundary is invalid at sequence ${record.sequence}`);
      previousSegment = record.segment;
      previousHash = record.eventHash;
    }
    if (head.eventCount !== records.length || head.tailHash !== previousHash) throw new IntegrityError("Audit event deletion or uncommitted tail was detected");
    return { algorithm: "sha256", eventCount: records.length, healthy: true, segmentCount: records.length ? previousSegment : 0, tailHash: previousHash };
  }

  async #head() {
    return parseStrictJson(await readFile(enginePath(this.root, "audit", "head.json")), { maximumBytes: 64_000 });
  }

  async #records() {
    const directory = enginePath(this.root, "audit", "events");
    let names;
    try { names = (await readdir(directory)).filter((name) => /^[0-9]{12}\.json$/u.test(name)).sort(); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    return Promise.all(names.map(async (name) => parseStrictJson(await readFile(join(directory, name)), { maximumBytes: 1_000_000 })));
  }
}
