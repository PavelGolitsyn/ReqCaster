import { mkdir, open, readFile, rmdir, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import { canonicalBytes, parseStrictJson } from "./canonical-json.js";
import { RepositoryBusyError } from "./errors.js";

const DEFAULT_LEASE_MS = 30_000;

async function processExists(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "EPERM"; }
}

async function stale(lockPath, leaseMilliseconds) {
  try {
    const metadata = parseStrictJson(await readFile(`${lockPath}/owner.json`), { maximumBytes: 4096 });
    if (!metadata || Object.keys(metadata).sort().join(",") !== "acquiredAt,pid" || !Number.isInteger(metadata.pid) || metadata.pid < 1 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(metadata.acquiredAt) || new Date(metadata.acquiredAt).toISOString() !== metadata.acquiredAt) throw new TypeError("Invalid lock metadata");
    const age = Date.now() - Date.parse(metadata.acquiredAt);
    return age > leaseMilliseconds && !(await processExists(metadata.pid));
  } catch {
    try { return Date.now() - (await stat(lockPath)).mtimeMs > leaseMilliseconds; }
    catch { return false; }
  }
}

async function release(lockPath) {
  try { await unlink(`${lockPath}/owner.json`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  try { await rmdir(lockPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

export async function acquireProjectLock(lockPath, options = {}) {
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 5_000;
  const leaseMilliseconds = options.leaseMilliseconds ?? DEFAULT_LEASE_MS;
  const started = Date.now();
  await mkdir(dirname(lockPath), { recursive: true });
  while (true) {
    try {
      await mkdir(lockPath);
      const handle = await open(`${lockPath}/owner.json`, "wx", 0o600);
      try {
        await handle.writeFile(canonicalBytes({ acquiredAt: new Date().toISOString(), pid: process.pid }));
        await handle.sync();
      } finally { await handle.close(); }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await release(lockPath);
      };
    } catch (error) {
      if (error.code !== "EEXIST") {
        try { await release(lockPath); } catch { /* retain the original failure */ }
        throw error;
      }
      if (await stale(lockPath, leaseMilliseconds)) {
        try { await release(lockPath); continue; } catch { /* another contender won */ }
      }
      if (Date.now() - started >= timeoutMilliseconds) throw new RepositoryBusyError();
      await new Promise((resolve) => setTimeout(resolve, Math.min(25, timeoutMilliseconds)));
    }
  }
}
