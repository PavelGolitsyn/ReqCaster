export const TRACEABILITY_INDEX_VERSION = "1.0.0";

const endpointKey = (endpoint) => `${endpoint.kind}\u0000${endpoint.id}`;

function compactEndpoint(endpoint) {
  return {
    id: endpoint.id,
    kind: endpoint.kind,
    ...(endpoint.artifactType ? { artifactType: endpoint.artifactType } : {}),
    ...(endpoint.system ? { system: endpoint.system } : {}),
  };
}

export function buildTraceabilityIndex(documents, options = {}) {
  const relationships = [...documents.business.relationships, ...documents.software.relationships];
  const nodes = new Map();
  for (const requirement of [...documents.business.requirements, ...documents.software.requirements]) {
    nodes.set(endpointKey({ id: requirement.id, kind: "requirement" }), { id: requirement.id, kind: "requirement", level: requirement.level, retired: Boolean(requirement.retirement), version: requirement.version });
  }
  const edges = [];
  for (const relationship of relationships) {
    const source = compactEndpoint(relationship.source);
    const target = compactEndpoint(relationship.target);
    nodes.set(endpointKey(source), nodes.get(endpointKey(source)) ?? source);
    nodes.set(endpointKey(target), nodes.get(endpointKey(target)) ?? target);
    edges.push({
      id: relationship.id,
      retired: Boolean(relationship.retirement),
      source,
      status: relationship.status ?? (relationship.suspect ? "suspect" : "valid"),
      target,
      type: relationship.type,
      version: relationship.version,
    });
  }
  return {
    configurationVersion: String(options.configurationVersion ?? "1"),
    edges: edges.sort((left, right) => left.id.localeCompare(right.id)),
    indexVersion: TRACEABILITY_INDEX_VERSION,
    nodes: [...nodes.values()].sort((left, right) => endpointKey(left).localeCompare(endpointKey(right))),
    repositoryRevision: documents.business.repositoryRevision,
    schemaVersion: documents.business.schemaVersion,
  };
}
