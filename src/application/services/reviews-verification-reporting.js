import { canonicalHash } from "../../adapters/repository/canonical-json.js";
import { ApplicationError } from "../errors.js";

const clone = (value) => structuredClone(value);
const allRequirements = (documents) => [...documents.business.requirements, ...documents.software.requirements];
const allRelationships = (documents) => [...documents.business.relationships, ...documents.software.relationships];
const response = (request, revision, data, source) => ({ schemaVersion: "1.0.0", repositoryRevision: revision, correlationId: request.correlationId, data, ...(source ? { source } : {}) });
const actor = (context) => context.identity?.agentId ?? "unknown-agent";
const principal = (context) => context.identity?.principal?.id ?? "unknown-principal";
const timestamp = (value) => new Date(value).toISOString();

function converted(error) {
  if (error instanceof ApplicationError) return error;
  const known = new Set(["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "FORBIDDEN", "VERSION_CONFLICT", "REPOSITORY_BUSY", "INTEGRITY_FAILURE"]);
  return new ApplicationError(known.has(error?.code) ? error.code : "INTERNAL_ERROR", error?.message ?? "Quality operation failed", { cause: error, details: error?.details });
}

function commandHash(request) {
  const normalized = clone(request);
  delete normalized.correlationId;
  delete normalized.idempotencyKey;
  return canonicalHash(normalized);
}

function mutationOptions(request, context, operation) {
  return {
    actor: actor(context), expectedRepositoryRevision: request.expectedRepositoryRevision,
    idempotency: { correlationId: request.correlationId, key: request.idempotencyKey, requestHash: commandHash(request), scope: `${operation}:${principal(context)}:${actor(context)}` },
    provenance: { command: operation, correlationId: request.correlationId, principalId: principal(context), reason: request.rationale ?? request.purpose ?? request.summary, role: context.identity?.role },
  };
}

function ensureQuality(documents) {
  return documents.business.qualityControl ??= {
    evidence: [], nextEvidenceNumber: 1, nextFindingNumber: 1, nextPlanNumber: 1, nextReviewNumber: 1,
    reviews: [], schemaVersion: "1.0.0", verificationPlans: [],
  };
}

function allocate(quality, counter, prefix) {
  const number = quality[counter];
  if (!Number.isInteger(number) || number < 1 || number > 999_999) throw new ApplicationError("INTEGRITY_FAILURE", `${prefix} identifier space is exhausted or invalid`);
  quality[counter] += 1;
  return `${prefix}-${String(number).padStart(6, "0")}`;
}

function requireVersion(record, expected, revision, label = "record") {
  if (!record) throw new ApplicationError("NOT_FOUND", `${label} was not found`);
  if (record.version !== expected) throw new ApplicationError("VERSION_CONFLICT", `Expected ${label} version does not match current version`, { current: { itemVersion: record.version, repositoryRevision: revision } });
}

function visible(item, context) {
  return !context.authorization?.canReadItem || context.authorization.canReadItem(context.security, item);
}

function visibleRequirements(documents, context) {
  return allRequirements(documents).filter((item) => visible(item, context));
}

function visibleRelationship(link, requirements, context) {
  return [link.source, link.target].every((endpoint) => endpoint.kind !== "requirement" || visible(requirements.get(endpoint.id), context));
}

function findReview(documents, id) { return documents.business.qualityControl?.reviews.find((record) => record.id === id); }

class QualityCommandService {
  constructor(options) { this.repository = options.repository; this.configuredPolicy = options.policy; }
  async policy() { return this.configuredPolicy ? clone(this.configuredPolicy) : this.repository.getPolicy(); }
  async mutate(request, context, operation, mutator) {
    try {
      const result = await this.repository.execute(mutator, mutationOptions(request, context, operation));
      return response(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
    } catch (error) { throw converted(error); }
  }
}

export class CreateReviewService extends QualityCommandService {
  async execute(request, context) {
    return this.mutate(request, context, "reviews.create", (documents) => {
      const quality = ensureQuality(documents);
      const requirements = new Map(allRequirements(documents).map((item) => [item.id, item]));
      const selected = request.requirementIds.map((id) => requirements.get(id));
      if (selected.some((item) => !item || !visible(item, context))) throw new ApplicationError("NOT_FOUND", "A reviewed requirement was not found");
      const selectedIds = new Set(request.requirementIds);
      const relationshipMap = new Map(allRelationships(documents).map((link) => [link.id, link]));
      const relationshipIds = request.relationshipIds ?? allRelationships(documents).filter((link) => [link.source, link.target].some((endpoint) => endpoint.kind === "requirement" && selectedIds.has(endpoint.id))).map(({ id }) => id);
      const relationships = relationshipIds.map((id) => relationshipMap.get(id));
      if (relationships.some((link) => !link || !visibleRelationship(link, requirements, context))) throw new ApplicationError("NOT_FOUND", "A reviewed relationship was not found");
      const now = timestamp(context.now);
      const record = {
        accountablePrincipal: principal(context), createdAt: now, createdBy: actor(context), decisions: [], findings: [],
        history: [{ action: "created", at: now, by: actor(context), principal: principal(context) }], id: allocate(quality, "nextReviewNumber", "RV"),
        participants: clone(request.participants ?? []), purpose: request.purpose, reviewType: request.reviewType,
        scope: clone(request.scope ?? { kind: "exact-ids" }), status: "open", title: request.title,
        requirementVersions: selected.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)),
        relationshipVersions: relationships.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)),
        updatedAt: now, version: 1,
      };
      quality.reviews.push(record);
      return { review: clone(record) };
    });
  }
}

