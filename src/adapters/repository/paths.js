import { isAbsolute, join, relative, resolve } from "node:path";

const allowedFiles = new Set(["business-requirements.json", "software-requirements.json"]);

export function normalizeRequirementsRoot(configuredRoot) {
  if (typeof configuredRoot !== "string" || !isAbsolute(configuredRoot)) {
    throw new TypeError("Requirements root must be an absolute operator-configured path");
  }
  return resolve(configuredRoot);
}

export function canonicalDocumentPath(configuredRoot, filename) {
  const root = normalizeRequirementsRoot(configuredRoot);
  if (!allowedFiles.has(filename)) throw new TypeError("Canonical filename is not allowed");
  const candidate = resolve(root, filename);
  const relation = relative(root, candidate);
  if (relation.startsWith("..") || isAbsolute(relation)) throw new TypeError("Path escapes requirements root");
  return candidate;
}

export const CANONICAL_FILENAMES = Object.freeze([...allowedFiles]);
export const ENGINE_DIRECTORIES = Object.freeze([
  "schemas", "config", "locks", "transactions", "audit", "versions",
  "baselines", "indexes", "imports", "reports", "quarantine",
]);

export function enginePath(configuredRoot, ...segments) {
  const root = normalizeRequirementsRoot(configuredRoot);
  const candidate = resolve(root, ".engine", ...segments);
  const relation = relative(join(root, ".engine"), candidate);
  if (relation.startsWith("..") || isAbsolute(relation)) throw new TypeError("Path escapes engine directory");
  return candidate;
}
