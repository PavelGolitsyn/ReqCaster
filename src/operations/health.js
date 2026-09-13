import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

async function storageUsage(root) {
  let totalBytes = 0;
  let files = 0;
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const details = await lstat(path);
      if (details.isSymbolicLink()) continue;
      if (details.isDirectory()) await visit(path);
      else if (details.isFile()) { files += 1; totalBytes += details.size; }
    }
  };
  await visit(root);
  return { files, totalBytes };
}

const SAFE_HEALTH_FIELDS = new Set([
  "active", "ageSeconds", "available", "baselineCount", "code", "eventCount",
  "files", "healthy", "highWater", "lastCompletedAt", "maximumConcurrent",
  "maximumQueue", "pendingTransactions", "queueDepth", "repositoryRevision",
  "segmentCount", "stale", "totalBytes", "totals", "transactionCount",
  "uptimeSeconds",
]);

function safeHealth(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => SAFE_HEALTH_FIELDS.has(key)).map(([key, entry]) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return [key, Object.fromEntries(Object.entries(entry).filter(([, nested]) => typeof nested === "number" || typeof nested === "boolean"))];
    }
    if (typeof entry === "string") return [key, entry.slice(0, 128)];
    return [key, entry];
  }).filter(([, entry]) => entry !== undefined));
}

async function observed(check, fallback = {}) {
  try { return { healthy: true, ...safeHealth(await check()) }; }
  catch (error) { return { ...fallback, code: error?.code ?? "INTERNAL_ERROR", healthy: false }; }
}

export class EngineHealthService {
  constructor(options = {}) {
    if (!options.repository) throw new TypeError("Engine health requires a repository");
    this.repository = options.repository;
    this.searchIndex = options.searchIndex;
    this.audit = options.audit ?? options.repository.audit;
    this.baselines = options.baselines;
    this.executionGate = options.executionGate;
    this.telemetry = options.telemetry;
    this.integrations = options.integrations ?? {};
    this.backupStatus = options.backupStatus;
    this.clock = options.clock ?? { now: () => new Date().toISOString() };
  }

  async check() {
    const repository = await observed(() => this.repository.diagnose());
    const revision = repository.repositoryRevision;
    const index = this.searchIndex
      ? await observed(async () => {
        const state = await this.searchIndex.health();
        return { ...state, healthy: state.available === true && state.stale !== true && state.repositoryRevision === revision };
      })
      : { available: false, healthy: false, stale: true };
    const audit = this.audit ? await observed(() => this.audit.verify()) : { available: false, healthy: false };
    const baselines = this.baselines ? await observed(() => this.baselines.verify()) : { available: false, healthy: true };
    const queue = this.executionGate ? { available: true, ...this.executionGate.health() } : { available: false, healthy: true, queueDepth: 0 };
    const integrationEntries = Object.entries(this.integrations).sort(([left], [right]) => left.localeCompare(right));
    const integrations = Object.fromEntries(await Promise.all(integrationEntries.map(async ([name, integration]) => [name, await observed(async () => {
      const result = typeof integration === "function" ? await integration() : await integration.health();
      return { ...result, healthy: result?.healthy !== false };
    })])));
    const backup = this.backupStatus ? await observed(() => this.backupStatus()) : { available: false, healthy: true };
    const storage = await observed(() => storageUsage(this.repository.root));
    try {
      this.telemetry?.gauge?.("audit.healthy", audit.healthy ? 1 : 0);
      this.telemetry?.gauge?.("backup.healthy", backup.healthy ? 1 : 0);
      this.telemetry?.gauge?.("index.revision_lag", Number.isInteger(revision) && Number.isInteger(index.repositoryRevision) ? Math.max(0, revision - index.repositoryRevision) : 0);
      this.telemetry?.gauge?.("queue.depth", queue.queueDepth ?? 0);
      this.telemetry?.gauge?.("storage.bytes", storage.totalBytes ?? 0);
    } catch { /* health reporting remains available if telemetry export fails */ }
    const criticalHealthy = repository.healthy && audit.healthy;
    const supportingHealthy = index.healthy && queue.healthy && Object.values(integrations).every(({ healthy }) => healthy) && backup.healthy && storage.healthy;
    return {
      checks: { audit, backup, baselines, index, integrations, process: { healthy: true, uptimeSeconds: Math.floor(process.uptime()) }, queue, repository, storage },
      observedAt: new Date(this.clock.now()).toISOString(),
      schemaVersion: "1.0.0",
      status: criticalHealthy ? (supportingHealthy ? "healthy" : "degraded") : "unhealthy",
    };
  }
}