export class GetReviewService {
  constructor(options) { this.repository = options.repository; }
  async execute(request, context) {
    const documents = await this.repository.read();
    const review = findReview(documents, request.reviewId);
    if (!review) throw new ApplicationError("NOT_FOUND", "Review was not found");
    const requirements = new Map(allRequirements(documents).map((item) => [item.id, item]));
    if (review.requirementVersions.some(({ id }) => !visible(requirements.get(id), context))) throw new ApplicationError("NOT_FOUND", "Review was not found");
    return response(request, documents.business.repositoryRevision, { review: clone(review) });
  }
}

export class RecordReviewFindingService extends QualityCommandService {
  async execute(request, context) {
    return this.mutate(request, context, "reviews.recordFinding", (documents) => {
      const quality = ensureQuality(documents); const review = findReview(documents, request.reviewId);
      requireVersion(review, request.expectedVersion, documents.business.repositoryRevision, "review");
      if (review.status !== "open") throw new ApplicationError("INVALID_ARGUMENT", "Findings can only be recorded on an open review");
      if (request.origin === "ai" && !request.aiProvenance) throw new ApplicationError("INVALID_ARGUMENT", "AI-generated findings require provider, model, and suggestion provenance");
      if (request.requirementId && !review.requirementVersions.some(({ id }) => id === request.requirementId)) throw new ApplicationError("INVALID_ARGUMENT", "Finding requirement is outside the frozen review scope");
      if (request.relationshipId && !review.relationshipVersions.some(({ id }) => id === request.relationshipId)) throw new ApplicationError("INVALID_ARGUMENT", "Finding relationship is outside the frozen review scope");
      const now = timestamp(context.now);
      const finding = {
        author: request.author, comment: request.comment ?? request.summary, createdAt: now,
        id: allocate(quality, "nextFindingNumber", "FN"), origin: request.origin, recordedBy: actor(context), recordedFor: principal(context),
        severity: request.severity, status: "open", summary: request.summary,
        ...(request.requirementId ? { requirementId: request.requirementId } : {}), ...(request.relationshipId ? { relationshipId: request.relationshipId } : {}),
        ...(request.aiProvenance ? { aiProvenance: { promptTemplateVersion: request.aiProvenance.promptTemplateVersion ?? "unavailable", ruleVersion: request.aiProvenance.ruleVersion ?? "unavailable", runId: request.aiProvenance.runId ?? request.aiProvenance.suggestionId, service: request.aiProvenance.service ?? request.aiProvenance.provider, ...clone(request.aiProvenance), contentHash: canonicalHash({ comment: request.comment ?? request.summary, severity: request.severity, summary: request.summary }), generatedAt: now, proposalStatus: "proposed", requester: principal(context), sourceItems: [
          ...(request.requirementId ? review.requirementVersions.filter(({ id }) => id === request.requirementId) : []),
          ...(request.relationshipId ? review.relationshipVersions.filter(({ id }) => id === request.relationshipId) : []),
        ] } } : {}),
      };
      review.findings.push(finding); review.updatedAt = now; review.version += 1;
      review.history.push({ action: "finding-recorded", at: now, by: actor(context), findingId: finding.id, origin: finding.origin });
      return { finding: clone(finding), reviewId: review.id, reviewVersion: review.version };
    });
  }
}

