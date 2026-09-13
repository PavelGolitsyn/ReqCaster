import { randomUUID } from "node:crypto";

import { assertValidRepositoryDocuments } from "../../adapters/repository/validation.js";
import { canonicalHash } from "../../adapters/repository/canonical-json.js";
import { parseRequirementId } from "../../domain/identifiers.js";
import { ApplicationError } from "../errors.js";
import { applyBulkOperation, GOVERNED_CHANGE_COMMIT, localAllocation, summarize } from "./authoring.js";
import { markRelationshipsSuspect } from "./traceability.js";

const clone = (value) => structuredClone(value);
const activeRelationship = (relationship) => !relationship.retirement;
const allRequirements = (documents) => [...documents.business.requirements, ...documents.software.requirements];
const allRelationships = (documents) => [...documents.business.relationships, ...documents.software.relationships];
const itemMap = (documents) => new Map(allRequirements(documents).map((item) => [item.id, item]));
const actor = (context) => context.identity?.agentId ?? "unknown-agent";
const principal = (context) => context.identity?.principal?.id ?? "unknown-principal";

function timestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApplicationError("INVALID_ARGUMENT", "The trusted clock returned an invalid timestamp");
  return date.toISOString();
}

function operationResponse(request, repositoryRevision, data) {
  return { schemaVersion: "1.0.0", repositoryRevision, correlationId: request.correlationId, data };
}

function commandHash(request) {
  const normalized = clone(request);
  delete normalized.correlationId;
  delete normalized.idempotencyKey;
  return canonicalHash(normalized);
}

function identityScope(identity, operation) {
  return `${operation}:${identity?.principal?.id ?? "unknown"}:${identity?.agentId ?? "unknown"}`;
}

function idempotency(request, context, operation) {
  return { correlationId: request.correlationId, key: request.idempotencyKey, requestHash: commandHash(request), scope: identityScope(context.identity, operation) };
}

