import { ApplicationError } from "../application/errors.js";

const SAFE_KEYS = new Set([
  "active", "auditEvents", "available", "backupAgeSeconds", "baselineCount",
  "code", "completed", "correlationId", "counts", "deadline", "decision",
  "durationMilliseconds", "errorCategory", "event", "failed", "healthy",
  "indexRevision", "integration", "level", "maximum", "operation", "outcome",
  "policyVersion", "queueDepth", "queued", "rejected", "repositoryRevision",
  "retryable", "role", "schemaVersion", "stale", "status", "timestamp",
  "timedOut", "totalBytes", "transactionCount", "truncated",
]);

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function safeValue(value, key) {
  if (value === null || typeof value === "boolean" || finiteNumber(value)) return value;
  if (typeof value === "string") return value.slice(0, 256);
  if (Array.isArray(value)) return value.slice(0, 64).map((entry) => safeValue(entry, key)).filter((entry) => entry !== undefined);
  if (value && typeof value === "object") return sanitizeOperationalMetadata(value);
  return undefined;
}

/**
 * Operational records are allowlisted by field name. Requirement bodies,
 * credentials, request payloads, errors, and arbitrary extension values are
 * therefore omitted rather than heuristically redacted after collection.
 */
export function sanitizeOperationalMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata)
    .filter(([key]) => SAFE_KEYS.has(key))
    .map(([key, value]) => [key, safeValue(value, key)])
    .filter(([, value]) => value !== undefined));
}

export class OperationalTelemetry {
  constructor(options = {}) {
    this.clock = options.clock ?? { now: () => new Date().toISOString() };
    this.maximumEvents = options.maximumEvents ?? 1_000;
    this.sink = options.sink;
    this.events = [];
    this.operations = new Map();
    this.gauges = new Map();
    this.counters = new Map();
    if (!Number.isInteger(this.maximumEvents) || this.maximumEvents < 1) throw new TypeError("Telemetry event limit must be positive");
  }

  log(level, event, metadata = {}) {
    if (!new Set(["debug", "info", "warn", "error"]).has(level)) throw new TypeError("Operational log level is invalid");
    if (!/^[a-z][a-z0-9.-]{0,63}$/u.test(event ?? "")) throw new TypeError("Operational event name is invalid");
    const record = Object.freeze({
      event,
      level,
      timestamp: new Date(this.clock.now()).toISOString(),
      ...sanitizeOperationalMetadata(metadata),
    });
    this.events.push(record);
    if (this.events.length > this.maximumEvents) this.events.shift();
    try { this.sink?.(structuredClone(record)); }
    catch { /* telemetry export must not change the governed operation outcome */ }
    return structuredClone(record);
  }

  recordOperation(metadata = {}) {
    const operation = typeof metadata.operation === "string" ? metadata.operation.slice(0, 128) : "unknown";
    const outcome = typeof metadata.outcome === "string" ? metadata.outcome.slice(0, 32) : "unknown";
    const key = `${operation}\u0000${outcome}`;
    const current = this.operations.get(key) ?? { count: 0, durationMilliseconds: 0, maximumDurationMilliseconds: 0, operation, outcome };
    const duration = finiteNumber(metadata.durationMilliseconds) && metadata.durationMilliseconds >= 0 ? metadata.durationMilliseconds : 0;
    current.count += 1;
    current.durationMilliseconds += duration;
    current.maximumDurationMilliseconds = Math.max(current.maximumDurationMilliseconds, duration);
    this.operations.set(key, current);
    return this.log(outcome === "success" ? "info" : "warn", "operation.completed", metadata);
  }

  gauge(name, value) {
    if (!/^[a-z][a-z0-9_.-]{0,63}$/u.test(name ?? "") || !finiteNumber(value)) throw new TypeError("Operational gauge is invalid");
    this.gauges.set(name, value);
  }

  increment(name, amount = 1) {
    if (!/^[a-z][a-z0-9_.-]{0,63}$/u.test(name ?? "") || !finiteNumber(amount) || amount <= 0) throw new TypeError("Operational counter is invalid");
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  snapshot() {
    return {
      counters: Object.fromEntries([...this.counters].sort(([left], [right]) => left.localeCompare(right))),
      events: this.events.map((record) => structuredClone(record)),
      gauges: Object.fromEntries([...this.gauges].sort(([left], [right]) => left.localeCompare(right))),
      operations: [...this.operations.values()].sort((left, right) => left.operation.localeCompare(right.operation) || left.outcome.localeCompare(right.outcome)).map((entry) => ({
        ...structuredClone(entry),
        averageDurationMilliseconds: entry.count ? entry.durationMilliseconds / entry.count : 0,
      })),
      schemaVersion: "1.0.0",
    };
  }
}

function cancellationError() {
  return new ApplicationError("CANCELLED", "Operation was cancelled", { retryable: true });
}

function timeoutError() {
  return new ApplicationError("TIMEOUT", "Operation exceeded its execution deadline", { retryable: true });
}

/** A bounded FIFO admission gate. Timed-out work retains its slot until it settles. */
export class BoundedExecutionGate {
  constructor(options = {}) {
    this.maximumConcurrent = options.maximumConcurrent ?? 32;
    this.maximumQueue = options.maximumQueue ?? 128;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 30_000;
    this.telemetry = options.telemetry;
    for (const [name, value] of Object.entries({ maximumConcurrent: this.maximumConcurrent, maximumQueue: this.maximumQueue, timeoutMilliseconds: this.timeoutMilliseconds })) {
      if (!Number.isInteger(value) || value < (name === "maximumQueue" ? 0 : 1)) throw new TypeError(`${name} must be a valid bounded-execution limit`);
    }
    this.active = 0;
    this.queue = [];
    this.totals = { cancelled: 0, completed: 0, failed: 0, rejected: 0, timedOut: 0 };
    this.highWater = { active: 0, queued: 0 };
  }