export class DispositionReviewFindingService extends QualityCommandService {
  async execute(request, context) {
    requireHumanPrincipal(context, "Finding disposition");
    return this.mutate(request, context, "reviews.dispositionFinding", (documents) => {
      const review = findReview(documents, request.reviewId); requireVersion(review, request.expectedVersion, documents.business.repositoryRevision, "review");
      if (review.status !== "open") throw new ApplicationError("INVALID_ARGUMENT", "A closed review cannot be changed");
      const finding = review.findings.find(({ id }) => id === request.findingId);
      if (!finding) throw new ApplicationError("NOT_FOUND", "Review finding was not found");
      if (finding.status !== "open") throw new ApplicationError("INVALID_ARGUMENT", "Review finding is already dispositioned");
      const now = timestamp(context.now);
      finding.status = request.disposition; finding.disposition = { at: now, by: actor(context), evidenceReferences: clone(request.evidenceReferences ?? []), principal: principal(context), rationale: request.rationale };
      if (finding.aiProvenance) finding.aiProvenance = { ...finding.aiProvenance, acceptance: { acceptedAt: now, acceptedBy: actor(context), disposition: request.disposition, principal: principal(context), rationale: request.rationale }, proposalStatus: new Set(["accepted", "resolved"]).has(request.disposition) ? "accepted" : request.disposition === "rejected" ? "rejected" : "proposed" };
      review.updatedAt = now; review.version += 1; review.history.push({ action: "finding-dispositioned", at: now, by: actor(context), disposition: request.disposition, findingId: finding.id, principal: principal(context) });
      return { finding: clone(finding), reviewId: review.id, reviewVersion: review.version };
    });
  }
}

function validException(exception, context) {
  if (!exception || exception.authority !== principal(context)) return false;
  const date = exception.expiresAt ?? exception.reviewAt;
  return Boolean(date && !Number.isNaN(Date.parse(date)) && Date.parse(date) > Date.parse(context.now));
}

function requireHumanPrincipal(context, action) {
  if (!principal(context).startsWith("human:")) throw new ApplicationError("FORBIDDEN", `${action} requires an authenticated accountable human principal`);
}

export class RecordReviewDecisionService extends QualityCommandService {
  async execute(request, context) {
    requireHumanPrincipal(context, "A review decision");
    return this.mutate(request, context, "reviews.recordDecision", (documents) => {
      const review = findReview(documents, request.id); requireVersion(review, request.expectedVersion, documents.business.repositoryRevision, "review");
      if (review.status !== "open") throw new ApplicationError("INVALID_ARGUMENT", "Review is already closed");
      const blockers = review.findings.filter((finding) => finding.severity === "blocking" && finding.status === "open");
      if (request.decision === "close" && blockers.length && !validException(request.exception, context)) throw new ApplicationError("INVALID_ARGUMENT", "Blocking findings must be resolved before closing, or an authorized expiring exception is required", { details: blockers.map(({ id }) => ({ path: `/findings/${id}`, reason: "blocking finding is unresolved" })) });
      const now = timestamp(context.now);
      const decision = { at: now, by: actor(context), decision: request.decision, principal: principal(context), rationale: request.rationale, ...(request.exception ? { exception: clone(request.exception) } : {}) };
      review.decisions.push(decision);
      if (request.decision === "close") { review.status = "closed"; review.closedAt = now; review.closedBy = actor(context); }
      else if (request.decision === "reject") review.outcome = "rejected";
      else if (request.decision === "approve") review.outcome = "approved";
      review.updatedAt = now; review.version += 1; review.history.push({ action: request.decision === "close" ? "closed" : "decision-recorded", at: now, by: actor(context), decision: request.decision, principal: principal(context) });
      return { decision: clone(decision), review: clone(review) };
    });
  }
}

export class ReopenReviewService extends QualityCommandService {
  async execute(request, context) {
    requireHumanPrincipal(context, "Reopening a review");
    return this.mutate(request, context, "reviews.reopen", (documents) => {
      const review = findReview(documents, request.reviewId); requireVersion(review, request.expectedVersion, documents.business.repositoryRevision, "review");
      if (review.status !== "closed") throw new ApplicationError("INVALID_ARGUMENT", "Only a closed review can be reopened");
      const now = timestamp(context.now); review.status = "open"; delete review.closedAt; delete review.closedBy; review.updatedAt = now; review.version += 1;
      review.history.push({ action: "reopened", at: now, by: actor(context), principal: principal(context), rationale: request.rationale });
      return { review: clone(review) };
    });
  }
}