function applicationError(error) {
  if (error instanceof ApplicationError) return error;
  const known = new Set(["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "FORBIDDEN", "VERSION_CONFLICT", "REPOSITORY_BUSY", "INTEGRITY_FAILURE", "PREVIEW_EXPIRED"]);
  return new ApplicationError(known.has(error?.code) ? error.code : "INTERNAL_ERROR", known.has(error?.code) ? error.message : "The workflow operation could not be completed", {
    cause: error,
    current: error?.current,
    details: error?.details ?? [],
    retryable: error?.code === "REPOSITORY_BUSY",
  });
}

export function ensureChangeControl(documents) {
  documents.business.changeControl ??= {
    baselineMemberships: [],
    changes: [],
    nextChangeNumber: 1,
    nextOutboxNumber: 1,
    outbox: [],
    schemaVersion: "1.0.0",
  };
  return documents.business.changeControl;
}

function findRequirement(documents, id) {
  const level = parseRequirementId(id)?.level;
  return level ? documents[level].requirements.find((item) => item.id === id) : null;
}

function findChange(documents, id) {
  return documents.business.changeControl?.changes?.find((change) => change.id === id);
}

function assertVersion(record, expectedVersion, repositoryRevision, noun = "record") {
  if (!record) throw new ApplicationError("NOT_FOUND", `The governed ${noun} was not found`);
  if (record.version !== expectedVersion) throw new ApplicationError("VERSION_CONFLICT", `Expected ${noun} version does not match current version`, {
    current: { itemVersion: record.version, repositoryRevision },
    details: [{ path: "/expectedVersion", reason: `current ${noun} version is ${record.version}` }],
  });
}

function assertAuthority(requestAuthority, context, path = "/authority") {
  if (!context.identity?.principal?.id || requestAuthority !== principal(context)) throw new ApplicationError("FORBIDDEN", "The recorded authority must be the authenticated accountable human", {
    details: [{ path, reason: "must equal the authenticated principal identity" }],
  });
}

function event(control, context, eventType, aggregateId, recipientRefs, summary) {
  const id = `OB-${String(control.nextOutboxNumber).padStart(6, "0")}`;
  control.nextOutboxNumber += 1;
  const record = {
    aggregateId,
    attempts: 0,
    createdAt: timestamp(context.now),
    eventType,
    id,
    recipientRefs: [...new Set(recipientRefs.filter(Boolean))].sort(),
    status: "pending",
    summary: String(summary).slice(0, 1000),
  };
  control.outbox.push(record);
  return clone(record);
}

function transitionPermission(context, permission) {
  const decision = context.authorization?.evaluate?.(context.identity, permission, { now: context.now });
  return decision ? decision.allowed : context.security?.permission === permission;
}

function valuePresent(item, field) {
  if (field === "source") return Boolean(item.provenance?.source || item.sourceReferences?.length);
  const value = item[field];
  return value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function touchingRelationships(documents, id) {
  return allRelationships(documents).filter((relationship) => activeRelationship(relationship) && (relationship.source?.id === id || relationship.target?.id === id));
}

function transitionBlockers(documents, item, rule, request, policy, context) {
  const blockers = [];
  if (!transitionPermission(context, rule.permission)) blockers.push({ code: "permission", path: "/toStatus", reason: `transition requires ${rule.permission}` });
  for (const field of rule.requiredFields ?? []) if (!valuePresent(item, field)) blockers.push({ code: `field:${field}`, path: `/${field}`, reason: "required field is missing" });
  const evidence = request.evidenceReferences ?? [];
  for (const type of rule.requiredEvidenceTypes ?? []) {
    if (!evidence.some((reference) => reference.type === type && !new Set(["failed", "planned"]).has(reference.status))) blockers.push({ code: `evidence:${type}`, path: "/evidenceReferences", reason: `current ${type} evidence is required` });
  }
  const configured = new Set(rule.blockingConditions ?? []);
  if (configured.has("blocking-tbds") && /\b(?:TBD|TBC|TODO)\b/iu.test([item.statement, item.rationale, ...(item.acceptanceCriteria ?? []).map(({ text }) => text)].filter(Boolean).join(" "))) {
    blockers.push({ code: "blocking-tbds", path: "/statement", reason: "blocking placeholder text remains" });
  }
  if (configured.has("coverage")) {
    const coverage = policy.coverageRules.find((entry) => entry.level === item.level && entry.statuses.includes(rule.to));
    const types = new Set(touchingRelationships(documents, item.id).filter((entry) => !entry.suspect && entry.status !== "invalid").map(({ type }) => type));
    for (const type of coverage?.requiredRelationshipTypes ?? []) if (!types.has(type)) blockers.push({ code: `coverage:${type}`, path: "/relationships", reason: `required ${type} coverage is missing` });
  }
  if (configured.has("critical-suspect-links")) {
    const requirements = itemMap(documents);
    const criticalities = new Set(policy.changeControl?.criticalImpactLevels ?? ["high", "safety-critical"]);
    for (const relationship of touchingRelationships(documents, item.id).filter((entry) => entry.suspect || entry.status === "suspect")) {
      const otherId = relationship.source.id === item.id ? relationship.target.id : relationship.source.id;
      const other = requirements.get(otherId);
      if (criticalities.has(item.criticality) || criticalities.has(other?.criticality)) blockers.push({ code: `suspect:${relationship.id}`, path: `/relationships/${relationship.id}`, reason: "critical suspect relationship is unresolved" });
    }
  }
  return blockers;
}

function applyException(blockers, exception, rule, context) {
  if (!blockers.length) return { remaining: [], accepted: [] };
  if (!exception) return { remaining: blockers, accepted: [] };
  if (rule.allowException !== true) throw new ApplicationError("INVALID_ARGUMENT", "This transition does not allow exceptions");
  assertAuthority(exception.approver, context, "/exception/approver");
  if (!exception.expiresAt && !exception.reviewAt) throw new ApplicationError("INVALID_ARGUMENT", "An exception requires an expiry or review date");
  for (const field of ["expiresAt", "reviewAt"]) if (exception[field] && (Number.isNaN(Date.parse(exception[field])) || Date.parse(exception[field]) <= new Date(context.now).getTime())) {
    throw new ApplicationError("INVALID_ARGUMENT", "Exception expiry and review dates must be valid future times", { details: [{ path: `/exception/${field}`, reason: "must be in the future" }] });
  }
  const scope = new Set(exception.scope);
  const accepted = blockers.filter(({ code }) => scope.has(code));
  return { accepted, remaining: blockers.filter(({ code }) => !scope.has(code)) };
}

class WorkflowService {
  constructor(options) {
    if (!options.repository?.execute) throw new TypeError("A Repository port is required");
    this.repository = options.repository;
    this.configuredPolicy = options.policy;
    this.audit = options.audit;
  }

  async policy() { return this.configuredPolicy ? clone(this.configuredPolicy) : this.repository.getPolicy(); }

  async mutate(request, context, operation, mutator, expectedRepositoryRevision = request.expectedRepositoryRevision) {
    try {
      const result = await this.repository.execute(mutator, {
        actor: actor(context),
        expectedRepositoryRevision,
        idempotency: idempotency(request, context, operation),
      });
      if (result.committed && this.audit?.append) await this.audit.append({
        agentId: actor(context), correlationId: request.correlationId, event: "workflow-mutation", operation,
        policyVersion: context.security?.policyVersion, principalId: principal(context), repositoryRevision: result.repositoryRevision,
        timestamp: timestamp(context.now),
      });
      return operationResponse(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
    } catch (error) { throw applicationError(error); }
  }
}

export class PossibleTransitionsService extends WorkflowService {
  async execute(request, context) {
    try {
      const [documents, policy] = await Promise.all([this.repository.read(), this.policy()]);
      const item = findRequirement(documents, request.id);
      if (!item || context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, item)) throw new ApplicationError("NOT_FOUND", "Requirement was not found");
      if (request.expectedVersion !== undefined) assertVersion(item, request.expectedVersion, documents.business.repositoryRevision, "requirement");
      const transitions = policy.transitions.filter(({ from, to }) => from === item.status && (!request.toStatus || request.toStatus === to)).map((rule) => {
        const blockers = transitionBlockers(documents, item, rule, request, policy, context);
        return { allowed: blockers.length === 0, blockers, from: rule.from, permission: rule.permission, policyVersion: policy.configurationVersion, to: rule.to };
      });
      return operationResponse(request, documents.business.repositoryRevision, { itemVersion: item.version, policyVersion: policy.configurationVersion, transitions });
    } catch (error) { throw applicationError(error); }
  }
}

export class TransitionRequirementService extends WorkflowService {
  async execute(request, context) {
    const policy = await this.policy();
    if (request.expectedPolicyVersion !== policy.configurationVersion) throw new ApplicationError("VERSION_CONFLICT", "Expected workflow policy version does not match current policy", {
      details: [{ path: "/expectedPolicyVersion", reason: `current policy version is ${policy.configurationVersion}` }],
    });
    return this.mutate(request, context, "requirements.transition", (documents) => {
      const item = findRequirement(documents, request.id);
      assertVersion(item, request.expectedVersion, documents.business.repositoryRevision, "requirement");
      if (context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, item)) throw new ApplicationError("NOT_FOUND", "Requirement was not found");
      const rule = policy.transitions.find(({ from, to }) => from === item.status && to === request.toStatus);
      if (!rule) throw new ApplicationError("INVALID_ARGUMENT", "The requested lifecycle transition is not configured for the current state");
      const evaluated = transitionBlockers(documents, item, rule, request, policy, context);
      const { accepted, remaining } = applyException(evaluated, request.exception, rule, context);
      if (remaining.length) throw new ApplicationError("INVALID_ARGUMENT", "Requirement is not ready for the requested transition", { details: remaining.map(({ path, reason }) => ({ path, reason })) });
      const before = item.status;
      const now = timestamp(context.now);
      item.status = request.toStatus;
      item.version += 1;
      item.provenance = { ...item.provenance, accountablePrincipal: principal(context), updatedAt: now, updatedBy: actor(context) };
      item.lifecycleHistory = [...(item.lifecycleHistory ?? []), {
        accountablePrincipal: principal(context), action: "transition", at: now, by: actor(context), from: before,
        policyVersion: policy.configurationVersion, reason: request.rationale, to: request.toStatus,
        ...(request.evidenceReferences?.length ? { evidenceReferences: clone(request.evidenceReferences) } : {}),
        ...(accepted.length ? { exception: { ...clone(request.exception), acceptedBlockers: accepted.map(({ code }) => code) } } : {}),
      }];
      const suspectRelationships = request.toStatus === "retired" ? markRelationshipsSuspect(documents, item.id, ["retirement"], context, policy, "retirement") : [];
      if (request.toStatus === "retired") item.retirement = { rationale: request.rationale, retiredAt: now, retiredBy: actor(context) };
      const control = ensureChangeControl(documents);
      const outboxEvent = event(control, context, "requirement.transitioned", item.id, [item.owner], `${item.id} transitioned from ${before} to ${item.status}`);
      return { beforeState: before, evidenceReferences: clone(request.evidenceReferences ?? []), exception: accepted.length ? clone(request.exception) : null, item: clone(item), outboxEvent, policyVersion: policy.configurationVersion, suspectRelationships };
    });
  }
}

function normalizeProposedChanges(request, documents) {
  if (request.proposedChanges?.length) return clone(request.proposedChanges);
  return (request.affectedRequirementIds ?? []).map((id) => {
    const item = findRequirement(documents, id);
    if (!item) throw new ApplicationError("NOT_FOUND", "Affected requirement was not found");
    return { expectedVersion: item.version, id, operation: "update", patch: {}, reason: request.rationale };
  });
}

function validateProposals(operations, documents) {
  if (!operations.length) throw new ApplicationError("SCHEMA_VIOLATION", "A change request must propose at least one governed operation");
  const targets = new Set();
  for (const [index, operation] of operations.entries()) {
    if (operation.operation === "create") {
      if (!operation.draft) throw new ApplicationError("SCHEMA_VIOLATION", "Create proposal requires a draft", { details: [{ path: `/proposedChanges/${index}/draft`, reason: "is required" }] });
      continue;
    }
    if (!operation.id || !Number.isInteger(operation.expectedVersion)) throw new ApplicationError("SCHEMA_VIOLATION", "Change targets require exact item versions", { details: [{ path: `/proposedChanges/${index}`, reason: "id and expectedVersion are required" }] });
    const item = findRequirement(documents, operation.id);
    assertVersion(item, operation.expectedVersion, documents.business.repositoryRevision, "requirement");
    const key = `${operation.operation}:${operation.id}`;
    if (targets.has(key)) throw new ApplicationError("SCHEMA_VIOLATION", "A change proposal contains a duplicate target operation");
    targets.add(key);
    if (operation.operation === "update" && !operation.patch) throw new ApplicationError("SCHEMA_VIOLATION", "Update proposal requires a patch");
    if (operation.operation === "retire" && !operation.reason) throw new ApplicationError("SCHEMA_VIOLATION", "Retirement proposal requires a reason");
  }
}

function changeHistory(change, context, action, details = {}) {
  change.history.push({ action, accountablePrincipal: principal(context), at: timestamp(context.now), by: actor(context), ...clone(details) });
  change.updatedAt = timestamp(context.now);
  change.version += 1;
}

export class CreateChangeService extends WorkflowService {
  async execute(request, context) {
    return this.mutate(request, context, "changes.create", (documents) => {
      const control = ensureChangeControl(documents);
      const proposedChanges = normalizeProposedChanges(request, documents);
      validateProposals(proposedChanges, documents);
      const id = `CH-${String(control.nextChangeNumber).padStart(6, "0")}`;
      control.nextChangeNumber += 1;
      const now = timestamp(context.now);
      const change = {
        accountableOwner: request.accountableOwner,
        createdAt: now,
        history: [{ accountablePrincipal: principal(context), action: "created", at: now, by: actor(context), status: "draft" }],
        id,
        impacts: [],
        initiator: principal(context),
        proposedChanges,
        rationale: request.rationale,
        source: request.source,
        status: "draft",
        title: request.title,
        updatedAt: now,
        urgency: request.urgency ?? "routine",
        version: 1,
        ...Object.fromEntries(["affectedRelease", "affectedBaseline", "affectedConfiguration", "affectedVariant"].filter((field) => request[field] !== undefined).map((field) => [field, request[field]])),
      };
      control.changes.push(change);
      const outboxEvent = event(control, context, "change.created", id, [change.accountableOwner], `${id}: ${change.title}`);
      return { change: clone(change), outboxEvent };
    });
  }
}

export class TriageChangeService extends WorkflowService {
  async execute(request, context) {
    return this.mutate(request, context, "changes.triage", (documents) => {
      const control = ensureChangeControl(documents);
      const change = findChange(documents, request.changeId);
      assertVersion(change, request.expectedVersion, documents.business.repositoryRevision, "change");
      if (change.status !== "draft") throw new ApplicationError("INVALID_ARGUMENT", "Only draft changes can be triaged");
      if (request.duplicateOf && !findChange(documents, request.duplicateOf)) throw new ApplicationError("NOT_FOUND", "Duplicate change reference was not found");
      change.accountableOwner = request.accountableOwner;
      change.triage = { ...(request.duplicateOf ? { duplicateOf: request.duplicateOf } : {}), issues: clone(request.issues ?? []) };
      change.status = "triaged";
      changeHistory(change, context, "triaged", { status: change.status });
      const outboxEvent = event(control, context, "change.triaged", change.id, [change.accountableOwner], `${change.id} was triaged`);
      return { change: clone(change), outboxEvent };
    });
  }
}

function impactKey(artifact) { return `${artifact.kind}\u0000${artifact.id}`; }

function analyzeImpacts(documents, change, request, policy) {
  const requirements = itemMap(documents);
  const relationships = allRelationships(documents).filter(activeRelationship);
  const depthMaximum = Math.min(request.depth ?? policy.changeControl?.impactDepthMaximum ?? 5, policy.changeControl?.impactDepthMaximum ?? 5);
  const nodeMaximum = Math.min(request.nodeLimit ?? policy.changeControl?.impactNodeMaximum ?? 1000, policy.changeControl?.impactNodeMaximum ?? 1000);
  const directIds = change.proposedChanges.filter(({ id }) => id).map(({ id }) => id);
  const pending = directIds.map((id) => ({ depth: 0, id }));
  const visited = new Set(directIds);
  const impacts = new Map();
  let truncated = false;
  while (pending.length) {
    const current = pending.shift();
    if (current.depth >= depthMaximum) continue;
    for (const relationship of relationships.filter((entry) => entry.source?.id === current.id || entry.target?.id === current.id)) {
      const endpoint = relationship.source.id === current.id ? relationship.target : relationship.source;
      if (directIds.includes(endpoint.id)) continue;
      const artifact = { id: endpoint.id, kind: endpoint.kind, ...(endpoint.version ? { version: endpoint.version } : {}) };
      const linked = requirements.get(endpoint.id);
      impacts.set(impactKey(artifact), {
        artifact,
        critical: new Set(policy.changeControl?.criticalImpactLevels ?? ["high", "safety-critical"]).has(linked?.criticality),
        depth: current.depth + 1,
        disposition: "pending",
        owner: linked?.owner ?? endpoint.systemOfRecord ?? "unassigned",
        relationshipId: relationship.id,
        source: "trace",
      });
      if (impacts.size >= nodeMaximum) { truncated = true; pending.length = 0; break; }
      if (endpoint.kind === "requirement" && !visited.has(endpoint.id)) {
        visited.add(endpoint.id);
        pending.push({ depth: current.depth + 1, id: endpoint.id });
      }
    }
  }
  for (const artifact of request.manuallyAddedImpacts ?? []) impacts.set(impactKey(artifact), {
    artifact: clone(artifact), critical: false, depth: 0, disposition: "pending", owner: "unassigned", source: "manual",
  });
  return { depthMaximum, impacts: [...impacts.values()].sort((left, right) => impactKey(left.artifact).localeCompare(impactKey(right.artifact))), nodeMaximum, truncated };
}

export class AnalyzeChangeService extends WorkflowService {
  async execute(request, context) {
    const policy = await this.policy();
    return this.mutate(request, context, "changes.analyze", (documents) => {
      const control = ensureChangeControl(documents);
      const change = findChange(documents, request.changeId);
      assertVersion(change, request.expectedVersion, documents.business.repositoryRevision, "change");
      if (!new Set(["triaged", "analyzing", "ready_for_decision"]).has(change.status)) throw new ApplicationError("INVALID_ARGUMENT", "Change must be triaged before impact analysis");
      const analysis = analyzeImpacts(documents, change, request, policy);
      if (analysis.truncated && request.acceptTruncation && !request.truncationRationale) throw new ApplicationError("SCHEMA_VIOLATION", "Accepted truncation requires a rationale");
      change.impactSnapshot = {
        configurationVersion: policy.configurationVersion,
        depthMaximum: analysis.depthMaximum,
        hash: canonicalHash({ impacts: analysis.impacts, repositoryRevision: documents.business.repositoryRevision }),
        nodeMaximum: analysis.nodeMaximum,
        repositoryRevision: documents.business.repositoryRevision,
        traceabilityModelVersion: policy.traceabilityModelVersion,
        truncated: analysis.truncated,
        ...(analysis.truncated && request.acceptTruncation ? { truncationAcceptance: { authority: principal(context), rationale: request.truncationRationale } } : {}),
      };
      change.impacts = analysis.impacts;
      change.assessments = clone(request.assessments ?? {});
      change.status = analysis.truncated && !request.acceptTruncation ? "analyzing" : "ready_for_decision";
      changeHistory(change, context, "analyzed", { status: change.status });
      const outboxEvent = event(control, context, "change.analyzed", change.id, [change.accountableOwner, ...change.impacts.map(({ owner }) => owner)], `${change.id} impact analysis is ${analysis.truncated ? "truncated" : "complete"}`);
      return { blockers: analysis.truncated && !request.acceptTruncation ? [{ code: "impact-truncated", reason: "impact traversal truncation must be resolved or explicitly accepted" }] : [], change: clone(change), outboxEvent };
    });
  }
}

export class DispositionImpactService extends WorkflowService {
  async execute(request, context) {
    return this.mutate(request, context, "changes.dispositionImpact", (documents) => {
      const control = ensureChangeControl(documents);
      const change = findChange(documents, request.changeId);
      assertVersion(change, request.expectedVersion, documents.business.repositoryRevision, "change");
      if (!new Set(["ready_for_decision", "analyzing"]).has(change.status)) throw new ApplicationError("INVALID_ARGUMENT", "Impact dispositions require an analyzed change");
      const impact = change.impacts.find((entry) => impactKey(entry.artifact) === impactKey(request.impact));
      if (!impact) throw new ApplicationError("NOT_FOUND", "Impacted artifact was not found in the pinned analysis");
      if (request.owner !== impact.owner && request.owner !== principal(context)) throw new ApplicationError("FORBIDDEN", "Only the affected owner or authenticated accountable principal can disposition an impact");
      impact.disposition = request.disposition;
      impact.dispositionRecord = { accountablePrincipal: principal(context), at: timestamp(context.now), by: actor(context), evidenceReferences: clone(request.evidenceReferences ?? []), owner: request.owner, rationale: request.rationale };
      changeHistory(change, context, "impact-dispositioned", { artifact: clone(impact.artifact), disposition: request.disposition, status: change.status });
      const outboxEvent = event(control, context, "change.impact-dispositioned", change.id, [change.accountableOwner, impact.owner], `${change.id} impact ${impact.artifact.id} was dispositioned`);
      return { change: clone(change), impact: clone(impact), outboxEvent };
    });
  }
}

export class DecideChangeService extends WorkflowService {
  async execute(request, context) {
    assertAuthority(request.authority, context);
    return this.mutate(request, context, "changes.decide", (documents) => {
      const control = ensureChangeControl(documents);
      const change = findChange(documents, request.changeId);
      assertVersion(change, request.expectedVersion, documents.business.repositoryRevision, "change");
      if (change.status !== "ready_for_decision") throw new ApplicationError("INVALID_ARGUMENT", "Change is not ready for decision");
      if (request.decision === "approve") {
        const unresolved = change.impacts.filter(({ disposition }) => !new Set(["accepted", "mitigated", "not_affected"]).has(disposition));
        if (unresolved.length) throw new ApplicationError("INVALID_ARGUMENT", "Change approval is blocked by unresolved impact dispositions", { details: unresolved.slice(0, 100).map(({ artifact }) => ({ path: `/impacts/${artifact.id}`, reason: "owner disposition is unresolved" })) });
      }
      change.decision = { authority: request.authority, conditions: clone(request.conditions ?? []), decidedAt: timestamp(context.now), decidedBy: actor(context), outcome: request.decision, rationale: request.rationale };
      change.status = { approve: "approved", reject: "rejected", defer: "deferred" }[request.decision];
      changeHistory(change, context, "decided", { decision: request.decision, status: change.status });
      const outboxEvent = event(control, context, "change.decided", change.id, [change.accountableOwner, ...change.impacts.map(({ owner }) => owner)], `${change.id} was ${change.status}`);
      return { change: clone(change), decision: clone(change.decision), outboxEvent };
    });
  }
}

export class ChangePreviewStore {
  constructor(options = {}) { this.entries = new Map(); this.ttlMilliseconds = options.ttlMilliseconds ?? 5 * 60 * 1000; }
  issue(value, now) {
    const token = `${randomUUID()}${randomUUID().replaceAll("-", "")}`;
    this.entries.set(token, { ...clone(value), expiresAt: new Date(now).getTime() + this.ttlMilliseconds });
    return token;
  }
  get(token, context) {
    const entry = this.entries.get(token);
    if (!entry || entry.identity !== identityScope(context.identity, "changes.implementation") || entry.expiresAt <= new Date(context.now).getTime()) throw new ApplicationError("PREVIEW_EXPIRED", "Change implementation preview is missing, expired, or belongs to another actor");
    return clone(entry);
  }
}

function applyChangeOperations(documents, change, context, policy) {
  const allocation = localAllocation(documents);
  return change.proposedChanges.map((operation) => applyBulkOperation(documents, allocation, {
    ...clone(operation),
    ...(operation.operation === "create" ? {} : { changeId: change.id }),
    ...(operation.operation === "retire" && !operation.decisionReference ? { decisionReference: change.id } : {}),
    [GOVERNED_CHANGE_COMMIT]: true,
  }, context, policy));
}

export class PreviewChangeImplementationService extends WorkflowService {
  constructor(options) { super(options); this.previewStore = options.changePreviewStore; }
  async execute(request, context) {
    try {
      const [before, policy] = await Promise.all([this.repository.read(), this.policy()]);
      if (request.expectedRepositoryRevision !== before.business.repositoryRevision) throw new ApplicationError("VERSION_CONFLICT", "Expected repository revision does not match current revision");
      const change = findChange(before, request.changeId);
      assertVersion(change, request.expectedVersion, before.business.repositoryRevision, "change");
      if (change.status !== "approved") throw new ApplicationError("INVALID_ARGUMENT", "Only approved changes can be previewed for implementation");
      const after = clone(before);
      const results = applyChangeOperations(after, findChange(after, change.id), context, policy);
      assertValidRepositoryDocuments(after.business, after.software, policy);
      const summary = summarize(before, after, results);
      const diff = results.map((result, index) => ({ operation: change.proposedChanges[index].operation, result: clone(result) }));
      const diffHash = canonicalHash({ changeId: change.id, changeVersion: change.version, diff, repositoryRevision: before.business.repositoryRevision, summary });
      const previewToken = this.previewStore.issue({ changeId: change.id, changeVersion: change.version, commandTime: timestamp(context.now), diffHash, identity: identityScope(context.identity, "changes.implementation"), repositoryRevision: before.business.repositoryRevision, summary }, context.now);
      return operationResponse(request, before.business.repositoryRevision, { changeId: change.id, changeVersion: change.version, diff, diffHash, previewToken, summary });
    } catch (error) { throw applicationError(error); }
  }
}

export class CommitChangeImplementationService extends WorkflowService {
  constructor(options) { super(options); this.previewStore = options.changePreviewStore; }
  async execute(request, context) {
    const policy = await this.policy();
    return this.mutate(request, context, "changes.commitImplementation", (documents) => {
      const preview = this.previewStore.get(request.previewToken, context);
      if (documents.business.repositoryRevision !== preview.repositoryRevision) throw new ApplicationError("VERSION_CONFLICT", "Repository changed after implementation preview", { details: [{ path: "/previewToken", reason: "a new preview is required" }] });
      const control = ensureChangeControl(documents);
      const change = findChange(documents, preview.changeId);
      assertVersion(change, preview.changeVersion, documents.business.repositoryRevision, "change");
      if (change.status !== "approved") throw new ApplicationError("INVALID_ARGUMENT", "Change approval is no longer current");
      const before = clone(documents);
      change.status = "implementing";
      const results = applyChangeOperations(documents, change, { ...context, now: preview.commandTime }, policy);
      const summary = summarize(before, documents, results);
      const diff = results.map((result, index) => ({ operation: change.proposedChanges[index].operation, result: clone(result) }));
      const diffHash = canonicalHash({ changeId: change.id, changeVersion: preview.changeVersion, diff, repositoryRevision: preview.repositoryRevision, summary });
      if (diffHash !== preview.diffHash || canonicalHash(summary) !== canonicalHash(preview.summary)) throw new ApplicationError("INVALID_ARGUMENT", "Implementation no longer matches the exact approved preview");
      change.implementation = { commands: change.proposedChanges.map((operation, index) => ({ index, operation: operation.operation, status: "completed" })), committedAt: timestamp(context.now), diffHash, repositoryRevisionBefore: preview.repositoryRevision, summary };
      for (const impact of change.impacts) impact.implementationStatus = "addressed";
      change.status = "verifying";
      changeHistory(change, context, "implemented", { diffHash, status: change.status });
      const outboxEvent = event(control, context, "change.implemented", change.id, [change.accountableOwner, ...change.impacts.map(({ owner }) => owner)], `${change.id} implementation committed`);
      return { change: clone(change), diffHash, outboxEvent, results: clone(results), summary };
    }, undefined);
  }
}

export class CloseChangeService extends WorkflowService {
  async execute(request, context) {
    assertAuthority(request.authority, context);
    for (const [index, exception] of (request.residualExceptions ?? []).entries()) {
      assertAuthority(exception.approver, context, `/residualExceptions/${index}/approver`);
      if (!exception.expiresAt && !exception.reviewAt) throw new ApplicationError("INVALID_ARGUMENT", "Residual exceptions require an expiry or review date");
    }
    return this.mutate(request, context, "changes.close", (documents) => {
      const control = ensureChangeControl(documents);
      const change = findChange(documents, request.changeId);
      assertVersion(change, request.expectedVersion, documents.business.repositoryRevision, "change");
      if (change.status !== "verifying") throw new ApplicationError("INVALID_ARGUMENT", "Only implemented changes in verification can be closed");
      const blockers = [];
      if (change.implementation?.commands?.some(({ status }) => status !== "completed") || !change.implementation?.commands?.length) blockers.push({ path: "/implementation/commands", reason: "implementation commands are incomplete" });
      for (const impact of change.impacts.filter(({ critical, implementationStatus }) => critical && implementationStatus !== "addressed")) blockers.push({ path: `/impacts/${impact.artifact.id}`, reason: "critical impact remains unresolved" });
      const affectedIds = new Set(change.proposedChanges.map(({ id }) => id).filter(Boolean));
      for (const relationship of allRelationships(documents).filter((entry) => activeRelationship(entry) && (entry.suspect || entry.status === "suspect") && (affectedIds.has(entry.source?.id) || affectedIds.has(entry.target?.id)))) blockers.push({ path: `/relationships/${relationship.id}`, reason: "suspect relationship remains unresolved" });
      if (!request.evidenceReferences.length) blockers.push({ path: "/evidenceReferences", reason: "closure evidence is required" });
      for (const evidence of request.evidenceReferences.filter(({ status }) => status === "failed" || status === "planned")) blockers.push({ path: `/evidenceReferences/${evidence.id}`, reason: "required evidence is not successful" });
      for (const outbox of control.outbox.filter(({ aggregateId, status }) => aggregateId === change.id && new Set(["failed", "dead-letter"]).has(status))) blockers.push({ path: `/outbox/${outbox.id}`, reason: "notification delivery requires operator attention" });
      if (blockers.length) throw new ApplicationError("INVALID_ARGUMENT", "Change closure requirements are not satisfied", { details: blockers.slice(0, 100) });
      change.closure = { authority: request.authority, closedAt: timestamp(context.now), closedBy: actor(context), evidenceReferences: clone(request.evidenceReferences), rationale: request.rationale, residualExceptions: clone(request.residualExceptions ?? []) };
      change.status = "closed";
      changeHistory(change, context, "closed", { status: change.status });
      const outboxEvent = event(control, context, "change.closed", change.id, [change.accountableOwner, ...change.impacts.map(({ owner }) => owner)], `${change.id} was closed`);
      return { change: clone(change), outboxEvent };
    });
  }
}

export class GetChangeService extends WorkflowService {
  async execute(request) {
    try {
      const documents = await this.repository.read();
      const change = findChange(documents, request.changeId);
      if (!change) throw new ApplicationError("NOT_FOUND", "Change was not found");
      return operationResponse(request, documents.business.repositoryRevision, { change: clone(change) });
    } catch (error) { throw applicationError(error); }
  }
}

export class WorkflowDashboardService extends WorkflowService {
  async execute(request) {
    try {
      const documents = await this.repository.read();
      const changes = (documents.business.changeControl?.changes ?? []).filter((change) => (request.includeClosed || !new Set(["closed", "cancelled", "rejected"]).has(change.status)) && (!request.owner || change.accountableOwner === request.owner || change.impacts.some(({ owner }) => owner === request.owner)));
      const requirements = allRequirements(documents).filter((item) => !request.owner || item.owner === request.owner);
      const byState = Object.fromEntries([...new Set(requirements.map(({ status }) => status))].sort().map((status) => [status, requirements.filter((item) => item.status === status).length]));
      const openImpacts = changes.flatMap((change) => change.impacts.filter(({ disposition }) => !new Set(["accepted", "mitigated", "not_affected"]).has(disposition)).map((impact) => ({ changeId: change.id, ...clone(impact) })));
      return operationResponse(request, documents.business.repositoryRevision, { byState, changes: clone(changes), openImpacts, outboxFailures: clone((documents.business.changeControl?.outbox ?? []).filter(({ status }) => new Set(["failed", "dead-letter"]).has(status))) });
    } catch (error) { throw applicationError(error); }
  }
}

export class TransactionalOutbox {
  constructor({ repository, handler, maximumAttempts = 5, clock = { now: () => new Date().toISOString() } }) {
    this.repository = repository;
    this.handler = handler;
    this.maximumAttempts = maximumAttempts;
    this.clock = clock;
  }

  async pending() {
    const documents = await this.repository.read();
    return clone((documents.business.changeControl?.outbox ?? []).filter(({ status }) => new Set(["pending", "failed"]).has(status)));
  }

  async deliverNext() {
    const [candidate] = await this.pending();
    if (!candidate) return null;
    let failure;
    try { await this.handler.deliver(clone(candidate), { idempotencyKey: candidate.id }); }
    catch (error) { failure = error; }
    const result = await this.repository.execute((documents) => {
      const current = ensureChangeControl(documents).outbox.find(({ id }) => id === candidate.id);
      if (!current || current.status === "delivered") return { event: clone(current), replayed: true };
      current.attempts += 1;
      current.lastAttemptAt = timestamp(this.clock.now());
      if (failure) {
        current.lastError = String(failure.message ?? failure).slice(0, 1000);
        current.status = current.attempts >= this.maximumAttempts ? "dead-letter" : "failed";
      } else {
        current.deliveredAt = timestamp(this.clock.now());
        current.status = "delivered";
      }
      return { event: clone(current), replayed: false };
    }, { actor: "outbox-processor" });
    return result.result;
  }
}

export function createWorkflowServices(options) {
  const changePreviewStore = options.changePreviewStore ?? new ChangePreviewStore(options.previewTokens);
  const shared = { ...options, changePreviewStore };
  return {
    AnalyzeChangeService: new AnalyzeChangeService(shared),
    CloseChangeService: new CloseChangeService(shared),
    CommitChangeImplementationService: new CommitChangeImplementationService(shared),
    CreateChangeService: new CreateChangeService(shared),
    DecideChangeService: new DecideChangeService(shared),
    DispositionImpactService: new DispositionImpactService(shared),
    GetChangeService: new GetChangeService(shared),
    PossibleTransitionsService: new PossibleTransitionsService(shared),
    PreviewChangeImplementationService: new PreviewChangeImplementationService(shared),
    TransitionRequirementService: new TransitionRequirementService(shared),
    TriageChangeService: new TriageChangeService(shared),
    WorkflowDashboardService: new WorkflowDashboardService(shared),
  };
}
