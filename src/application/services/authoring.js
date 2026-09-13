import { randomUUID } from "node:crypto";

import { assertValidRepositoryDocuments } from "../../adapters/repository/validation.js";
import { canonicalHash } from "../../adapters/repository/canonical-json.js";
import { parseRequirementId } from "../../domain/identifiers.js";
import { blockingFindings, QUALITY_RULE_CATALOG, QUALITY_RULE_VERSION, validateRequirementDraft } from "../../domain/quality.js";
import { ApplicationError } from "../errors.js";

const MATERIAL_FIELDS = new Set(["statement", "category", "rationale", "verificationMethods", "acceptanceCriteria", "sourceReferences"]);
const FIELD_CLASSIFICATION = Object.freeze({
  statement: "material", category: "material", rationale: "material", verificationMethods: "material", acceptanceCriteria: "material", sourceReferences: "material",
  shortLabel: "metadata-only", priority: "metadata-only", criticality: "metadata-only", owner: "metadata-only", customAttributes: "administrative",
});
const PATCH_FIELDS = new Set(Object.keys(FIELD_CLASSIFICATION));

function clone(value) {
  return structuredClone(value);
}

function timestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApplicationError("INVALID_ARGUMENT", "The trusted clock returned an invalid timestamp");
  return parsed.toISOString();
}

function allRequirements(documents) {
  return [...documents.business.requirements, ...documents.software.requirements];
}

function allRelationships(documents) {
  return [...documents.business.relationships, ...documents.software.relationships];
}

function documentForId(documents, id) {
  const level = parseRequirementId(id)?.level;
  return level ? documents[level] : null;
}

function requirement(documents, id) {
  return documentForId(documents, id)?.requirements.find((item) => item.id === id);
}

function activeRelationship(item) {
  return !item.retirement;
}