export class RecordVerificationPlanService extends QualityCommandService {
  async execute(request, context) {
    return this.mutate(request, context, "verification.recordPlan", (documents) => {
      const quality = ensureQuality(documents); const requirement = allRequirements(documents).find(({ id }) => id === request.requirementId);
      requireVersion(requirement, request.requirementVersion, documents.business.repositoryRevision, "requirement");
      if (!visible(requirement, context)) throw new ApplicationError("NOT_FOUND", "Requirement was not found");
      const now = timestamp(context.now);
      const plan = {
        acceptanceCriteria: clone(request.acceptanceCriteria), configuration: request.configuration, createdAt: now, createdBy: actor(context),
        id: allocate(quality, "nextPlanNumber", "VP"), methods: clone(request.methods), owner: request.owner, procedure: clone(request.procedure),
        requirementId: requirement.id, requirementVersion: requirement.version, status: "planned", updatedAt: now, version: 1,
        ...Object.fromEntries(["environment", "dataset", "equipment", "release", "variant", "rationale"].filter((key) => request[key] !== undefined).map((key) => [key, clone(request[key])])),
      };
      quality.verificationPlans.push(plan); return { plan: clone(plan) };
    });
  }
}

export class RecordVerificationEvidenceService extends QualityCommandService {
  async execute(request, context) {
    if (new Set(["waived", "not_applicable"]).has(request.status)) {
      requireHumanPrincipal(context, "Evidence waiver or not-applicable disposition");
      if (!request.rationale || request.authority !== principal(context)) throw new ApplicationError("INVALID_ARGUMENT", "Waived and not-applicable evidence require rationale from the authenticated authority");
    }
    if (request.origin === "ai" && new Set(["waived", "not_applicable"]).has(request.status)) throw new ApplicationError("FORBIDDEN", "AI-generated evidence cannot waive evidence or decide applicability");
    if (request.origin === "ai" && !request.aiProvenance) throw new ApplicationError("INVALID_ARGUMENT", "AI-generated evidence requires provider, model, and run provenance");
    if (request.acceptanceDecision === "accept") {
      requireHumanPrincipal(context, "Evidence acceptance");
      if (request.authority !== principal(context)) throw new ApplicationError("INVALID_ARGUMENT", "Evidence acceptance authority must be the authenticated human principal");
    }
    return this.mutate(request, context, "verification.recordEvidence", (documents) => {
      const quality = ensureQuality(documents); const requirements = new Map(allRequirements(documents).map((item) => [item.id, item]));
      for (const reference of request.requirementVersions) {
        const item = requirements.get(reference.id);
        if (!item || reference.version > item.version || !visible(item, context)) throw new ApplicationError("NOT_FOUND", "An evidence requirement version was not found");
      }
      const plan = request.planId ? quality.verificationPlans.find(({ id }) => id === request.planId) : null;
      if (request.planId && !plan) throw new ApplicationError("NOT_FOUND", "Verification plan was not found");
      if (plan && (!request.requirementVersions.some(({ id, version }) => id === plan.requirementId && version === plan.requirementVersion) || plan.configuration !== request.configuration)) throw new ApplicationError("INVALID_ARGUMENT", "Evidence is not applicable to the selected plan version and configuration");
      const now = timestamp(context.now);
      const evidenceId = request.evidenceId ?? allocate(quality, "nextEvidenceNumber", "EV");
      if (request.evidenceId) quality.nextEvidenceNumber = Math.max(quality.nextEvidenceNumber, Number(request.evidenceId.slice(3)) + 1);
      const evidence = {
        ...(request.acceptanceDecision === "accept" ? { acceptance: { acceptedAt: now, acceptedBy: actor(context), principal: principal(context) } } : {}), actualResult: request.actualResult,
        artifactChecksum: request.artifactChecksum, artifactUri: request.artifactUri, caseId: request.caseId, caseVersion: request.caseVersion,
        configuration: request.configuration, createdAt: now, dataset: request.dataset ?? null, defectReferences: clone(request.defectReferences ?? []),
        environment: request.environment, executedAt: timestamp(request.executedAt), executor: request.executor,
        expectedResult: request.expectedResult, externalId: request.externalId, externalVersion: request.externalVersion,
        id: evidenceId, recordedBy: actor(context), requirementVersions: clone(request.requirementVersions).sort((a, b) => a.id.localeCompare(b.id)),
        sourceSystem: request.sourceSystem, status: request.status, version: 1, origin: request.origin,
        ...Object.fromEntries(["planId", "relationshipId", "disposition", "rationale", "authority", "release", "variant"].filter((key) => request[key] !== undefined).map((key) => [key, clone(request[key])])),
        ...(request.aiProvenance ? { aiProvenance: { promptTemplateVersion: request.aiProvenance.promptTemplateVersion ?? "unavailable", ruleVersion: request.aiProvenance.ruleVersion ?? "unavailable", service: request.aiProvenance.service ?? request.aiProvenance.provider, ...clone(request.aiProvenance), contentHash: canonicalHash({ actualResult: request.actualResult, artifactChecksum: request.artifactChecksum, expectedResult: request.expectedResult, status: request.status }), generatedAt: now, proposalStatus: request.acceptanceDecision === "accept" ? "accepted" : "proposed", requester: principal(context), sourceItems: clone(request.requirementVersions), ...(request.acceptanceDecision === "accept" ? { acceptance: { acceptedAt: now, acceptedBy: actor(context), principal: principal(context) } } : {}) } } : {}),
      };
      if (quality.evidence.some((record) => record.id === evidence.id || (record.externalId === evidence.externalId && record.externalVersion === evidence.externalVersion))) throw new ApplicationError("INVALID_ARGUMENT", "Evidence ID and version already exist");
      quality.evidence.push(evidence); return { evidence: clone(evidence) };
    });
  }
}

