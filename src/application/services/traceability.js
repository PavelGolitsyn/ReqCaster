import { canonicalHash } from "../../adapters/repository/canonical-json.js";
import { parseRelationshipId, parseRequirementId } from "../../domain/identifiers.js";
import { ApplicationError } from "../errors.js";
import { CursorCodec } from "./reads.js";

const RELATIONSHIP_STATUSES = new Set(["valid", "suspect", "invalid", "waived"]);
const DEFAULT_TRAVERSAL = Object.freeze({
  conflicts_with: "horizontal",
  constrained_by: "upstream",
  decomposes: "downstream",
  depends_on: "upstream",
  derives_from: "upstream",
  implements: "upstream",
  mitigates: "upstream",
  supersedes: "horizontal",
  validated_by: "downstream",
  verified_by: "downstream",
  verifies: "upstream",
});

const clone = (value) => structuredClone(value);
const endpointKey = (endpoint) => `${endpoint.kind}\u0000${endpoint.id}`;
const allRequirements = (documents) => [...documents.business.requirements, ...documents.software.requirements];
const allRelationships = (documents) => [...documents.business.relationships, ...documents.software.relationships];
const activeRelationship = (relationship) => !relationship.retirement;
const activeRequirement = (requirement) => !requirement.retirement && requirement.status !== "retired";
const relationshipStatus = (relationship) => relationship.status ?? (relationship.suspect ? "suspect" : "valid");
const defined = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

function endpointsVisible(relationship, allowedIds) {
  return [relationship.source, relationship.target].every((endpoint) => endpoint.kind !== "requirement" || allowedIds.has(endpoint.id));
}

function canonicalTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApplicationError("INVALID_ARGUMENT", "The trusted clock returned an invalid timestamp");
  return parsed.toISOString();
}

function actor(context) {
  return context.identity?.agentId ?? "unknown-agent";
}

function principal(context) {
  return context.identity?.principal?.id ?? "unknown-principal";
}

function operationResponse(request, repositoryRevision, data, source, page) {
  return {
    correlationId: request.correlationId,
    data,
    ...(page ? { page } : {}),
    repositoryRevision,
    schemaVersion: "1.0.0",
    ...(source ? { source } : {}),
  };
}

function applicationError(error) {
  if (error instanceof ApplicationError) return error;
  const known = new Set(["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "FORBIDDEN", "VERSION_CONFLICT", "REPOSITORY_BUSY", "INTEGRITY_FAILURE"]);
  const recognized = known.has(error?.code);
  return new ApplicationError(recognized ? error.code : "INTERNAL_ERROR", recognized ? error.message : "The traceability operation could not be completed", {
    cause: error,
    details: error?.details ?? [],
    retryable: error?.code === "REPOSITORY_BUSY",
  });
}

function identityScope(identity, operation) {
  return `${operation}:${identity?.principal?.id ?? "unknown"}:${identity?.agentId ?? "unknown"}`;
}

function commandHash(request) {
  const normalized = clone(request);
  delete normalized.correlationId;
  delete normalized.idempotencyKey;
  return canonicalHash(normalized);
}

function requirementMap(documents) {
  return new Map(allRequirements(documents).map((item) => [item.id, item]));
}

function relationshipLocation(documents, id) {
  for (const level of ["business", "software"]) {
    const index = documents[level].relationships.findIndex((relationship) => relationship.id === id);
    if (index >= 0) return { document: documents[level], index, relationship: documents[level].relationships[index] };
  }
  return null;
}

function ownerDocument(documents, source, target) {
  const owner = source.kind === "requirement" ? source : target.kind === "requirement" ? target : null;
  const level = parseRequirementId(owner?.id)?.level;
  if (!level) throw new ApplicationError("INVALID_ARGUMENT", "At least one relationship endpoint must be an internal requirement");
  return documents[level];
}

function externalKind(endpoint) {
  if (endpoint.kind !== "external") return endpoint.kind;
  return endpoint.artifactType ? `external:${endpoint.artifactType}` : endpoint.kind;
}

function normalizeEndpoint(endpoint, legacyId, legacyVersion) {
  const value = endpoint ? clone(endpoint) : legacyId ? { id: legacyId, kind: parseRequirementId(legacyId) ? "requirement" : "external:component" } : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApplicationError("INVALID_ARGUMENT", "Both relationship endpoints are required");
  value.kind = externalKind(value);
  if (value.kind === "requirement") {
    if (!parseRequirementId(value.id)) throw new ApplicationError("INVALID_ARGUMENT", "Requirement endpoints must use canonical requirement IDs");
    if (value.version === undefined && legacyVersion !== undefined) value.version = legacyVersion;
    return value;
  }
  if (!value.kind.startsWith("external:")) throw new ApplicationError("INVALID_ARGUMENT", "External endpoint kind must identify an artifact type");
  const artifactType = value.artifactType ?? value.kind.slice("external:".length);
  if (!value.system || !artifactType || !value.externalId || !value.systemOfRecord) {
    if (endpoint) throw new ApplicationError("INVALID_ARGUMENT", "External endpoints require system, artifactType, externalId, and systemOfRecord metadata");
    value.system = "legacy";
    value.artifactType = artifactType;
    value.externalId = value.id;
    value.systemOfRecord = "legacy";
  } else value.artifactType = artifactType;
  value.id ??= `${value.system}:${value.artifactType}:${value.externalId}`;
  if (value.id.length > 256) throw new ApplicationError("INVALID_ARGUMENT", "External endpoint identity exceeds the supported size");
  delete value.version;
  return value;
}

function assertEndpoint(endpoint, requirements, context, expectedVersion, path) {
  if (endpoint.kind !== "requirement") return;
  const item = requirements.get(endpoint.id);
  if (!item || !activeRequirement(item) || (context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, item))) {
    throw new ApplicationError("NOT_FOUND", "Relationship endpoint was not found");
  }
  const supplied = endpoint.version ?? expectedVersion;
  if (supplied === undefined) throw new ApplicationError("INVALID_ARGUMENT", "Expected item versions are required for internal relationship endpoints");
  if (item.version !== supplied) throw new ApplicationError("VERSION_CONFLICT", "Expected endpoint version does not match current version", {
    current: { itemVersion: item.version },
    details: [{ path: `${path}/version`, reason: `current item version is ${item.version}` }],
  });
  endpoint.version = supplied;
}

function assertRelationshipScope(relationship, requirements, context) {
  for (const endpoint of [relationship.source, relationship.target]) {
    if (endpoint.kind !== "requirement") continue;
    const item = requirements.get(endpoint.id);
    if (!item || (context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, item))) throw new ApplicationError("NOT_FOUND", "Relationship was not found");
  }
}

