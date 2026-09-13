import { randomUUID } from "node:crypto";

import { canonicalHash } from "../../adapters/repository/canonical-json.js";
import { ApplicationError } from "../errors.js";
import { applyBulkOperation, updateCandidate } from "./authoring.js";

const clone = (value) => structuredClone(value);
const SHARED_FIELDS = Object.freeze(["statement", "shortLabel", "category", "priority", "criticality", "owner", "rationale", "verificationMethods", "acceptanceCriteria", "sourceReferences", "customAttributes"]);
const AI_CONTENT_FIELDS = Object.freeze(["level", ...SHARED_FIELDS]);

function actor(context) { return context.identity?.agentId ?? "unknown-agent"; }
function principal(context) { return context.identity?.principal?.id ?? "unknown-principal"; }
function scope(context, operation) { return `${operation}:${principal(context)}:${actor(context)}`; }
function timestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApplicationError("INVALID_ARGUMENT", "The trusted clock returned an invalid timestamp");
  return parsed.toISOString();
}
function response(request, repositoryRevision, data) { return { schemaVersion: "1.0.0", repositoryRevision, correlationId: request.correlationId, data }; }
function allRequirements(documents) { return [...documents.business.requirements, ...documents.software.requirements]; }
function findRequirement(documents, id) { return allRequirements(documents).find((item) => item.id === id); }
function content(value, fields = SHARED_FIELDS) { return Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, clone(value[field])])); }
function commandHash(request) { const copy = clone(request); delete copy.correlationId; delete copy.idempotencyKey; return canonicalHash(copy); }
function idempotency(request, context, operation) { return { correlationId: request.correlationId, key: request.idempotencyKey, requestHash: commandHash(request), scope: scope(context, operation) }; }
function provenance(request, context, operation) { return { command: operation, correlationId: request.correlationId, principalId: principal(context), reason: request.rationale, role: context.identity?.role }; }
function exactVersion(item, version, repositoryRevision) {
  if (!item) throw new ApplicationError("NOT_FOUND", "Requirement was not found");
  if (item.version !== version) throw new ApplicationError("VERSION_CONFLICT", "Expected item version does not match current version", { current: { itemVersion: item.version, repositoryRevision } });
}
function requireVisible(item, context) {
  if (context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, item)) throw new ApplicationError("NOT_FOUND", "Requirement was not found");
}