function relationshipApplicable(documents, requirementId, evidence, policy) {
  if (policy.verification?.requireNonSuspectRelationship === false) return true;
  return allRelationships(documents).some((link) => !link.retirement && !link.suspect && (link.status ?? "valid") === "valid" && new Set(["verified_by", "validated_by"]).has(link.type)
    && link.source?.kind === "requirement" && link.source.id === requirementId
    && (!evidence.relationshipId || link.id === evidence.relationshipId)
    && (!link.target?.externalId || link.target.externalId === evidence.externalId));
}

export function evaluateVerification(documents, requirement, options = {}, policy = {}) {
  const quality = documents.business.qualityControl ?? { evidence: [], verificationPlans: [] };
  const plans = quality.verificationPlans.filter((plan) => plan.requirementId === requirement.id && plan.requirementVersion === requirement.version);
  const evidence = quality.evidence.filter((record) => record.requirementVersions.some(({ id }) => id === requirement.id));
  const applicable = evidence.filter((record) => (!options.configuration || record.configuration === options.configuration)
    && (!options.release || record.release === options.release) && (!options.variant || record.variant === options.variant));
  const current = applicable.filter((record) => record.requirementVersions.some(({ id, version }) => id === requirement.id && version <= requirement.version) && !record.potentiallyStale);
  const accepted = current.filter((record) => record.acceptance?.principal);
  const passing = accepted.filter((record) => record.status === "passed" && relationshipApplicable(documents, requirement.id, record, policy));
  let status = "absent";
  if (plans.length) status = "planned";
  if (evidence.length && !current.length) status = "stale";
  if (current.some(({ status: value }) => value === "not_run")) status = "not_run";
  if (current.some(({ status: value }) => value === "blocked")) status = "blocked";
  if (current.some(({ status: value }) => value === "failed")) status = "failed";
  if (accepted.some(({ status: value }) => value === "waived")) status = "waived";
  if (accepted.some(({ status: value }) => value === "not_applicable")) status = "not_applicable";
  if (current.some(({ status: value }) => value === "passed") && !accepted.some(({ status: value }) => value === "passed")) status = "pending_acceptance";
  if (accepted.some(({ status: value }) => value === "passed") && !passing.length) status = "stale";
  if (passing.length) status = "passed";
  return { acceptedEvidenceIds: accepted.map(({ id }) => id), applicableEvidenceIds: applicable.map(({ id }) => id), evidenceIds: evidence.map(({ id }) => id), passingEvidenceIds: passing.map(({ id }) => id), planIds: plans.map(({ id }) => id), requirementId: requirement.id, requirementVersion: requirement.version, status };
}

async function sourceDocuments(repository, baselineStore, baselineId) {
  if (!baselineId) { const documents = await repository.read(); return { documents, source: { kind: "current", repositoryRevision: documents.business.repositoryRevision } }; }
  if (!baselineStore) throw new ApplicationError("NOT_FOUND", "Baseline storage is not configured");
  const baseline = await baselineStore.get(baselineId);
  return { documents: baseline.documents, source: { baselineId, kind: "baseline", repositoryRevision: baseline.manifest.repositoryRevision } };
}