function kindForRule(endpoint) {
  return endpoint.kind === "requirement" ? parseRequirementId(endpoint.id)?.level : endpoint.kind;
}

function ruleFor(policy, type) {
  const rule = policy.relationships.find((candidate) => candidate.type === type);
  if (!rule) throw new ApplicationError("INVALID_ARGUMENT", "Relationship type is not configured");
  return rule;
}

function assertRuleEndpoints(rule, source, target) {
  if (!rule.sourceKinds.includes(kindForRule(source)) || !rule.targetKinds.includes(kindForRule(target))) {
    throw new ApplicationError("INVALID_ARGUMENT", "Endpoint kinds are prohibited for this relationship type");
  }
}

function sameEndpoint(left, right) {
  return left.kind === right.kind && left.id === right.id;
}

function assertNoDuplicate(relationships, rule, source, target) {
  const duplicate = relationships.find((relationship) => activeRelationship(relationship) && relationship.type === rule.type && (
    (sameEndpoint(relationship.source, source) && sameEndpoint(relationship.target, target))
    || (rule.symmetric && sameEndpoint(relationship.source, target) && sameEndpoint(relationship.target, source))
  ));
  if (duplicate) throw new ApplicationError("INVALID_ARGUMENT", "An active equivalent relationship already exists", { details: [{ path: "/relationshipType", reason: duplicate.id }] });
}

function wouldCreateCycle(relationships, source, target, type) {
  if (source.kind !== "requirement" || target.kind !== "requirement") return false;
  const adjacency = new Map();
  for (const relationship of relationships) {
    if (!activeRelationship(relationship) || relationship.type !== type || relationship.source.kind !== "requirement" || relationship.target.kind !== "requirement") continue;
    const next = adjacency.get(relationship.source.id) ?? [];
    next.push(relationship.target.id);
    adjacency.set(relationship.source.id, next);
  }
  const pending = [target.id];
  const seen = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (id === source.id) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(adjacency.get(id) ?? []));
  }
  return false;
}

function relationshipProvenance(context, source) {
  const now = canonicalTimestamp(context.now);
  return {
    accountablePrincipal: principal(context),
    createdAt: now,
    createdBy: actor(context),
    source,
    updatedAt: now,
    updatedBy: actor(context),
  };
}

function historyEntry(action, context, status, details = {}) {
  return { action, at: canonicalTimestamp(context.now), by: actor(context), status, ...clone(details) };
}

function idempotency(request, context, operation) {
  return { correlationId: request.correlationId, key: request.idempotencyKey, requestHash: commandHash(request), scope: identityScope(context.identity, operation) };
}

class TraceabilityCommandService {
  constructor(options) {
    if (!options.repository?.execute) throw new TypeError("A Repository port is required");
    this.repository = options.repository;
    this.configuredPolicy = options.policy;
    this.audit = options.audit;
  }

  async policy() {
    return this.configuredPolicy ? clone(this.configuredPolicy) : this.repository.getPolicy();
  }

