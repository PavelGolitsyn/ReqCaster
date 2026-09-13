import { mkdir, open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { canonicalBytes } from "../adapters/repository/canonical-json.js";

function safeDiagnostic(value) {
  return {
    ...(typeof value?.code === "string" ? { code: value.code } : {}),
    healthy: value?.healthy === true,
    ...(Number.isInteger(value?.pendingTransactions) ? { pendingTransactions: value.pendingTransactions } : {}),
    ...(Number.isInteger(value?.repositoryRevision) ? { repositoryRevision: value.repositoryRevision } : {}),
    ...(Number.isInteger(value?.transactionCount) ? { transactionCount: value.transactionCount } : {}),
  };
}

const SAFE_STRING_FIELDS = new Set([
  "code", "correlationId", "createdAt", "errorCategory", "event", "lastCompletedAt",
  "level", "node", "observedAt", "operation", "outcome", "platform",
  "schemaVersion", "status", "timestamp", "version",
]);
const FORBIDDEN_FIELD = /(?:acceptance|content|credential|evidence|message|payload|rationale|request|response|secret|statement|token)/iu;

function safeMetadata(value, key = "", depth = 0) {
  if (depth > 8 || FORBIDDEN_FIELD.test(key)) return undefined;
  if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value === "string") {
    if (!SAFE_STRING_FIELDS.has(key)) return undefined;
    if (key === "status" && !new Set(["healthy", "degraded", "unhealthy", "available", "unavailable"]).has(value)) return undefined;
    return value.slice(0, 256);
  }
  if (Array.isArray(value)) return value.slice(0, 1_000).map((entry) => safeMetadata(entry, key, depth + 1)).filter((entry) => entry !== undefined);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, safeMetadata(entry, name, depth + 1)]).filter(([, entry]) => entry !== undefined));
  return undefined;
}

async function outsideRepository(root, destination) {
  if (!isAbsolute(destination)) throw new TypeError("Support bundle destination must be absolute");
  const resolved = resolve(destination);
  let parent;
  try { parent = await realpath(dirname(resolved)); }
  catch (error) { if (error.code !== "ENOENT") throw error; parent = dirname(resolved); }
  const target = join(parent, basename(resolved));
  const relation = relative(resolve(root), target);
  if (!relation || (!relation.startsWith("..") && !isAbsolute(relation))) throw new TypeError("Support bundle destination must be outside the repository");
  return target;
}

/** Generates a metadata-only bundle; it never reads canonical requirement bodies. */
export class SupportBundleGenerator {
  constructor(options = {}) {
    if (!options.repository || !options.health) throw new TypeError("Support bundle requires repository and health services");
    this.repository = options.repository;
    this.health = options.health;
    this.telemetry = options.telemetry;
    this.clock = options.clock ?? { now: () => new Date().toISOString() };
    this.releaseVersion = options.releaseVersion ?? "unknown";
  }

  async create(destination) {
    const target = await outsideRepository(this.repository.root, destination);
    const [diagnosis, observedHealth] = await Promise.all([this.repository.diagnose(), this.health.check()]);
    const health = safeMetadata(observedHealth);
    const bundle = {
      createdAt: new Date(this.clock.now()).toISOString(),
      diagnosis: safeDiagnostic(diagnosis),
      health,
      release: { node: process.versions.node, platform: process.platform, version: this.releaseVersion },
      schemaVersion: "1.0.0",
      telemetry: safeMetadata(this.telemetry?.snapshot?.() ?? { counters: {}, events: [], gauges: {}, operations: [], schemaVersion: "1.0.0" }),
    };
    await mkdir(dirname(target), { recursive: true });
    const handle = await open(target, "wx", 0o600);
    try { await handle.writeFile(canonicalBytes(bundle)); await handle.sync(); }
    finally { await handle.close(); }
    return { createdAt: bundle.createdAt, destination: target, repositoryRevision: diagnosis.repositoryRevision, schemaVersion: bundle.schemaVersion };
  }
}