export class VerificationStatusService {
  constructor(options) { this.repository = options.repository; this.baselineStore = options.baselineStore; this.configuredPolicy = options.policy; }
  async execute(request, context) {
    const selected = await sourceDocuments(this.repository, this.baselineStore, request.baselineId); const policy = this.configuredPolicy ?? await this.repository.getPolicy();
    const ids = request.requirementIds ? new Set(request.requirementIds) : null;
    const requirements = visibleRequirements(selected.documents, context).filter((item) => !ids || ids.has(item.id));
    const items = requirements.map((item) => evaluateVerification(selected.documents, item, request, policy));
    const counts = Object.fromEntries(["absent", "planned", "not_run", "pending_acceptance", "passed", "failed", "blocked", "stale", "waived", "not_applicable"].map((name) => [name, items.filter(({ status }) => status === name).length]));
    return response(request, await this.repository.revision(), { counts, denominator: { all: items.length, applicable: items.filter(({ status }) => status !== "not_applicable").length }, items }, selected.source);
  }
}

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalized(value[key])]));
}

function reportPopulation(type, documents, context, policy, filters = {}) {
  const requestedIds = filters.id ? new Set(Array.isArray(filters.id) ? filters.id : [filters.id]) : null;
  const matches = (item) => (!requestedIds || requestedIds.has(item.id))
    && ["level", "owner", "priority", "criticality", "status"].every((field) => filters[field] === undefined || (Array.isArray(filters[field]) ? filters[field].includes(item[field]) : item[field] === filters[field]))
    && (filters.release === undefined || (Array.isArray(filters.release) ? filters.release : [filters.release]).includes(item.release ?? item.customAttributes?.release));
  const requirements = visibleRequirements(documents, context).filter(matches);
  const ids = new Set(requirements.map(({ id }) => id));
  const links = allRelationships(documents).filter((link) => [link.source, link.target].every((endpoint) => endpoint.kind !== "requirement" || ids.has(endpoint.id)));
  const quality = documents.business.qualityControl ?? { evidence: [], reviews: [], verificationPlans: [] };
  if (type === "business-requirements") return requirements.filter(({ level }) => level === "business");
  if (type === "software-requirements") return requirements.filter(({ level }) => level === "software");
  if (type === "traceability") return { requirements, relationships: links };
  if (type === "coverage") return requirements.map((item) => {
    const connected = links.filter((link) => link.source?.id === item.id || link.target?.id === item.id);
    return {
      design: connected.some((link) => link.type === "implements" && [link.source, link.target].some(({ artifactType }) => artifactType === "design")),
      implementation: connected.some(({ type: relationshipType }) => relationshipType === "implements"),
      requirementId: item.id, source: (item.sourceReferences?.length ?? 0) > 0,
      verification: evaluateVerification(documents, item, {}, policy).status,
    };
  });
  if (type === "orphans") return requirements.filter((item) => !links.some((link) => link.source?.id === item.id || link.target?.id === item.id)).map(({ id, level, status, version }) => ({ id, level, status, version }));
  if (type === "reviews") return quality.reviews.filter((review) => review.requirementVersions.every(({ id }) => ids.has(id)));
  if (type === "verification") return requirements.map((item) => evaluateVerification(documents, item, {}, policy));
  if (type === "changes") return (documents.business.changeControl?.changes ?? []).filter((change) => (change.affectedRequirementIds ?? []).every((id) => ids.has(id)));
  if (type === "readiness") return {
    changes: (documents.business.changeControl?.changes ?? []).filter(({ status }) => !new Set(["closed", "cancelled", "rejected"]).has(status)),
    evidenceExceptions: quality.evidence.filter(({ status }) => new Set(["failed", "blocked", "waived", "not_applicable"]).has(status)),
    requirements: requirements.map((item) => ({ id: item.id, status: item.status, verification: evaluateVerification(documents, item, {}, policy).status })),
    risks: links.filter(({ type: relationshipType }) => relationshipType === "mitigates"),
    suspectLinks: links.filter((link) => link.suspect || link.status === "suspect"),
    unresolvedFindings: quality.reviews.flatMap((review) => review.findings.filter(({ status }) => status === "open").map((finding) => ({ ...finding, reviewId: review.id }))),
  };
  if (type === "baseline") return { requirementVersions: requirements.map(({ id, version }) => ({ id, version })), relationshipVersions: links.map(({ id, version }) => ({ id, version })) };
  if (type === "history") return requirements.map(({ id, lifecycleHistory, version }) => ({ id, lifecycleHistory: lifecycleHistory ?? [], version }));
  return { requirements, relationships: links };
}

export class ReportRegistry {
  constructor(options = {}) { this.maximum = options.maximum ?? 1000; this.entries = new Map(); }
  put(report, scopeKey) { this.entries.set(report.metadata.reportId, { report: clone(report), scopeKey }); while (this.entries.size > this.maximum) this.entries.delete(this.entries.keys().next().value); }
  get(id, scopeKey) { const found = this.entries.get(id); return found?.scopeKey === scopeKey ? clone(found.report) : null; }
}

