#!/usr/bin/env node
import { performance } from "node:perf_hooks";

import { projectedCurrentStateFixture } from "../fixtures/repositories/large.js";
import { buildSearchIndex, searchIndex } from "../src/index/search-index.js";

const size = Number(process.argv[2] ?? 100_000);
const documents = projectedCurrentStateFixture(size);
const buildStarted = performance.now();
const index = buildSearchIndex(documents, { configurationVersion: "1" });
const buildMilliseconds = performance.now() - buildStarted;
const queryStarted = performance.now();
const results = searchIndex(index, {
  filters: { criticality: ["safety-critical"], status: ["approved"], verificationMethod: ["test"] },
  query: '"bounded search" deterministic',
});
const queryMilliseconds = performance.now() - queryStarted;

process.stdout.write(`${JSON.stringify({
  buildMilliseconds: Math.round(buildMilliseconds * 100) / 100,
  indexedRequirements: index.entries.length,
  matchedRequirements: results.length,
  queryMilliseconds: Math.round(queryMilliseconds * 100) / 100,
  repositoryRevision: index.repositoryRevision,
}, null, 2)}\n`);