  run(operation, task, options = {}) {
    if (typeof task !== "function") throw new TypeError("Bounded execution requires a task function");
    if (options.signal?.aborted) return Promise.reject(cancellationError());
    const timeoutMilliseconds = options.timeoutMilliseconds ?? this.timeoutMilliseconds;
    if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > this.timeoutMilliseconds) {
      return Promise.reject(new ApplicationError("INVALID_ARGUMENT", "Requested timeout exceeds the configured execution limit"));
    }
    if (this.active >= this.maximumConcurrent && this.queue.length >= this.maximumQueue) {
      this.totals.rejected += 1;
      this.#metric("increment", "queue.rejections");
      this.#publish();
      return Promise.reject(new ApplicationError("SERVICE_UNAVAILABLE", "Operation queue is full", { retryable: true }));
    }
    return new Promise((resolve, reject) => {
      const entry = {
        deadline: Date.now() + timeoutMilliseconds,
        operation: typeof operation === "string" ? operation : "unknown",
        reject,
        resolve,
        signal: options.signal,
        task,
      };
      if (this.active < this.maximumConcurrent) this.#start(entry);
      else {
        entry.onAbort = () => {
          const position = this.queue.indexOf(entry);
          if (position < 0) return;
          this.queue.splice(position, 1);
          this.totals.cancelled += 1;
          this.#metric("increment", "operations.cancelled");
          clearTimeout(entry.queueTimer);
          reject(cancellationError());
          this.#publish();
        };
        options.signal?.addEventListener("abort", entry.onAbort, { once: true });
        this.queue.push(entry);
        entry.queueTimer = setTimeout(() => {
          const position = this.queue.indexOf(entry);
          if (position < 0) return;
          this.queue.splice(position, 1);
          entry.signal?.removeEventListener("abort", entry.onAbort);
          this.totals.timedOut += 1;
          this.#metric("increment", "operations.timeouts");
          reject(timeoutError());
          this.#publish();
        }, timeoutMilliseconds);
        this.highWater.queued = Math.max(this.highWater.queued, this.queue.length);
        this.#publish();
      }
    });
  }

  health() {
    return {
      active: this.active,
      healthy: this.queue.length < this.maximumQueue,
      highWater: structuredClone(this.highWater),
      maximumConcurrent: this.maximumConcurrent,
      maximumQueue: this.maximumQueue,
      queueDepth: this.queue.length,
      totals: structuredClone(this.totals),
    };
  }

  #start(entry) {
    clearTimeout(entry.queueTimer);
    entry.signal?.removeEventListener("abort", entry.onAbort);
    const remaining = entry.deadline - Date.now();
    if (remaining <= 0) {
      this.totals.timedOut += 1;
      this.#metric("increment", "operations.timeouts");
      entry.reject(timeoutError());
      this.#drain();
      return;
    }
    this.active += 1;
    this.highWater.active = Math.max(this.highWater.active, this.active);
    this.#publish();
    const controller = new AbortController();
    let returned = false;
    const settle = (method, value) => {
      if (returned) return false;
      returned = true;
      method(value);
      return true;
    };
    const onAbort = () => {
      if (returned) return;
      controller.abort();
      if (settle(entry.reject, cancellationError())) {
        this.totals.cancelled += 1;
        this.#metric("increment", "operations.cancelled");
      }
      this.#publish();
    };
    entry.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      if (returned) return;
      controller.abort();
      if (settle(entry.reject, timeoutError())) {
        this.totals.timedOut += 1;
        this.#metric("increment", "operations.timeouts");
      }
      this.#publish();
    }, remaining);
    Promise.resolve().then(() => entry.task({ deadline: entry.deadline, signal: controller.signal })).then(
      (value) => { if (settle(entry.resolve, value)) this.totals.completed += 1; },
      (error) => { if (settle(entry.reject, error)) this.totals.failed += 1; },
    ).finally(() => {
      clearTimeout(timer);
      entry.signal?.removeEventListener("abort", onAbort);
      this.active -= 1;
      this.#drain();
    });
  }

  #drain() {
    while (this.active < this.maximumConcurrent && this.queue.length) this.#start(this.queue.shift());
    this.#publish();
  }

  #publish() {
    this.#metric("gauge", "queue.depth", this.queue.length);
    this.#metric("gauge", "operations.active", this.active);
  }

  #metric(method, ...arguments_) {
    try { this.telemetry?.[method]?.(...arguments_); }
    catch { /* telemetry cannot change admission or execution outcomes */ }
  }
}