function boundReportContent(value, maximumRows) {
  let truncated = false;
  const visit = (entry) => {
    if (Array.isArray(entry)) { if (entry.length > maximumRows) truncated = true; return entry.slice(0, maximumRows).map(visit); }
    if (!entry || typeof entry !== "object") return entry;
    return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, visit(child)]));
  };
  return { content: visit(value), truncated };
}

export class ReportService {
  constructor(options) { this.repository = options.repository; this.baselineStore = options.baselineStore; this.audit = options.audit; this.registry = options.reportRegistry ?? new ReportRegistry(); this.generatorVersion = options.generatorVersion ?? "1.0.0"; this.maximumRows = options.reportMaximumRows ?? 1_000; this.configuredPolicy = options.policy; }
  async execute(request, context) {
    if (request.reportId) {
      const prior = this.registry.get(request.reportId, context.security?.scopeKey);
      if (!prior) throw new ApplicationError("NOT_FOUND", "Generated report was not found");
      if (prior.metadata.reportType !== request.reportType) throw new ApplicationError("INVALID_ARGUMENT", "Report ID does not match the requested report type");
      return response(request, await this.repository.revision(), prior, prior.metadata.source);
    }
    const selected = await sourceDocuments(this.repository, this.baselineStore, request.baselineId); const policy = this.configuredPolicy ?? await this.repository.getPolicy();
    let content;
    if (request.reportType === "audit") {
      const listing = context.identity?.role === "requirements-manager" && this.audit?.list ? await this.audit.list({ limit: this.maximumRows }) : null;
      content = { events: listing?.events ?? [], integrity: this.audit?.verify ? await this.audit.verify() : null, restricted: !listing };
    }
    else if (request.reportType === "baseline-comparison") {
      if (!request.baselineId || !request.compareBaselineId || !this.baselineStore) throw new ApplicationError("INVALID_ARGUMENT", "Baseline comparison requires two baseline IDs");
      const other = await this.baselineStore.get(request.compareBaselineId);
      const left = reportPopulation("baseline", selected.documents, context, policy, request.filters); const right = reportPopulation("baseline", other.documents, context, policy, request.filters);
      const keyed = (values) => new Map(values.map((entry) => [entry.id, entry.version])); const requirementLeft = keyed(left.requirementVersions); const requirementRight = keyed(right.requirementVersions); const relationshipLeft = keyed(left.relationshipVersions); const relationshipRight = keyed(right.relationshipVersions);
      const differences = (a, b) => [...new Set([...a.keys(), ...b.keys()])].sort().filter((id) => a.get(id) !== b.get(id)).map((id) => ({ id, leftVersion: a.get(id) ?? null, rightVersion: b.get(id) ?? null }));
      content = { left: selected.source, right: { baselineId: request.compareBaselineId, kind: "baseline", repositoryRevision: other.manifest.repositoryRevision }, requirementDifferences: differences(requirementLeft, requirementRight), relationshipDifferences: differences(relationshipLeft, relationshipRight) };
    } else content = reportPopulation(request.reportType, selected.documents, context, policy, request.filters);
    const bounded = boundReportContent(content, this.maximumRows); content = bounded.content;
    const filters = normalized(request.filters ?? {}); const templateVersion = request.templateVersion ?? "1.0.0";
    const authorizationScopeHash = canonicalHash(context.security?.scopeKey ?? "unscoped");
    const semantic = { authorizationScopeHash, content, filters, generatorVersion: this.generatorVersion, populationFormula: `${request.reportType}:authorized-records@exact-source`, reportType: request.reportType, source: selected.source, templateVersion };
    const outputChecksum = canonicalHash(semantic); const reportId = `RP-${outputChecksum.slice(0, 24)}`;
    const report = { content, metadata: { authorizationScopeHash, configurationVersion: String(policy.configurationVersion ?? "1"), generatedAt: timestamp(context.now), generatorVersion: this.generatorVersion, normalizedFilters: filters, outputChecksum, policyVersion: String(policy.configurationVersion ?? "1"), populationFormula: semantic.populationFormula, project: request.filters?.project ?? "default", reportId, reportType: request.reportType, requester: principal(context), source: selected.source, templateVersion, truncated: bounded.truncated } };
    this.registry.put(report, context.security?.scopeKey);
    return response(request, await this.repository.revision(), report, selected.source);
  }
}

