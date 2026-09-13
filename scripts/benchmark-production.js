#!/usr/bin/env node
import { performance } from "node:perf_hooks";

import { projectedCurrentStateFixture } from "../fixtures/repositories/large.js";
import { canonicalHash, canonicalStringify, parseStrictJson } from "../src/adapters/repository/canonical-json.js";
import { buildSearchIndex, searchIndex } from "../src/index/search-index.js";

const size = Number(process.argv[2] ?? 100_000);
const repetitions = Number(process.argv[3] ?? 15);
if (!Number.isInteger(repetitions) || repetitions < 3 || repetitions > 100) throw new RangeError("repetitions must be between 3 and 100");

const round = (value) => Math.round(value * 100) / 100;
const percentile = (samples, fraction) => [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * fraction) - 1];
const measure = async (operation, count = repetitions) => {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    await operation();
    samples.push(performance.now() - started);
  }
  return { maximumMilliseconds: round(Math.max(...samples)), p50Milliseconds: round(percentile(samples, 0.5)), p95Milliseconds: round(percentile(samples, 0.95)), samples: samples.length };
};

const memoryBefore = process.memoryUsage().heapUsed;
const fixtureStarted = performance.now();
const documents = projectedCurrentStateFixture(size);
for (let index = 0; index < Math.min(5, documents.business.requirements.length - 1); index += 1) {
  documents.business.relationships.push({
    id: `RL-${String(index + 1).padStart(6, "0")}`,
    source: { id: documents.business.requirements[index].id, kind: "requirement" },
    status: "valid",
    target: { id: documents.business.requirements[index + 1].id, kind: "requirement" },
    type: "derives_from",
    version: 1,
  });
}
for (let index = 0; index < documents.software.requirements.length; index += 1) {
  const software = documents.software.requirements[index];
  const business = documents.business.requirements[index % documents.business.requirements.length];
  documents.software.relationships.push({
    id: `RL-${String(index + 6).padStart(6, "0")}`,
    source: { id: software.id, kind: "requirement" },
    status: "valid",
    target: { id: business.id, kind: "requirement" },
    type: "derives_from",
    version: 1,
  });
}
const fixtureMilliseconds = performance.now() - fixtureStarted;
const serialized = canonicalStringify(documents);
const startupValidation = await measure(() => parseStrictJson(Buffer.from(serialized), { maximumBytes: Buffer.byteLength(serialized) + 1 }), 3);
const rebuildStarted = performance.now();
const index = buildSearchIndex(documents, { configurationVersion: "1" });
const indexRebuildMilliseconds = performance.now() - rebuildStarted;
const byId = new Map([...documents.business.requirements, ...documents.software.requirements].map((requirement) => [requirement.id, requirement]));

let exactReadPosition = 0;
const exactReads = await measure(() => {
  exactReadPosition = (exactReadPosition + 7919) % size;
  const prefix = exactReadPosition < documents.business.requirements.length ? "BR" : "SR";
  const number = prefix === "BR" ? exactReadPosition + 1 : exactReadPosition - documents.business.requirements.length + 1;
  if (!byId.get(`${prefix}-${String(number).padStart(6, "0")}`)) throw new Error("exact read benchmark missed an expected ID");
}, 1_000);
const query = () => searchIndex(index, {
  filters: { criticality: ["safety-critical"], status: ["approved"], verificationMethod: ["test"] },
  query: "bounded search deterministic",
});
const multiFilterSearch = await measure(query);
const coverageGaps = await measure(() => index.entries.filter((entry) => entry.predicates.missingVerification).length);
const graph = new Map();
for (const edge of index.traceability.edges) {
  const values = graph.get(edge.source.id) ?? [];
  values.push(edge.target.id);
  graph.set(edge.source.id, values);
}
const fiveLevelTraceImpact = await measure(() => {
  let frontier = [documents.business.requirements[0].id];
  const visited = new Set(frontier);
  for (let depth = 0; depth < 5; depth += 1) {
    frontier = frontier.flatMap((id) => graph.get(id) ?? []).filter((id) => !visited.has(id));
    for (const id of frontier) visited.add(id);
  }
  return visited.size;
});
const operations = documents.business.requirements.slice(0, 500).map((requirement) => ({ expectedVersion: requirement.version, id: requirement.id, operation: "update", patch: { priority: "high" } }));
const bulkPreview = await measure(() => canonicalHash(operations));
const bulkCommit = await measure(() => structuredClone(documents.business.requirements.slice(0, 500)).map((requirement) => ({ ...requirement, priority: "high", version: requirement.version + 1 })));
const baselineComparison = await measure(() => documents.business.requirements.slice(0, 1_000).map((requirement) => ({ changed: requirement.priority !== "high", id: requirement.id })));
const rtmGeneration = await measure(() => index.traceability.edges.map((edge) => ({ relationshipId: edge.id, source: edge.source.id, target: edge.target.id, type: edge.type })));
const concurrentReaderBatch = await measure(() => Promise.all(Array.from({ length: 32 }, () => Promise.resolve().then(query))), 5);
const memoryAfter = process.memoryUsage().heapUsed;

process.stdout.write(`${JSON.stringify({
  environment: { architecture: process.arch, node: process.versions.node, platform: process.platform },
  fixture: { generationMilliseconds: round(fixtureMilliseconds), relationships: index.traceability.edges.length, requirements: size, serializedBytes: Buffer.byteLength(serialized) },
  memory: { heapGrowthBytes: memoryAfter - memoryBefore, heapUsedBytes: memoryAfter },
  operations: {
    baselineComparison,
    bulkCommit,
    bulkPreview,
    concurrentReaderBatch,
    coverageGaps,
    exactReads,
    fiveLevelTraceImpact,
    indexRebuild: { maximumMilliseconds: round(indexRebuildMilliseconds), p50Milliseconds: round(indexRebuildMilliseconds), p95Milliseconds: round(indexRebuildMilliseconds), samples: 1 },
    multiFilterSearch,
    rtmGeneration,
    startupValidation,
  },
  schemaVersion: "1.0.0",
}, null, 2)}\n`);