  async mutate(request, context, operation, mutator) {
    try {
      const result = await this.repository.execute(mutator, {
        actor: actor(context),
        expectedRepositoryRevision: request.expectedRepositoryRevision,
        idempotency: idempotency(request, context, operation),
        provenance: { agentRole: context.identity?.role, changeRequestId: request.changeId, command: operation, correlationId: request.correlationId, principalId: principal(context), reason: request.rationale, role: context.identity?.role },
      });
      if (result.committed && this.audit?.append) await this.audit.append({
        agentId: actor(context), correlationId: request.correlationId, event: "traceability-mutation", operation,
        principalId: principal(context), repositoryRevision: result.repositoryRevision, timestamp: canonicalTimestamp(context.now),
      });
      return operationResponse(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
    } catch (error) { throw applicationError(error); }
  }
}

export class LinkRequirementService extends TraceabilityCommandService {
  async execute(request, context) {
    const policy = await this.policy();
    return this.mutate(request, context, "requirements.link", (documents, allocation) => {
      const source = normalizeEndpoint(request.source, request.sourceId, request.sourceExpectedVersion);
      const target = normalizeEndpoint(request.target, request.targetId, request.targetExpectedVersion);
      if (sameEndpoint(source, target)) throw new ApplicationError("INVALID_ARGUMENT", "A relationship cannot link an endpoint to itself");
      const requirements = requirementMap(documents);
      assertEndpoint(source, requirements, context, request.sourceExpectedVersion, "/source");
      assertEndpoint(target, requirements, context, request.targetExpectedVersion, "/target");
      const rule = ruleFor(policy, request.relationshipType);
      assertRuleEndpoints(rule, source, target);
      if (rule.type === "supersedes" && !requirements.get(target.id)?.retirement) throw new ApplicationError("INVALID_ARGUMENT", "A supersedes relationship must target a retired requirement");
      if (rule.rationaleRequired !== false && !request.rationale) throw new ApplicationError("INVALID_ARGUMENT", "A rationale is required by relationship policy");
      const relationships = allRelationships(documents);
      assertNoDuplicate(relationships, rule, source, target);
      const currentTargets = relationships.filter((relationship) => activeRelationship(relationship) && relationship.type === rule.type && sameEndpoint(relationship.source, source)).length;
      if (currentTargets >= rule.maxTargets) throw new ApplicationError("INVALID_ARGUMENT", "Configured relationship cardinality would be exceeded");
      if (rule.allowCycles !== true && !rule.symmetric && wouldCreateCycle(relationships, source, target, rule.type)) {
        throw new ApplicationError("INVALID_ARGUMENT", "Relationship would create a prohibited cycle");
      }
      const provenance = relationshipProvenance(context, "requirements.link");
      const record = {
        history: [historyEntry("created", context, "valid", request.rationale ? { rationale: request.rationale } : {})],
        id: allocation.allocateRelationshipId(),
        provenance,
        ...(request.rationale ? { rationale: request.rationale } : {}),
        source,
        status: "valid",
        suspect: false,
        target,
        type: rule.type,
        version: 1,
      };
      ownerDocument(documents, source, target).relationships.push(record);
      return { relationship: clone(record) };
    });
  }
}

export class UnlinkRequirementService extends TraceabilityCommandService {
  async execute(request, context) {
    return this.mutate(request, context, "requirements.unlink", (documents) => {
      const located = relationshipLocation(documents, request.id);
      if (!located || !activeRelationship(located.relationship)) throw new ApplicationError("NOT_FOUND", "Relationship was not found");
      assertRelationshipScope(located.relationship, requirementMap(documents), context);
      if (located.relationship.version !== request.expectedVersion) throw new ApplicationError("VERSION_CONFLICT", "Expected relationship version does not match current version", {
        current: { itemVersion: located.relationship.version, repositoryRevision: documents.business.repositoryRevision },
      });
      const now = canonicalTimestamp(context.now);
      const relationship = located.relationship;
      relationship.retirement = { rationale: request.rationale, retiredAt: now, retiredBy: actor(context) };
      relationship.history = [...(relationship.history ?? []), historyEntry("retired", context, relationshipStatus(relationship), { rationale: request.rationale })];
      relationship.provenance = { ...relationship.provenance, updatedAt: now, updatedBy: actor(context) };
      relationship.version += 1;
      return { relationship: clone(relationship) };
    });
  }
}

export class ReassessRelationshipService extends TraceabilityCommandService {
  async execute(request, context) {
    return this.mutate(request, context, "requirements.reassessLink", (documents) => {
      const located = relationshipLocation(documents, request.id);
      if (!located || !activeRelationship(located.relationship)) throw new ApplicationError("NOT_FOUND", "Relationship was not found");
      const relationship = located.relationship;
      assertRelationshipScope(relationship, requirementMap(documents), context);
      if (relationship.version !== request.expectedVersion) throw new ApplicationError("VERSION_CONFLICT", "Expected relationship version does not match current version", {
        current: { itemVersion: relationship.version, repositoryRevision: documents.business.repositoryRevision },
      });
      if (!relationship.suspect && relationshipStatus(relationship) === "valid") throw new ApplicationError("INVALID_ARGUMENT", "Only unresolved suspect, invalid, or waived relationships can be reassessed");
      const status = request.assessment === "waived" ? "waived" : request.assessment === "removed" ? "invalid" : "valid";
      if (request.assessment === "updated") {
        const requirements = requirementMap(documents);
        for (const endpoint of [relationship.source, relationship.target]) if (endpoint.kind === "requirement") endpoint.version = requirements.get(endpoint.id).version;
      }
      relationship.status = status;
      relationship.suspect = false;
      relationship.history = [...(relationship.history ?? []), historyEntry("reassessed", context, status, { assessment: request.assessment, rationale: request.rationale })];
      const now = canonicalTimestamp(context.now);
      relationship.provenance = { ...relationship.provenance, accountablePrincipal: principal(context), updatedAt: now, updatedBy: actor(context) };
      if (request.assessment === "removed") relationship.retirement = { rationale: request.rationale, retiredAt: now, retiredBy: actor(context) };
      relationship.version += 1;
      return { relationship: clone(relationship) };
    });
  }
}

export function markRelationshipsSuspect(documents, itemId, changedFields, context, policy, trigger = "content-change") {
  const item = requirementMap(documents).get(itemId);
  if (!item) return [];
  const marked = [];
  for (const relationship of allRelationships(documents)) {
    if (!activeRelationship(relationship)) continue;
    const side = relationship.source?.kind === "requirement" && relationship.source.id === itemId ? "source" : relationship.target?.kind === "requirement" && relationship.target.id === itemId ? "target" : null;
    if (!side) continue;
    const rule = policy.relationships.find((candidate) => candidate.type === relationship.type);
    const triggerName = `${side}-${trigger}`;
    if (!rule?.suspectOn?.includes(triggerName)) continue;
    relationship.status = "suspect";
    relationship.suspect = true;
    relationship.history = [...(relationship.history ?? []), historyEntry("suspect-marked", context, "suspect", {
      changedFields: [...changedFields].sort(),
      reason: trigger === "retirement" ? `${itemId} was retired` : `${itemId} changed material fields`,
      rule: triggerName,
      triggeringItemVersion: item.version,
    })];
    relationship.provenance = { ...relationship.provenance, updatedAt: canonicalTimestamp(context.now), updatedBy: actor(context) };
    relationship.version += 1;
    marked.push({ id: relationship.id, rule: triggerName, version: relationship.version });
  }
  return marked;
}

async function selectSnapshot(repository, snapshotProvider, request) {
  if (request.baselineId) {
    if (!snapshotProvider) throw new ApplicationError("NOT_FOUND", "The selected requirements context was not found");
    const snapshot = snapshotProvider.readBaseline ? await snapshotProvider.readBaseline(request.baselineId) : await snapshotProvider.read({ baselineId: request.baselineId });
    if (!snapshot) throw new ApplicationError("NOT_FOUND", "The selected requirements context was not found");
    const documents = snapshot.documents ?? snapshot;
    if (!Number.isInteger(documents?.business?.repositoryRevision) || documents.business.repositoryRevision !== documents?.software?.repositoryRevision) throw new ApplicationError("INTEGRITY_FAILURE", "The selected repository snapshot is inconsistent");
    return { documents, policy: snapshot.policy, source: { baselineId: request.baselineId, kind: "baseline", repositoryRevision: documents.business.repositoryRevision } };
  }
  const documents = await repository.read();
  if (!Number.isInteger(documents?.business?.repositoryRevision) || documents.business.repositoryRevision !== documents?.software?.repositoryRevision) throw new ApplicationError("INTEGRITY_FAILURE", "The selected repository snapshot is inconsistent");
  return { documents, source: { kind: "current", repositoryRevision: documents.business.repositoryRevision } };
}

function readContext(context, authorization) {
  const evaluator = context.authorization ?? authorization;
  if (!evaluator) throw new TypeError("An Authorization port is required");
  const decision = context.security ?? evaluator.evaluate(context.identity, "requirements:read", { now: context.now });
  if (!decision.allowed) throw new ApplicationError("FORBIDDEN", "Caller is not authorized for this operation");
  return { authorization: evaluator, decision };
}

function opposite(direction) {
  return direction === "upstream" ? "downstream" : direction === "downstream" ? "upstream" : "horizontal";
}

function movement(relationship, fromSource, policy) {
  const configured = policy.relationships.find(({ type }) => type === relationship.type)?.traversal;
  const sourceDirection = configured ?? DEFAULT_TRAVERSAL[relationship.type] ?? "downstream";
  return fromSource ? sourceDirection : opposite(sourceDirection);
}

function permittedStatus(relationship, request) {
  const status = relationshipStatus(relationship);
  if (status === "suspect" && request.includeSuspect === false) return false;
  if (status === "invalid" && !request.includeInvalid) return false;
  if (status === "waived" && !request.includeWaived) return false;
  return true;
}

function nodeFor(endpoint, requirements, distance, authorization, decision, projection = "compact") {
  if (endpoint.kind !== "requirement") {
    const expanded = projection === "expanded" && !decision.fieldRestricted
      ? defined({ externalId: endpoint.externalId, externalVersion: endpoint.externalVersion, system: endpoint.system, systemOfRecord: endpoint.systemOfRecord, uri: endpoint.uri })
      : {};
    return { artifactType: endpoint.artifactType ?? endpoint.kind.slice("external:".length), distance, external: true, id: endpoint.id, kind: endpoint.kind, ...expanded };
  }
  const requirement = requirements.get(endpoint.id);
  const fields = authorization.allowedFields(decision, ["id", "level", "version", "shortLabel", "statement", "status", "owner", "criticality", "customAttributes"]);
  const summary = Object.fromEntries(fields.filter((field) => requirement[field] !== undefined && (projection === "expanded" || !new Set(["statement", "customAttributes"]).has(field))).map((field) => {
    if (field !== "customAttributes") return [field, clone(requirement[field])];
    return [field, Object.fromEntries(Object.entries(requirement.customAttributes ?? {}).filter(([key]) => !key.startsWith("confidential.") && !key.startsWith("secret.")))];
  }));
  const release = requirement.release ?? requirement.customAttributes?.release;
  const variant = requirement.variant ?? requirement.customAttributes?.variant;
  const mayExpose = (field) => !decision.fieldRestricted || decision.fields.includes(field) || decision.fields.includes("customAttributes");
  return { ...summary, artifactType: "requirement", distance, external: false, id: endpoint.id, kind: "requirement", ...(release === undefined || !mayExpose("release") ? {} : { release: clone(release) }), ...(variant === undefined || !mayExpose("variant") ? {} : { variant: clone(variant) }) };
}

function pathRelationship(relationship, direction) {
  return { direction, id: relationship.id, status: relationshipStatus(relationship), suspect: relationship.suspect, type: relationship.type, version: relationship.version };
}

function validateStarts(request, documents, requirements, authorization, decision) {
  const selectors = [request.id, request.ids, request.starts].filter((value) => value !== undefined);
  if (selectors.length !== 1) throw new ApplicationError("INVALID_ARGUMENT", "Choose exactly one of id, ids, or starts");
  const endpoints = request.starts?.map((endpoint) => normalizeEndpoint(endpoint)) ?? (request.ids ?? [request.id]).map((id) => ({ id, kind: "requirement" }));
  if (!endpoints.length || endpoints.length > 50 || new Set(endpoints.map(endpointKey)).size !== endpoints.length) throw new ApplicationError("INVALID_ARGUMENT", "One to fifty unique starting endpoints are required");
  for (const endpoint of endpoints) {
    if (endpoint.kind === "requirement") {
      const item = requirements.get(endpoint.id);
      if (!item || !authorization.canReadItem(decision, item) || (!request.includeRetired && !activeRequirement(item))) throw new ApplicationError("NOT_FOUND", "Starting endpoint was not found");
      continue;
    }
    const visibleRelationship = allRelationships(documents).find((relationship) => activeRelationship(relationship) && (sameEndpoint(relationship.source, endpoint) || sameEndpoint(relationship.target, endpoint)) && [relationship.source, relationship.target].every((candidate) => candidate.kind !== "requirement" || authorization.canReadItem(decision, requirements.get(candidate.id))));
    if (!visibleRelationship) throw new ApplicationError("NOT_FOUND", "Starting endpoint was not found");
  }
  return endpoints;
}

function graphResult(documents, request, context, authorization, decision, policy) {
  const requirements = requirementMap(documents);
  const starts = validateStarts(request, documents, requirements, authorization, decision);
  const maximumDepth = policy.limits?.graphDepthMaximum ?? 5;
  const depth = request.depth ?? maximumDepth;
  if (!Number.isInteger(depth) || depth < 1 || depth > maximumDepth) throw new ApplicationError("INVALID_ARGUMENT", `Depth must be between 1 and ${maximumDepth}`);
  const maximumNodes = policy.limits?.graphNodeMaximum ?? 1000;
  const nodeLimit = request.nodeLimit ?? maximumNodes;
  if (!Number.isInteger(nodeLimit) || nodeLimit < starts.length || nodeLimit > maximumNodes) throw new ApplicationError("INVALID_ARGUMENT", `Node limit must be between ${starts.length} and ${maximumNodes}`);
  const relationships = allRelationships(documents).filter((relationship) => activeRelationship(relationship) && permittedStatus(relationship, request) && (!request.relationshipTypes?.length || request.relationshipTypes.includes(relationship.type)));
  const byEndpoint = new Map();
  for (const relationship of relationships) {
    for (const endpoint of [relationship.source, relationship.target]) {
      const entries = byEndpoint.get(endpointKey(endpoint)) ?? [];
      entries.push(relationship);
      byEndpoint.set(endpointKey(endpoint), entries);
    }
  }
  const visited = new Map();
  const nodes = [];
  const paths = [];
  const cycles = [];
  const queue = [];
  for (const endpoint of starts) {
    visited.set(endpointKey(endpoint), 0);
    nodes.push(nodeFor(endpoint, requirements, 0, authorization, decision, request.projection));
    queue.push({ endpoint, nodeIds: [endpoint.id], relationshipIds: [], distance: 0 });
  }
  let truncationReason = null;
  const continuation = new Map();
  while (queue.length && !truncationReason) {
    const current = queue.shift();
    const adjacent = byEndpoint.get(endpointKey(current.endpoint)) ?? [];
    for (const relationship of adjacent) {
      if (current.relationshipIds.includes(relationship.id)) continue;
      const fromSource = sameEndpoint(relationship.source, current.endpoint);
      const direction = movement(relationship, fromSource, policy);
      if (request.direction !== "both" && direction !== "horizontal" && direction !== request.direction) continue;
      const next = fromSource ? relationship.target : relationship.source;
      if (next.kind.startsWith("external:") && request.includeExternal === false) continue;
      if (next.kind === "requirement") {
        const target = requirements.get(next.id);
        if (!target || !authorization.canReadItem(decision, target) || (!request.includeRetired && !activeRequirement(target))) continue;
      }
      const nextDistance = current.distance + 1;
      if (nextDistance > depth) { truncationReason ??= "depth-limit"; continuation.set(endpointKey(next), clone(next)); continue; }
      const key = endpointKey(next);
      const path = { direction, nodeIds: [...current.nodeIds, next.id], relationshipIds: [...current.relationshipIds, relationship.id] };
      if (visited.has(key)) {
        cycles.push({ ...path, cycle: true, relationship: pathRelationship(relationship, direction) });
        continue;
      }
      if (nodes.length >= nodeLimit) { truncationReason = "node-limit"; continuation.set(key, clone(next)); break; }
      visited.set(key, nextDistance);
      nodes.push(nodeFor(next, requirements, nextDistance, authorization, decision, request.projection));
      paths.push({ ...path, cycle: false, relationship: pathRelationship(relationship, direction) });
      queue.push({ endpoint: next, ...path, distance: nextDistance });
    }
  }
  nodes.sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  const accessRestricted = Boolean(decision.componentRestricted);
  return {
    accessRestricted,
    complete: !truncationReason && !accessRestricted,
    configurationVersion: String(policy.configurationVersion ?? "1"),
    traceabilityModelVersion: policy.traceabilityModelVersion,
    cycles,
    direction: request.direction,
    maximums: { depth: maximumDepth, nodes: maximumNodes },
    nodes,
    paths,
    relationshipTypes: request.relationshipTypes ?? policy.relationships.map(({ type }) => type),
    startIds: starts.map(({ id }) => id),
    startEndpoints: starts.map((endpoint) => clone(endpoint)),
    ...(truncationReason ? { continuation: { reason: truncationReason, required: true, starts: [...continuation.values()] } } : {}),
    truncationReason,
  };
}

class TraceabilityQueryService {
  constructor(options) {
    if (!options.repository?.read) throw new TypeError("A Repository port is required");
    this.repository = options.repository;
    this.authorization = options.authorization;
    this.snapshotProvider = options.snapshotProvider;
    this.configuredPolicy = options.policy;
    this.cursorCodec = new CursorCodec(options.cursorSecret);
  }