export class MetricsDashboardService {
  constructor(options) { this.repository = options.repository; this.baselineStore = options.baselineStore; this.configuredPolicy = options.policy; }
  async execute(request, context) {
    const selected = await sourceDocuments(this.repository, this.baselineStore, request.baselineId); const policy = this.configuredPolicy ?? await this.repository.getPolicy();
    const ids = request.requirementIds ? new Set(request.requirementIds) : null;
    const requirements = visibleRequirements(selected.documents, context).filter((item) => !ids || ids.has(item.id));
    const buckets = new Map();
    for (const item of requirements) {
      const value = request.groupBy === "type" ? item.category : request.groupBy === "verification-status" ? evaluateVerification(selected.documents, item, {}, policy).status : request.groupBy === "release" ? item.release ?? item.customAttributes?.release : item[request.groupBy];
      const key = value === undefined || value === null || value === "" ? null : String(value); const bucket = buckets.get(key) ?? { count: 0, key, missing: key === null, recordIds: [] };
      bucket.count += 1; bucket.recordIds.push(item.id); buckets.set(key, bucket);
    }
    const groups = [...buckets.values()].map((bucket) => ({ ...bucket, recordIds: bucket.recordIds.sort() })).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    if (!buckets.has(null)) groups.unshift({ count: 0, key: null, missing: true, recordIds: [] });
    const quality = selected.documents.business.qualityControl ?? { evidence: [], reviews: [], verificationPlans: [] };
    const links = allRelationships(selected.documents);
    const gaps = {
      acceptedEvidence: requirements.filter((item) => !evaluateVerification(selected.documents, item, {}, policy).acceptedEvidenceIds.length).map(({ id }) => id).sort(),
      implementations: requirements.filter((item) => !links.some((link) => link.type === "implements" && (link.source?.id === item.id || link.target?.id === item.id))).map(({ id }) => id).sort(),
      sources: requirements.filter((item) => !(item.sourceReferences?.length)).map(({ id }) => id).sort(),
      verificationPlans: requirements.filter((item) => !quality.verificationPlans.some((plan) => plan.requirementId === item.id)).map(({ id }) => id).sort(),
    };
    const signals = {
      openReviewFindings: quality.reviews.flatMap((review) => review.findings ?? []).filter(({ status }) => status === "open").map(({ id }) => id).sort(),
      suspectLinks: links.filter((link) => link.suspect || link.status === "suspect").map(({ id }) => id).sort(),
      unresolvedChanges: (selected.documents.business.changeControl?.changes ?? []).filter(({ status }) => !new Set(["closed", "cancelled", "rejected"]).has(status)).map(({ id }) => id).sort(),
    };
    const changedRecordIds = requirements.filter(({ version }) => version > 1).map(({ id }) => id).sort();
    return response(request, await this.repository.revision(), { denominator: requirements.length, gaps, groupBy: request.groupBy, groups, signals, volatility: { changedRecordIds, changeDefinition: "current requirement version is greater than 1", population: "authorized selected requirements" } }, selected.source);
  }
}

export function markEvidencePotentiallyStale(documents, requirementId, changedFields, context, policy = {}) {
  const configured = new Set(policy.verification?.staleOnFields ?? ["statement", "acceptanceCriteria", "verificationMethods", "criticality"]);
  const triggeringFields = changedFields.filter((field) => field === "retirement" || configured.has(field));
  if (!triggeringFields.length || !documents.business.qualityControl) return [];
  const marked = [];
  for (const evidence of documents.business.qualityControl.evidence) {
    if (evidence.status === "superseded" || !evidence.requirementVersions.some(({ id }) => id === requirementId)) continue;
    evidence.potentiallyStale = true; evidence.staleReason = { at: timestamp(context.now), by: actor(context), changedFields: [...triggeringFields].sort(), requirementId };
    evidence.version += 1; marked.push(evidence.id);
  }
  return marked;
}

export function createReviewVerificationReportingServices(options) {
  const registry = options.reportRegistry ?? new ReportRegistry(options.reports);
  const shared = { ...options, reportRegistry: registry };
  return {
    CreateReviewService: new CreateReviewService(shared), GetReviewService: new GetReviewService(shared), RecordReviewFindingService: new RecordReviewFindingService(shared),
    DispositionReviewFindingService: new DispositionReviewFindingService(shared), RecordReviewDecisionService: new RecordReviewDecisionService(shared), ReopenReviewService: new ReopenReviewService(shared),
    RecordVerificationPlanService: new RecordVerificationPlanService(shared), RecordVerificationEvidenceService: new RecordVerificationEvidenceService(shared), VerificationStatusService: new VerificationStatusService(shared),
    ReportService: new ReportService(shared), MetricsDashboardService: new MetricsDashboardService(shared),
  };
}
