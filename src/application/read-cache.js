export class AuthorizationPartitionedReadCache {
  constructor({ maximumEntries = 256 } = {}) {
    if (!Number.isInteger(maximumEntries) || maximumEntries < 1) throw new TypeError("maximumEntries must be positive");
    this.maximumEntries = maximumEntries;
    this.entries = new Map();
  }

  get(key) {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key);
    this.entries.delete(key);
    this.entries.set(key, value);
    return structuredClone(value);
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, structuredClone(value));
    while (this.entries.size > this.maximumEntries) this.entries.delete(this.entries.keys().next().value);
  }

  clear() {
    this.entries.clear();
  }
}