  async policy() {
    return this.configuredPolicy ? clone(this.configuredPolicy) : this.repository.getPolicy();
  }

  async snapshot(request) {
    return selectSnapshot(this.repository, this.snapshotProvider, request);
  }
}

export class TraceRequirementsService extends TraceabilityQueryService {
  async execute(request, context) {
    try {
      const { authorization, decision } = readContext(context, this.authorization);
      const [selected, policy] = await Promise.all([this.snapshot(request), this.policy()]);
      const data = graphResult(selected.documents, request, context, authorization, decision, selected.policy ?? policy);
      return operationResponse(request, selected.source.repositoryRevision, data, selected.source);
    } catch (error) { throw applicationError(error); }
  }
}

function coverageState(relationships) {
  if (!relationships.length) return "missing";
  if (relationships.some((relationship) => relationshipStatus(relationship) === "suspect")) return "present-but-suspect";
  if (relationships.every((relationship) => relationshipStatus(relationship) === "waived")) return "waived";
  const evidenceState = (relationship) => relationship.customAttributes?.["evidence.status"] ?? relationship.customAttributes?.["evidence-status"] ?? relationship.customAttributes?.evidenceStatus;
  if (relationships.some((relationship) => relationshipStatus(relationship) === "invalid" || evidenceState(relationship) === "failed")) return "failed";
  const evidenceStates = relationships.map(evidenceState).filter(Boolean);
  if (evidenceStates.includes("deferred")) return "deferred";
  if (evidenceStates.includes("accepted-passing")) return "accepted-passing";
  if (evidenceStates.includes("planned")) return "planned";
  return "present";
}

function coverageException(item, relationshipType) {
  const candidates = item.customAttributes?.["coverage.exceptions"] ?? item.customAttributes?.coverageExceptions ?? [];
  if (!Array.isArray(candidates)) return null;
  const exception = candidates.find((candidate) => (candidate?.["relationship-type"] ?? candidate?.relationship_type ?? candidate?.relationshipType) === relationshipType);
  if (!exception || !new Set(["waived", "deferred", "not-applicable"]).has(exception.state) || !exception.rationale || !(exception["authorized-by"] || exception.authorized_by || exception.authorizedBy || exception["accountable-principal"] || exception.accountablePrincipal)) return null;
  return exception;
}

function pagination(service, request, revision, scopeKey, records, fingerprint) {
  const limit = request.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApplicationError("INVALID_ARGUMENT", "Limit must be between 1 and 100");
  let offset = 0;
  if (request.cursor) {
    const cursor = service.cursorCodec.decode(request.cursor);
    if (cursor.revision !== revision || cursor.scopeKey !== scopeKey || cursor.fingerprint !== fingerprint || !Number.isInteger(cursor.offset) || cursor.offset < 0) {
      throw new ApplicationError("INVALID_ARGUMENT", "Cursor is stale for the selected traceability context");
    }
    offset = cursor.offset;
  }
  const items = records.slice(offset, offset + limit);
  const truncated = offset + items.length < records.length;
  return {
    items,
    page: {
      ...(truncated ? { nextCursor: service.cursorCodec.encode({ fingerprint, offset: offset + items.length, revision, scopeKey }) } : {}),
      returnedCount: items.length,
      truncated,
    },
  };
}

export class CoverageService extends TraceabilityQueryService {
  async execute(request, context) {
    try {
      const { authorization, decision } = readContext(context, this.authorization);
      const [selected, policy] = await Promise.all([this.snapshot(request), this.policy()]);
      const effectivePolicy = selected.policy ?? policy;
      const visible = allRequirements(selected.documents).filter((item) => authorization.canReadItem(decision, item));
      const allowedIds = new Set(visible.map(({ id }) => id));
      const exclusions = [];
      const population = [];
      const relationships = allRelationships(selected.documents).filter((relationship) => activeRelationship(relationship) && endpointsVisible(relationship, allowedIds));
      const rules = effectivePolicy.coverageRules.filter((rule) => (!request.level || rule.level === request.level));
      for (const item of visible) {
        if (!request.includeRetired && !activeRequirement(item)) { exclusions.push({ id: item.id, reason: "retired" }); continue; }
        if (request.statuses?.length && !request.statuses.includes(item.status)) { exclusions.push({ id: item.id, reason: "status-filter" }); continue; }
        for (const rule of rules.filter((candidate) => candidate.level === item.level && candidate.statuses.includes(item.status))) {
          const types = request.relationshipTypes?.length ? rule.requiredRelationshipTypes.filter((type) => request.relationshipTypes.includes(type)) : rule.requiredRelationshipTypes;
          for (const type of types) {
            const links = relationships.filter((relationship) => relationship.type === type && (relationship.source.id === item.id || relationship.target.id === item.id));
            const exception = coverageException(item, type);
            const missingPlan = type === "verified_by" && effectivePolicy.authoringRules?.verificationPlanningLevels?.includes(item.level)
              && !(item.verificationMethods?.length || item.acceptanceCriteria?.some(({ verificationMethod }) => verificationMethod));
            const state = exception?.state ?? (missingPlan ? "missing" : coverageState(links));
            if (exception && new Set(["waived", "not-applicable"]).has(exception.state)) exclusions.push({ id: item.id, rationale: exception.rationale, reason: exception.state, relationshipType: type });
            population.push({ ...(exception ? { exception: clone(exception) } : {}), id: item.id, level: item.level, relationshipIds: links.map(({ id }) => id).sort(), relationshipType: type, state, status: item.status });
          }
        }
      }
      population.sort((left, right) => left.id.localeCompare(right.id) || left.relationshipType.localeCompare(right.relationshipType));
      const requestedGap = request.gap === "stale" ? "present-but-suspect" : request.gap;
      const filtered = requestedGap ? population.filter(({ state }) => state === requestedGap) : population;
      const fingerprint = canonicalHash(defined({ baselineId: request.baselineId, gap: requestedGap, level: request.level, relationshipTypes: request.relationshipTypes, statuses: request.statuses }));
      const paged = pagination(this, request, selected.source.repositoryRevision, decision.scopeKey, filtered, fingerprint);
      const applicable = population.filter(({ state }) => state !== "not-applicable" && state !== "waived");
      const numerator = applicable.filter(({ state }) => new Set(["present", "accepted-passing"]).has(state)).length;
      const data = {
        accessRestricted: Boolean(decision.componentRestricted),
        configurationVersion: String(effectivePolicy.configurationVersion ?? "1"),
        exclusions,
        filters: { gap: requestedGap, level: request.level, relationshipTypes: request.relationshipTypes, statuses: request.statuses },
        formula: { denominatorDefinition: "applicable visible requirement/rule obligations", numeratorDefinition: "present or accepted-passing non-suspect obligations" },
        items: paged.items,
        population: { denominator: applicable.length, evaluated: population.length, numerator },
        relationshipRules: rules.map(({ level, requiredRelationshipTypes, statuses }) => ({ level, requiredRelationshipTypes, statuses })),
        traceabilityModelVersion: effectivePolicy.traceabilityModelVersion,
      };
      return operationResponse(request, selected.source.repositoryRevision, data, selected.source, paged.page);
    } catch (error) { throw applicationError(error); }
  }
}

export class OrphanRequirementsService extends TraceabilityQueryService {
  async execute(request, context) {
    try {
      const { authorization, decision } = readContext(context, this.authorization);
      const selected = await this.snapshot(request);
      const visible = allRequirements(selected.documents).filter((item) => authorization.canReadItem(decision, item));
      const allowedIds = new Set(visible.map(({ id }) => id));
      const relationships = allRelationships(selected.documents).filter((relationship) => activeRelationship(relationship) && endpointsVisible(relationship, allowedIds) && (!request.relationshipTypes?.length || request.relationshipTypes.includes(relationship.type)));
      const connected = new Set(relationships.flatMap((relationship) => [relationship.source, relationship.target]).filter(({ kind }) => kind === "requirement").map(({ id }) => id));
      const records = visible.filter((item) => (!request.level || item.level === request.level) && (request.includeRetired || activeRequirement(item)) && !connected.has(item.id)).map((item) => ({ id: item.id, level: item.level, status: item.status, version: item.version })).sort((left, right) => left.id.localeCompare(right.id));
      const fingerprint = canonicalHash(defined({ baselineId: request.baselineId, includeRetired: request.includeRetired, level: request.level, relationshipTypes: request.relationshipTypes }));
      const paged = pagination(this, request, selected.source.repositoryRevision, decision.scopeKey, records, fingerprint);
      return operationResponse(request, selected.source.repositoryRevision, {
        accessRestricted: Boolean(decision.componentRestricted),
        filters: { level: request.level, relationshipTypes: request.relationshipTypes },
        items: paged.items,
        populationDefinition: "visible requirements without an active matching relationship",
      }, selected.source, paged.page);
    } catch (error) { throw applicationError(error); }
  }
}

function group(nodes, key) {
  const grouped = {};
  for (const node of nodes) {
    const value = key(node) ?? "unassigned";
    const label = String(value);
    grouped[label] ??= [];
    grouped[label].push(node.id);
  }
  return Object.fromEntries(Object.entries(grouped).sort(([left], [right]) => left.localeCompare(right)).map(([label, ids]) => [label, { count: ids.length, ids: ids.sort() }]));
}

export class ImpactAnalysisService extends TraceabilityQueryService {
  async execute(request, context) {
    try {
      const { authorization, decision } = readContext(context, this.authorization);
      const [selected, policy] = await Promise.all([this.snapshot(request), this.policy()]);
      const trace = graphResult(selected.documents, { includeExternal: true, ...request, projection: "compact" }, context, authorization, decision, selected.policy ?? policy);
      const starts = new Set(trace.startIds);
      const candidates = trace.nodes.filter(({ id }) => !starts.has(id));
      const requirements = requirementMap(selected.documents);
      const manual = [];
      for (const id of request.manuallyAddedIds ?? []) {
        const item = requirements.get(id);
        if (!item || !authorization.canReadItem(decision, item)) throw new ApplicationError("NOT_FOUND", "Manually added impact item was not found");
        if (!candidates.some((node) => node.id === id) && !starts.has(id)) manual.push(nodeFor({ id, kind: "requirement" }, requirements, null, authorization, decision));
      }
      const directlyAffected = candidates.filter(({ distance }) => distance === 1);
      const transitivelyAffected = candidates.filter(({ distance }) => distance > 1);
      const all = [...candidates, ...manual];
      const relationshipTypeByNode = new Map(trace.paths.map((path) => [path.nodeIds.at(-1), path.relationship.type]));
      const data = {
        accessRestricted: trace.accessRestricted,
        complete: trace.complete,
        directlyAffected,
        groups: {
          artifactType: group(all, (node) => node.artifactType),
          criticality: group(all, (node) => node.criticality),
          distance: group(all, (node) => node.distance === null ? "manual" : node.distance),
          owner: group(all, (node) => node.owner),
          relationshipType: group(all, (node) => relationshipTypeByNode.get(node.id) ?? "manual"),
          release: group(all, (node) => node.release ?? node.customAttributes?.release),
          variant: group(all, (node) => node.variant ?? node.customAttributes?.variant),
        },
        manuallyAdded: manual,
        sourceRevision: selected.source.repositoryRevision,
        startIds: trace.startIds,
        transitivelyAffected,
        truncationReason: trace.truncationReason,
      };
      return operationResponse(request, selected.source.repositoryRevision, data, selected.source);
    } catch (error) { throw applicationError(error); }
  }
}

export function createTraceabilityServices(options) {
  return {
    CoverageService: new CoverageService(options),
    ImpactAnalysisService: new ImpactAnalysisService(options),
    LinkRequirementService: new LinkRequirementService(options),
    OrphanRequirementsService: new OrphanRequirementsService(options),
    ReassessRelationshipService: new ReassessRelationshipService(options),
    TraceRequirementsService: new TraceRequirementsService(options),
    UnlinkRequirementService: new UnlinkRequirementService(options),
  };
}

export { DEFAULT_TRAVERSAL, RELATIONSHIP_STATUSES, relationshipStatus };