export class AdoptReuseService {
  constructor(options) { this.repository = options.repository; this.configuredPolicy = options.policy; }
  async execute(request, context) {
    const policy = this.configuredPolicy ? clone(this.configuredPolicy) : await this.repository.getPolicy();
    const result = await this.repository.execute((documents, allocation) => {
      const source = findRequirement(documents, request.sourceId);
      exactVersion(source, request.sourceExpectedVersion, documents.business.repositoryRevision);
      requireVisible(source, context);
      if (source.status === "retired") throw new ApplicationError("INVALID_ARGUMENT", "Retired requirements cannot be adopted for reuse");
      const draft = { ...content(source), level: source.level, source: `reuse:${request.sourceRepository}:${source.id}` };
      delete draft.reuse;
      const created = applyBulkOperation(documents, allocation, { operation: "create", draft }, context, policy);
      created.record.reuse = {
        adoptedAt: timestamp(context.now), adoptedBy: actor(context), applicability: clone(request.applicability), mode: request.mode,
        originId: source.id, originVersion: source.version, sourceRepository: request.sourceRepository,
        ...(request.sourceLibrary ? { sourceLibrary: request.sourceLibrary } : {}), synchronizationState: "current", synchronizedAt: timestamp(context.now),
      };
      return { record: clone(created.record), warnings: created.warnings };
    }, { actor: actor(context), expectedRepositoryRevision: request.expectedRepositoryRevision, idempotency: idempotency(request, context, "reuse.adopt"), provenance: provenance(request, context, "reuse.adopt") });
    return response(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
  }
}

export class ReusePreviewStore {
  constructor(options = {}) { this.entries = new Map(); this.ttlMilliseconds = options.ttlMilliseconds ?? 5 * 60 * 1000; }
  issue(value, now) { const token = `${randomUUID()}${randomUUID().replaceAll("-", "")}`; this.entries.set(token, { ...clone(value), expiresAt: new Date(now).getTime() + this.ttlMilliseconds }); return token; }
  get(token, context) {
    const entry = this.entries.get(token);
    if (!entry || entry.identity !== scope(context, "reuse.propagation") || entry.expiresAt <= new Date(context.now).getTime()) throw new ApplicationError("PREVIEW_EXPIRED", "Reuse propagation preview is missing, expired, or belongs to another actor");
    return clone(entry);
  }
}

function propagation(before, request, context) {
  const after = clone(before);
  const source = findRequirement(after, request.sourceId);
  exactVersion(source, request.sourceExpectedVersion, before.business.repositoryRevision);
  requireVisible(source, context);
  const uses = allRequirements(after).filter((item) => item.reuse?.originId === source.id);
  const dispositions = new Map();
  for (const disposition of request.dispositions) {
    if (dispositions.has(disposition.id)) throw new ApplicationError("INVALID_ARGUMENT", "Each reuse disposition must appear exactly once");
    dispositions.set(disposition.id, disposition);
  }
  if (uses.length !== dispositions.size || uses.some(({ id }) => !dispositions.has(id))) throw new ApplicationError("INVALID_ARGUMENT", "A disposition is required for every current use");
  const items = [];
  const now = timestamp(context.now);
  for (const use of uses.sort((a, b) => a.id.localeCompare(b.id))) {
    requireVisible(use, context);
    const disposition = dispositions.get(use.id);
    const baselines = (after.business.changeControl?.baselineMemberships ?? []).filter(({ requirementId }) => requirementId === use.id).map(({ baselineId, version }) => ({ baselineId, version }));
    const beforeContent = content(use);
    if (disposition.action === "retain-divergence") {
      if (use.reuse.mode !== "controlled-clone") throw new ApplicationError("INVALID_ARGUMENT", "Governed references cannot retain a local divergence; adopt a controlled clone when variation is required");
      use.reuse = { ...use.reuse, divergenceRationale: disposition.rationale, originVersion: source.version, synchronizationState: "intentional-divergence" };
      use.version += 1;
      use.provenance = { ...use.provenance, accountablePrincipal: principal(context), updatedAt: now, updatedBy: actor(context) };
      items.push({ id: use.id, action: disposition.action, baselines, variant: use.customAttributes?.variant ?? use.reuse.applicability?.variant ?? null, changedFields: [], rationale: disposition.rationale });
      continue;
    }
    for (const field of SHARED_FIELDS) {
      if (field in source) use[field] = clone(source[field]);
      else delete use[field];
    }
    const changedFields = SHARED_FIELDS.filter((field) => canonicalHash({ value: beforeContent[field], present: field in beforeContent }) !== canonicalHash({ value: use[field], present: field in use }));
    use.reuse = { ...use.reuse, originVersion: source.version, synchronizationState: "current", synchronizedAt: now };
    delete use.reuse.divergenceRationale;
    if (changedFields.length) {
      use.version += 1;
      use.provenance = { ...use.provenance, accountablePrincipal: principal(context), updatedAt: now, updatedBy: actor(context) };
    }
    items.push({ id: use.id, action: disposition.action, baselines, variant: use.customAttributes?.variant ?? use.reuse.applicability?.variant ?? null, changedFields, rationale: disposition.rationale });
  }
  return { after, items, source: { id: source.id, version: source.version } };
}

export class PreviewReusePropagationService {
  constructor(options) { this.repository = options.repository; this.store = options.reusePreviewStore; }
  async execute(request, context) {
    const before = await this.repository.read();
    if (before.business.repositoryRevision !== request.expectedRepositoryRevision) throw new ApplicationError("VERSION_CONFLICT", "Expected repository revision does not match current revision", { current: { repositoryRevision: before.business.repositoryRevision } });
    const prepared = propagation(before, request, context);
    const diffHash = canonicalHash({ after: prepared.after, dispositions: request.dispositions, repositoryRevision: before.business.repositoryRevision, source: prepared.source });
    const previewToken = this.store.issue({ after: prepared.after, diffHash, identity: scope(context, "reuse.propagation"), repositoryRevision: before.business.repositoryRevision, source: prepared.source }, context.now);
    return response(request, before.business.repositoryRevision, { diffHash, items: prepared.items, previewToken, source: prepared.source });
  }
}

export class CommitReusePropagationService {
  constructor(options) { this.repository = options.repository; this.store = options.reusePreviewStore; }
  async execute(request, context) {
    let preview;
    const result = await this.repository.execute((documents) => {
      preview = this.store.get(request.previewToken, context);
      if (request.diffHash !== preview.diffHash) throw new ApplicationError("INVALID_ARGUMENT", "Reuse propagation diff hash differs from the preview");
      if (documents.business.repositoryRevision !== preview.repositoryRevision || request.expectedRepositoryRevision !== preview.repositoryRevision) throw new ApplicationError("VERSION_CONFLICT", "Repository changed after reuse preview", { current: { repositoryRevision: documents.business.repositoryRevision } });
      for (const level of ["business", "software"]) documents[level].requirements = clone(preview.after[level].requirements);
      return { diffHash: preview.diffHash, source: preview.source };
    }, { actor: actor(context), expectedRepositoryRevision: request.expectedRepositoryRevision, idempotency: idempotency(request, context, "reuse.commitPropagation"), provenance: provenance(request, context, "reuse.commitPropagation") });
    return response(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
  }
}

export class ProposeAiRequirementService {
  constructor(options) { this.repository = options.repository; this.configuredPolicy = options.policy; this.aiPolicy = options.aiPolicy ?? { allowExternalProcessing: false, protectedFields: [] }; }
  async execute(request, context) {
    const containsProtectedFields = (this.aiPolicy.protectedFields ?? []).some((field) => request.draft?.[field] !== undefined);
    if (request.processor === "external" && (!this.aiPolicy.allowExternalProcessing || request.protectedFieldsIncluded || containsProtectedFields)) throw new ApplicationError("FORBIDDEN", "Deployment policy does not authorize sending protected fields to this external AI processor");
    const policy = this.configuredPolicy ? clone(this.configuredPolicy) : await this.repository.getPolicy();
    const now = timestamp(context.now);
    const proposedContentHash = canonicalHash(content(request.draft, AI_CONTENT_FIELDS));
    const result = await this.repository.execute((documents, allocation) => {
      for (const reference of request.sourceItems) {
        const item = findRequirement(documents, reference.id);
        exactVersion(item, reference.version, documents.business.repositoryRevision);
        requireVisible(item, context);
      }
      const draft = { ...clone(request.draft), status: undefined, aiAssistance: {
        assisted: true, contentHash: proposedContentHash, generatedAt: now, model: request.model, promptTemplateVersion: request.promptTemplateVersion,
        proposalStatus: "proposed", provider: request.provider, rationale: request.rationale, requester: principal(context), ruleVersion: request.ruleVersion,
        runId: request.runId, service: request.service, sourceItems: clone(request.sourceItems), suggestionId: request.runId,
      } };
      delete draft.status;
      const created = applyBulkOperation(documents, allocation, { operation: "create", draft }, context, policy);
      return { proposal: clone(created.record), proposedContentHash, warnings: created.warnings };
    }, { actor: actor(context), expectedRepositoryRevision: request.expectedRepositoryRevision, idempotency: idempotency(request, context, "ai.proposeRequirement"), provenance: provenance(request, context, "ai.proposeRequirement") });
    return response(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
  }
}

export class AcceptAiProposalService {
  constructor(options) { this.repository = options.repository; this.configuredPolicy = options.policy; }
  async execute(request, context) {
    if (!principal(context).startsWith("human:")) throw new ApplicationError("FORBIDDEN", "AI proposal acceptance requires an authenticated accountable human principal");
    const policy = this.configuredPolicy ? clone(this.configuredPolicy) : await this.repository.getPolicy();
    const result = await this.repository.execute((documents) => {
      let item = findRequirement(documents, request.id);
      exactVersion(item, request.expectedVersion, documents.business.repositoryRevision);
      requireVisible(item, context);
      const assistance = item.provenance?.aiAssistance;
      if (!assistance?.assisted || assistance.proposalStatus !== "proposed") throw new ApplicationError("INVALID_ARGUMENT", "Requirement is not an unaccepted AI proposal");
      const currentHash = canonicalHash(content(item, AI_CONTENT_FIELDS));
      if (request.proposedContentHash !== assistance.contentHash || currentHash !== assistance.contentHash) throw new ApplicationError("VERSION_CONFLICT", "AI proposal content changed after generation");
      if (request.acceptedPatch && "reuse" in request.acceptedPatch) throw new ApplicationError("SCHEMA_VIOLATION", "AI acceptance cannot alter reuse governance metadata");
      let diff = [];
      if (request.acceptedPatch && Object.keys(request.acceptedPatch).length) {
        const updated = updateCandidate(documents, { id: item.id, expectedVersion: item.version, patch: request.acceptedPatch, reason: request.rationale }, context, policy);
        diff = updated.diff;
        item = findRequirement(documents, request.id);
      } else {
        item.version += 1;
        item.provenance = { ...item.provenance, updatedAt: timestamp(context.now), updatedBy: actor(context) };
      }
      const acceptedContentHash = canonicalHash(content(item, AI_CONTENT_FIELDS));
      item.provenance.aiAssistance = { ...assistance, acceptance: { acceptedAt: timestamp(context.now), acceptedBy: actor(context), acceptedContentHash, diff: diff.map(({ field, before, after }) => ({ field, before, after })), principal: principal(context), proposedContentHash: assistance.contentHash, rationale: request.rationale }, proposalStatus: "accepted" };
      return { acceptedContentHash, diff, item: clone(item), lifecycleStatusChanged: false };
    }, { actor: actor(context), expectedRepositoryRevision: request.expectedRepositoryRevision, idempotency: idempotency(request, context, "ai.acceptProposal"), provenance: provenance(request, context, "ai.acceptProposal") });
    return response(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
  }
}

export function createReuseAiGovernanceServices(options) {
  const reusePreviewStore = options.reusePreviewStore ?? new ReusePreviewStore(options.reusePreviewTokens);
  const shared = { ...options, reusePreviewStore };
  return {
    AdoptReuseService: new AdoptReuseService(shared), PreviewReusePropagationService: new PreviewReusePropagationService(shared), CommitReusePropagationService: new CommitReusePropagationService(shared),
    ProposeAiRequirementService: new ProposeAiRequirementService(shared), AcceptAiProposalService: new AcceptAiProposalService(shared),
  };
}

export { AI_CONTENT_FIELDS, SHARED_FIELDS };