function applicationError(error) {
  if (error instanceof ApplicationError) return error;
  const known = new Set(["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "VERSION_CONFLICT", "REPOSITORY_BUSY", "INTEGRITY_FAILURE"]);
  return new ApplicationError(known.has(error?.code) ? error.code : "INTERNAL_ERROR", error?.message ?? "Authoring operation failed", {
    details: error?.details ?? [],
    retryable: error?.code === "REPOSITORY_BUSY",
    cause: error,
  });
}

function operationResponse(request, repositoryRevision, data) {
  return { schemaVersion: "1.0.0", repositoryRevision, correlationId: request.correlationId, data };
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

function sameField(item, field, value) {
  return canonicalHash({ present: field in item, value: field in item ? item[field] : null }) === canonicalHash({ present: true, value });
}

function boundedValue(value, present = true, maximumBytes = 8_192) {
  if (!present) return { present: false, value: null };
  const serialized = JSON.stringify(value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes <= maximumBytes) return { present: true, value: clone(value) };
  return { present: true, value: { bytes, hash: canonicalHash(value), preview: serialized.slice(0, 512), truncated: true } };
}

function idempotency(request, context, operation) {
  return { correlationId: request.correlationId, scope: identityScope(context.identity, operation), key: request.idempotencyKey, requestHash: commandHash(request) };
}

function actor(context) {
  return context.identity?.agentId ?? "unknown-agent";
}

function principal(context) {
  return context.identity?.principal?.id ?? "unknown-principal";
}

function provenance(draft, context) {
  const now = timestamp(context.now);
  const assistance = draft.aiAssistance ?? { assisted: false };
  return {
    accountablePrincipal: principal(context),
    aiAssistance: clone(assistance),
    createdAt: now,
    createdBy: actor(context),
    ...(draft.source ? { source: draft.source } : {}),
    updatedAt: now,
    updatedBy: actor(context),
  };
}

function governedDraft(draft) {
  const output = {};
  for (const field of ["level", "statement", "shortLabel", "category", "status", "priority", "criticality", "owner", "rationale", "verificationMethods", "acceptanceCriteria", "sourceReferences", "customAttributes"]) {
    if (field in draft) output[field] = clone(draft[field]);
  }
  return output;
}

function candidateDraft(item) {
  const output = governedDraft(item);
  output.source = item.provenance?.source;
  output.aiAssistance = item.provenance?.aiAssistance;
  return output;
}

function assertFindings(findings, message = "Requirement content failed governed validation") {
  const failures = blockingFindings(findings);
  if (failures.length) throw new ApplicationError("SCHEMA_VIOLATION", message, { details: failures.map(({ path, explanation, ruleId }) => ({ path, reason: `${ruleId}: ${explanation}` })) });
}

function warnings(findings) {
  return findings.filter(({ blocking }) => !blocking);
}

function assertItemVersion(item, expectedVersion, repositoryRevision) {
  if (!item) throw new ApplicationError("NOT_FOUND", "Requirement was not found");
  if (item.version !== expectedVersion) throw new ApplicationError("VERSION_CONFLICT", "Expected item version does not match current version", {
    current: { repositoryRevision, itemVersion: item.version },
    details: [{ path: "/expectedVersion", reason: `current item version is ${item.version}` }],
  });
}

function assertItemScope(item, context) {
  if (context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, item)) throw new ApplicationError("NOT_FOUND", "Requirement was not found");
}

function visibleRequirements(documents, context) {
  return allRequirements(documents).filter((item) => !context.authorization?.canReadItem || context.authorization.canReadItem(context.security, item));
}

function createCandidate(documents, allocation, draft, context, policy, existing = visibleRequirements(documents, context)) {
  const defaultStatus = policy.authoringRules.defaultStatus;
  if (draft.status !== undefined && draft.status !== defaultStatus) throw new ApplicationError("SCHEMA_VIOLATION", "Normal create commands cannot select a governed lifecycle status", { details: [{ path: "/draft/status", reason: `must be omitted or ${defaultStatus}; privileged imports use a separate workflow` }] });
  const normalized = { ...clone(draft), status: defaultStatus };
  const findings = validateRequirementDraft(normalized, policy, { existingRequirements: existing, forCommit: true });
  assertFindings(findings);
  const id = allocation.allocateRequirementId(normalized.level);
  const record = {
    ...governedDraft(normalized),
    id,
    provenance: provenance(normalized, context),
    version: 1,
  };
  assertItemScope(record, context);
  documents[normalized.level].requirements.push(record);
  return { record, warnings: warnings(findings) };
}

function updateCandidate(documents, request, context, policy) {
  const item = requirement(documents, request.id);
  assertItemVersion(item, request.expectedVersion, documents.business.repositoryRevision);
  assertItemScope(item, context);
  if (item.status === "retired") throw new ApplicationError("INVALID_ARGUMENT", "Retired requirements cannot be updated");
  const unknown = Object.keys(request.patch ?? {}).filter((field) => !PATCH_FIELDS.has(field));
  if (unknown.length) throw new ApplicationError("SCHEMA_VIOLATION", "Patch contains unsupported fields", { details: unknown.map((field) => ({ path: `/patch/${field}`, reason: "is not a mutable requirement field" })) });
  const material = Object.keys(request.patch ?? {}).filter((field) => MATERIAL_FIELDS.has(field));
  if (material.length && !request.reason) throw new ApplicationError("SCHEMA_VIOLATION", "A reason is required for material changes", { details: [{ path: "/reason", reason: `is required for material fields: ${material.join(", ")}` }] });
  const diff = [];
  for (const [field, value] of Object.entries(request.patch ?? {})) {
    if (sameField(item, field, value)) continue;
    const before = boundedValue(item[field], field in item);
    const after = boundedValue(value);
    diff.push({ field, classification: FIELD_CLASSIFICATION[field], before: before.value, beforePresent: before.present, after: after.value, afterPresent: after.present });
    item[field] = clone(value);
  }
  if (!diff.length) return { changed: false, diff, item: clone(item), warnings: [] };
  item.version += 1;
  item.provenance = { ...item.provenance, updatedAt: timestamp(context.now), updatedBy: actor(context) };
  const findings = validateRequirementDraft(candidateDraft(item), policy, { excludeId: item.id, existingRequirements: visibleRequirements(documents, context), forCommit: true });
  assertFindings(findings);
  return { changed: true, diff, item: clone(item), ...(request.reason ? { reason: request.reason } : {}), warnings: warnings(findings) };
}

function retirementImpact(documents, id, context) {
  const links = allRelationships(documents).filter((link) => activeRelationship(link) && (link.source?.id === id || link.target?.id === id)).map((link) => ({
    id: link.id,
    direction: link.source?.id === id ? "outbound" : "inbound",
    otherEndpoint: clone(link.source?.id === id ? link.target : link.source),
    suspect: link.suspect,
    type: link.type,
    version: link.version,
  }));
  const item = requirement(documents, id);
  const releases = item?.customAttributes?.release === undefined ? [] : Array.isArray(item.customAttributes.release) ? clone(item.customAttributes.release) : [item.customAttributes.release];
  const unresolvedCritical = links.filter((link) => {
    const linked = link.otherEndpoint.kind === "requirement" ? requirement(documents, link.otherEndpoint.id) : null;
    return link.suspect && new Set(["critical", "safety-critical"]).has(linked?.criticality);
  });
  const visibleLinks = links.filter((link) => link.otherEndpoint.kind !== "requirement" || !context.authorization?.canReadItem || context.authorization.canReadItem(context.security, requirement(documents, link.otherEndpoint.id)));
  const visibleIds = new Set(visibleLinks.map(({ id: relationshipId }) => relationshipId));
  return { blockingCritical: unresolvedCritical, preview: { baselines: [], links: visibleLinks, releases, unresolvedCritical: unresolvedCritical.filter(({ id: relationshipId }) => visibleIds.has(relationshipId)) } };
}

function retireCandidate(documents, allocation, request, context, policy) {
  const item = requirement(documents, request.id);
  assertItemVersion(item, request.expectedVersion, documents.business.repositoryRevision);
  assertItemScope(item, context);
  if (item.status === "retired") throw new ApplicationError("INVALID_ARGUMENT", "Requirement is already retired");
  const { blockingCritical, preview: impact } = retirementImpact(documents, request.id, context);
  if (new Set(policy.retirementRules.decisionReferenceStatuses).has(item.status) && !request.decisionReference) {
    throw new ApplicationError("INVALID_ARGUMENT", "A decision reference is required to retire governed lifecycle content", { details: [{ path: "/decisionReference", reason: `is required when status is ${item.status}` }] });
  }
  if (policy.retirementRules.blockUnresolvedCriticalDependencies && blockingCritical.length) {
    const visibleIds = new Set(impact.unresolvedCritical.map(({ id }) => id));
    const details = blockingCritical.filter(({ id }) => visibleIds.has(id)).map(({ id }) => ({ path: `/relationships/${id}`, reason: "critical suspect dependency must be resolved" }));
    throw new ApplicationError("INVALID_ARGUMENT", "Retirement is blocked by unresolved critical dependencies", { details: details.length ? details : [{ path: "/id", reason: "a critical dependency outside the caller scope must be resolved" }] });
  }
  if (request.replacementId) {
    if (request.replacementId === request.id) throw new ApplicationError("INVALID_ARGUMENT", "A requirement cannot supersede itself");
    const replacement = requirement(documents, request.replacementId);
    if (!replacement || replacement.status === "retired") throw new ApplicationError("NOT_FOUND", "Replacement requirement was not found");
    const duplicate = allRelationships(documents).some((link) => activeRelationship(link) && link.type === "supersedes" && link.source?.id === request.replacementId && link.target?.id === request.id);
    if (!duplicate) {
      const relationship = {
        id: allocation.allocateRelationshipId(),
        provenance: provenance({ source: `retirement:${request.id}`, aiAssistance: { assisted: false } }, context),
        rationale: request.reason,
        source: { id: request.replacementId, kind: "requirement" },
        suspect: false,
        target: { id: request.id, kind: "requirement" },
        type: "supersedes",
        version: 1,
      };
      documentForId(documents, request.replacementId).relationships.push(relationship);
      impact.supersession = { relationshipId: relationship.id, replacementId: request.replacementId };
    }
  }
  item.status = "retired";
  item.retirement = {
    ...(request.decisionReference ? { decisionReference: request.decisionReference } : {}),
    rationale: request.reason,
    retiredAt: timestamp(context.now),
    retiredBy: actor(context),
  };
  item.provenance = { ...item.provenance, updatedAt: timestamp(context.now), updatedBy: actor(context) };
  item.version += 1;
  return { impact, item: clone(item), warnings: [] };
}

function localAllocation(documents) {
  return Object.freeze({
    allocateRequirementId(level) {
      const document = documents[level];
      if (!document) throw new ApplicationError("INVALID_ARGUMENT", "Unknown requirement level");
      const prefix = level === "business" ? "BR" : "SR";
      const id = `${prefix}-${String(document.nextRequirementNumber).padStart(6, "0")}`;
      document.nextRequirementNumber += 1;
      return id;
    },
    allocateRelationshipId() {
      const number = documents.business.nextRelationshipNumber;
      if (number !== documents.software.nextRelationshipNumber) throw new ApplicationError("INTEGRITY_FAILURE", "Relationship allocators disagree");
      documents.business.nextRelationshipNumber += 1;
      documents.software.nextRelationshipNumber += 1;
      return `RL-${String(number).padStart(6, "0")}`;
    },
  });
}

function applyBulkOperation(documents, allocation, operation, context, policy) {
  const allowed = {
    create: new Set(["operation", "draft"]),
    update: new Set(["operation", "id", "expectedVersion", "patch", "reason"]),
    retire: new Set(["operation", "id", "expectedVersion", "reason", "decisionReference", "replacementId"]),
  }[operation.operation];
  if (!allowed) throw new ApplicationError("SCHEMA_VIOLATION", "Unsupported bulk operation");
  const irrelevant = Object.keys(operation).filter((field) => !allowed.has(field));
  if (irrelevant.length) throw new ApplicationError("SCHEMA_VIOLATION", "Bulk operation contains fields that do not apply", { details: irrelevant.map((field) => ({ path: `/${field}`, reason: `is not valid for ${operation.operation}` })) });
  if (operation.operation === "create") {
    if (!operation.draft) throw new ApplicationError("SCHEMA_VIOLATION", "Create bulk operation requires draft", { details: [{ path: "/draft", reason: "is required" }] });
    return createCandidate(documents, allocation, operation.draft, context, policy);
  }
  if (operation.operation === "update") {
    for (const field of ["id", "expectedVersion", "patch"]) if (operation[field] === undefined) throw new ApplicationError("SCHEMA_VIOLATION", "Update bulk operation is incomplete", { details: [{ path: `/${field}`, reason: "is required" }] });
    return updateCandidate(documents, operation, context, policy);
  }
  if (operation.operation === "retire") {
    for (const field of ["id", "expectedVersion", "reason"]) if (operation[field] === undefined) throw new ApplicationError("SCHEMA_VIOLATION", "Retire bulk operation is incomplete", { details: [{ path: `/${field}`, reason: "is required" }] });
    return retireCandidate(documents, allocation, operation, context, policy);
  }
  throw new ApplicationError("SCHEMA_VIOLATION", "Unsupported bulk operation");
}

function summarize(before, after, results) {
  const beforeItems = new Map(allRequirements(before).map((item) => [item.id, item]));
  const afterItems = new Map(allRequirements(after).map((item) => [item.id, item]));
  const items = [];
  for (const [id, item] of afterItems) {
    const old = beforeItems.get(id);
    if (!old) items.push({ id, change: "created", afterVersion: item.version });
    else if (canonicalHash(old) !== canonicalHash(item)) items.push({ id, change: item.status === "retired" && old.status !== "retired" ? "retired" : "updated", beforeVersion: old.version, afterVersion: item.version });
  }
  items.sort((left, right) => left.id.localeCompare(right.id));
  return { affectedIds: items.map(({ id }) => id), items, operationCount: results.length };
}

function compactBulkResult(operation, result) {
  const item = result.record ?? result.item;
  return { changed: result.changed ?? true, id: item?.id, itemVersion: item?.version, operation: operation.operation };
}

export class PreviewTokenStore {
  constructor(options = {}) {
    this.ttlMilliseconds = options.ttlMilliseconds ?? 5 * 60 * 1000;
    this.entries = new Map();
  }

  issue(payload, now) {
    const token = `${randomUUID()}${randomUUID().replaceAll("-", "")}`;
    this.entries.set(token, { ...clone(payload), expiresAt: new Date(now).getTime() + this.ttlMilliseconds });
    return token;
  }

  get(token, context) {
    const entry = this.entries.get(token);
    if (!entry || entry.identity !== identityScope(context.identity, "requirements.bulk") || entry.expiresAt <= new Date(context.now).getTime()) throw new ApplicationError("PREVIEW_EXPIRED", "Bulk preview token is missing, expired, or belongs to another actor");
    return clone(entry);
  }
}

class AuthoringService {
  constructor(options) {
    this.repository = options.repository;
    this.configuredPolicy = options.policy;
    this.audit = options.audit;
  }

  async policy() {
    return this.configuredPolicy ? clone(this.configuredPolicy) : this.repository.getPolicy();
  }

  async executeMutation(request, context, operation, mutator, expectedRepositoryRevision = request.expectedRepositoryRevision) {
    try {
      const result = await this.repository.execute(mutator, {
        actor: actor(context),
        expectedRepositoryRevision,
        idempotency: idempotency(request, context, operation),
      });
      const data = { ...result.result, replayed: result.replayed ?? false };
      if (result.committed && this.audit?.append) await this.audit.append({ agentId: actor(context), correlationId: request.correlationId, event: "governed-mutation", operation, principalId: principal(context), repositoryRevision: result.repositoryRevision, timestamp: timestamp(context.now) });
      return operationResponse(request, result.repositoryRevision, data);
    } catch (error) { throw applicationError(error); }
  }
}

export class ValidateDraftService extends AuthoringService {
  async execute(request, context) {
    try {
      const [documents, policy] = await Promise.all([this.repository.read(), this.policy()]);
      const visible = visibleRequirements(documents, context);
      const findings = validateRequirementDraft(request.draft, policy, { existingRequirements: visible, forCommit: true });
      return operationResponse(request, documents.business.repositoryRevision, {
        acceptedAutomatically: false,
        blocking: findings.some((finding) => finding.blocking),
        findings,
        ruleCatalogVersion: QUALITY_RULE_VERSION,
        rules: QUALITY_RULE_CATALOG,
      });
    } catch (error) { throw applicationError(error); }
  }
}

export class CreateRequirementService extends AuthoringService {
  async execute(request, context) {
    const policy = await this.policy();
    return this.executeMutation(request, context, "requirements.create", (documents, allocation) => createCandidate(documents, allocation, request.draft, context, policy));
  }
}

export class UpdateRequirementService extends AuthoringService {
  async execute(request, context) {
    const policy = await this.policy();
    return this.executeMutation(request, context, "requirements.update", (documents) => updateCandidate(documents, request, context, policy));
  }
}

export class RetireRequirementService extends AuthoringService {
  async execute(request, context) {
    const policy = await this.policy();
    return this.executeMutation(request, context, "requirements.retire", (documents, allocation) => retireCandidate(documents, allocation, request, context, policy));
  }
}

export class BulkPreviewService extends AuthoringService {
  constructor(options) {
    super(options);
    this.previewStore = options.previewStore;
    this.maximumBytes = options.bulkMaximumBytes;
  }

  async execute(request, context) {
    try {
      const [before, policy] = await Promise.all([this.repository.read(), this.policy()]);
      const revision = before.business.repositoryRevision;
      if (request.expectedRepositoryRevision !== revision) throw new ApplicationError("VERSION_CONFLICT", "Expected repository revision does not match current revision", { current: { repositoryRevision: revision }, details: [{ path: "/expectedRepositoryRevision", reason: `current revision is ${revision}` }] });
      if (request.operations.length > policy.limits.bulkMaximum) throw new ApplicationError("INVALID_ARGUMENT", `Bulk operation exceeds configured limit ${policy.limits.bulkMaximum}`);
      const maximumBytes = this.maximumBytes ?? policy.limits.bulkByteMaximum;
      if (Buffer.byteLength(JSON.stringify(request.operations), "utf8") > maximumBytes) throw new ApplicationError("INVALID_ARGUMENT", `Bulk operation exceeds byte limit ${maximumBytes}`);
      const after = clone(before);
      const allocation = localAllocation(after);
      const results = [];
      const errors = [];
      const collectedWarnings = [];
      const seenAffected = new Set();
      for (const [index, operation] of request.operations.entries()) {
        try {
          const result = applyBulkOperation(after, allocation, operation, context, policy);
          const affectedId = result.record?.id ?? result.item?.id;
          if (seenAffected.has(affectedId)) throw new ApplicationError("SCHEMA_VIOLATION", "A bulk command may affect each requirement only once", { details: [{ path: "/id", reason: `${affectedId} is repeated in the command set` }] });
          seenAffected.add(affectedId);
          results.push(result);
          collectedWarnings.push(...(result.warnings ?? []).map((finding) => ({ ...finding, operationIndex: index })));
        } catch (error) {
          const converted = applicationError(error);
          errors.push({ operationIndex: index, code: converted.code, message: converted.message, details: converted.details });
        }
      }
      if (!errors.length) {
        try { assertValidRepositoryDocuments(after.business, after.software, policy); }
        catch (error) { errors.push({ operationIndex: null, code: error.code, message: error.message, details: error.details }); }
      }
      const summary = summarize(before, after, results);
      if (errors.length) return operationResponse(request, revision, { affectedIds: summary.affectedIds, errors, valid: false, warnings: collectedWarnings });
      const diffHash = canonicalHash({ after, beforeRevision: revision, operations: request.operations, summary });
      const previewToken = this.previewStore.issue({
        commandTime: timestamp(context.now),
        diffHash,
        identity: identityScope(context.identity, "requirements.bulk"),
        operations: request.operations,
        repositoryRevision: revision,
        summary,
      }, context.now);
      return operationResponse(request, revision, { diffHash, errors: [], previewToken, summary, valid: true, warnings: collectedWarnings });
    } catch (error) { throw applicationError(error); }
  }
}

export class BulkCommitService extends AuthoringService {
  constructor(options) {
    super(options);
    this.previewStore = options.previewStore;
  }

  async execute(request, context) {
    const policy = await this.policy();
    let preview;
    return this.executeMutation(request, context, "requirements.bulkCommit", (documents, allocation) => {
      preview = this.previewStore.get(request.previewToken, context);
      const beforeRevision = documents.business.repositoryRevision;
      if (beforeRevision !== preview.repositoryRevision) throw new ApplicationError("VERSION_CONFLICT", "Repository changed after bulk preview", { current: { repositoryRevision: beforeRevision }, details: [{ path: "/previewToken", reason: "a new preview is required" }] });
      const before = clone(documents);
      const previewContext = { ...context, now: preview.commandTime };
      const results = preview.operations.map((operation) => applyBulkOperation(documents, allocation, operation, previewContext, policy));
      const summary = summarize(before, documents, results);
      const exactSummary = preview.summary;
      if (canonicalHash(summary.affectedIds) !== canonicalHash(exactSummary.affectedIds)) throw new ApplicationError("INVALID_ARGUMENT", "Bulk commit scope differs from preview");
      const recomputed = canonicalHash({ after: documents, beforeRevision, operations: preview.operations, summary: exactSummary });
      if (recomputed !== preview.diffHash) throw new ApplicationError("INVALID_ARGUMENT", "Bulk preview diff does not match the commit candidate");
      const allWarnings = results.flatMap((result) => result.warnings ?? []);
      return {
        diffHash: preview.diffHash,
        results: results.map((result, index) => compactBulkResult(preview.operations[index], result)),
        summary: exactSummary,
        warnings: allWarnings.slice(0, 100),
        warningsTruncated: allWarnings.length > 100,
      };
    }, undefined);
  }
}

export function createAuthoringServices(options) {
  const previewStore = options.previewStore ?? new PreviewTokenStore(options.previewTokens);
  const shared = { ...options, previewStore };
  return {
    ValidateDraftService: new ValidateDraftService(shared),
    CreateRequirementService: new CreateRequirementService(shared),
    UpdateRequirementService: new UpdateRequirementService(shared),
    RetireRequirementService: new RetireRequirementService(shared),
    BulkPreviewService: new BulkPreviewService(shared),
    BulkCommitService: new BulkCommitService(shared),
  };
}

export { FIELD_CLASSIFICATION, MATERIAL_FIELDS };
