import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { canonicalHash } from "../../adapters/repository/canonical-json.js";
import { ApplicationError } from "../errors.js";
import { CursorCodec } from "./reads.js";
import { evaluateVerification } from "./reviews-verification-reporting.js";

const clone = (value) => structuredClone(value);
const allRequirements = (documents) => [...documents.business.requirements, ...documents.software.requirements];
const allRelationships = (documents) => [...documents.business.relationships, ...documents.software.relationships];
const response = (request, revision, data, page, source) => ({ schemaVersion: "1.0.0", repositoryRevision: revision, correlationId: request.correlationId, data, ...(page ? { page } : {}), ...(source ? { source } : {}) });
const principal = (context) => context.identity?.principal?.id ?? "unknown-principal";
const actor = (context) => context.identity?.agentId ?? "unknown-agent";
const defined = (value) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

function converted(error) {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError(new Set(["NOT_FOUND", "INTEGRITY_FAILURE", "VERSION_CONFLICT", "INVALID_ARGUMENT"]).has(error?.code) ? error.code : "INTERNAL_ERROR", error?.message ?? "History operation failed", { details: error?.details, cause: error });
}

function signed(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

function verified(secret, token) {
  try {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw new Error();
    const actual = Buffer.from(signature);
    const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64url"));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch { throw new ApplicationError("INVALID_ARGUMENT", "Readiness token is invalid or expired"); }
}

function present(value) {
  return value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0);
}

function endpointTouches(relationship, ids) {
  return [relationship.source, relationship.target].some((endpoint) => endpoint.kind === "requirement" && ids.has(endpoint.id));
}

function blocker(code, message, details = {}) { return { code, message, ...details }; }

function readiness(documents, policy, request, context) {
  const byId = new Map(allRequirements(documents).map((item) => [item.id, item]));
  const ids = [...new Set(request.requirementIds ?? [])].sort();
  const selected = ids.map((id) => byId.get(id)).filter(Boolean);
  const blockers = [];
  for (const id of ids) if (!byId.has(id)) blockers.push(blocker("REQUIREMENT_NOT_FOUND", "Selected requirement was not found", { requirementId: id }));
  const allowed = new Set(policy.baselineReadiness?.allowedStatuses ?? []);
  const relationships = allRelationships(documents).filter((link) => !link.retirement && endpointTouches(link, new Set(ids)));
  for (const item of selected) {
    if (!allowed.has(item.status)) blockers.push(blocker("STATUS_NOT_ALLOWED", `Status ${item.status} is not baseline-ready`, { path: "/status", requirementId: item.id }));
    const requirements = [
      ["owner", item.owner, "MISSING_OWNER"], ["priority", item.priority, "MISSING_PRIORITY"], ["rationale", item.rationale, "MISSING_RATIONALE"],
      ["source", item.provenance?.source || item.sourceReferences, "MISSING_SOURCE"], ["acceptanceCriteria", item.acceptanceCriteria, "MISSING_ACCEPTANCE_CRITERIA"],
    ];
    if (item.level === "software") requirements.push(["verificationMethods", item.verificationMethods, "MISSING_VERIFICATION_METHOD"]);
    for (const [field, value, code] of requirements) if (!present(value)) blockers.push(blocker(code, `${field} is required`, { path: `/${field}`, requirementId: item.id }));
    if (/\b(?:TBD|TODO|TBC|FIXME)\b/iu.test(item.statement) || /\b(?:TBD|TODO|TBC|FIXME)\b/iu.test(item.rationale ?? "")) blockers.push(blocker("UNRESOLVED_TBD", "Requirement contains an unresolved placeholder", { requirementId: item.id }));
    for (const rule of policy.coverageRules ?? []) {
      if (rule.level !== item.level || !rule.statuses.includes(item.status)) continue;
      for (const type of rule.requiredRelationshipTypes) if (!relationships.some((link) => link.type === type && (link.source.id === item.id || link.target.id === item.id))) blockers.push(blocker("MISSING_COVERAGE", `Required ${type} coverage is missing`, { relationshipType: type, requirementId: item.id }));
    }
  }
  if (policy.baselineReadiness?.blockSuspectLinks) for (const link of relationships.filter((entry) => entry.suspect || entry.status === "suspect")) blockers.push(blocker("SUSPECT_LINK", "A selected relationship is suspect", { relationshipId: link.id }));
  for (const link of relationships.filter((entry) => entry.type === "conflicts_with" && !new Set(["invalid", "waived"]).has(entry.status))) blockers.push(blocker("BLOCKING_CONFLICT", "A selected requirement has an unresolved conflict", { relationshipId: link.id }));
  for (const change of documents.business.changeControl?.changes ?? []) {
    if (new Set(["closed", "cancelled", "rejected"]).has(change.status)) continue;
    if ((change.affectedRequirementIds ?? []).some((id) => ids.includes(id)) || (change.proposedChanges ?? []).some(({ id }) => ids.includes(id))) blockers.push(blocker("OPEN_CHANGE_REQUEST", "An unresolved change request affects the selection", { changeRequestId: change.id }));
  }
  const quality = documents.business.qualityControl;
  if (policy.verification?.requirePlansForReadiness) {
    const levels = new Set(policy.authoringRules?.verificationPlanningLevels ?? []);
    for (const item of selected.filter(({ level }) => levels.has(level))) {
      const plan = quality?.verificationPlans?.find((entry) => entry.requirementId === item.id && entry.requirementVersion === item.version);
      if (!plan) blockers.push(blocker("MISSING_VERIFICATION_PLAN", "Requirement lacks an objective verification plan for its exact version", { requirementId: item.id }));
    }
  }
  if (quality) {
    for (const review of quality.reviews) {
      if (!review.requirementVersions?.some(({ id }) => ids.includes(id))) continue;
      for (const finding of review.findings ?? []) if (finding.severity === "blocking" && finding.status === "open") blockers.push(blocker("BLOCKING_REVIEW_FINDING", "An unresolved blocking review finding affects the selection", { findingId: finding.id, reviewId: review.id }));
    }
    for (const item of selected) {
      const verification = evaluateVerification(documents, item, {}, policy);
      if (item.status === "verified" && verification.status !== "passed") blockers.push(blocker("MISSING_ACCEPTED_VERIFICATION", "Verified requirement lacks accepted applicable passing evidence", { requirementId: item.id, verificationStatus: verification.status }));
    }
  }
  const exceptions = [];
  for (const exception of request.exceptions ?? []) {
    const valid = present(exception.rationale) && exception.authority === principal(context) && present(exception.expiresAt ?? exception.reviewAt) && new Date(exception.expiresAt ?? exception.reviewAt).getTime() > new Date(context.now).getTime();
    if (!valid) { blockers.push(blocker("INVALID_EXCEPTION", "Exception requires rationale, authenticated authority, and a future expiry or review date")); continue; }
    const index = blockers.findIndex((entry) => entry.code === exception.code && (!exception.requirementId || entry.requirementId === exception.requirementId) && (!exception.relationshipId || entry.relationshipId === exception.relationshipId));
    if (index >= 0) exceptions.push({ ...clone(exception), authorizedBy: principal(context), waivedBlocker: blockers.splice(index, 1)[0] });
  }
  return { blockers, exceptions, ids, relationships, selected };
}

export class ReadinessTokenStore {
  constructor(options = {}) { this.secret = options.secret ?? randomBytes(32); this.ttlMilliseconds = options.ttlMilliseconds ?? 900_000; }
  issue(payload, now) { return signed(this.secret, { ...payload, expiresAt: new Date(now).getTime() + this.ttlMilliseconds }); }
  verify(token, now) { const payload = verified(this.secret, token); if (payload.expiresAt <= new Date(now).getTime()) throw new ApplicationError("INVALID_ARGUMENT", "Readiness token is invalid or expired"); return payload; }
}

export class HistoryService {
  constructor({ repository, cursorSecret }) { this.repository = repository; this.cursor = new CursorCodec(cursorSecret); }
  async execute(request, context) {
    try {
      const limit = request.limit ?? 20;
      const revision = await this.repository.revision();
      let offset = 0;
      if (request.cursor) { const value = this.cursor.decode(request.cursor); if (value.id !== request.id || value.revision !== revision) throw new ApplicationError("INVALID_ARGUMENT", "History cursor is stale"); offset = value.offset; }
      const entries = await this.repository.history(request.id);
      if (!entries.length) throw new ApplicationError("NOT_FOUND", "Governed record history was not found");
      const visible = [];
      for (const entry of entries) {
        const version = await this.repository.readVersion(request.id, entry.version);
        if (!context.authorization?.canReadItem || context.authorization.canReadItem(context.security, version.record)) visible.push(entry);
      }
      const items = visible.slice(offset, offset + limit);
      const nextOffset = offset + items.length;
      return response(request, revision, { id: request.id, entries: items }, { returnedCount: items.length, truncated: nextOffset < visible.length, ...(nextOffset < visible.length ? { nextCursor: this.cursor.encode({ id: request.id, offset: nextOffset, revision }) } : {}) });
    } catch (error) { throw converted(error); }
  }
}

export class CheckBaselineReadinessService {
  constructor({ repository, policy, readinessTokenStore }) { this.repository = repository; this.configuredPolicy = policy; this.tokens = readinessTokenStore ?? new ReadinessTokenStore(); }
  async execute(request, context) {
    try {
      const [documents, policy] = await Promise.all([this.repository.read(), this.configuredPolicy ? clone(this.configuredPolicy) : this.repository.getPolicy()]);
      const result = readiness(documents, policy, request, context);
      const revision = documents.business.repositoryRevision;
      const token = result.blockers.length ? undefined : this.tokens.issue({ configurationVersion: policy.configurationVersion, ids: result.ids, principalId: principal(context), repositoryRevision: revision, scopeHash: canonicalHash({ exclusions: request.exclusions ?? [], scope: request.scope ?? null }), exceptions: result.exceptions }, context.now);
      return response(request, revision, { blockers: result.blockers, warnings: [], authorizedExceptions: result.exceptions, ready: result.blockers.length === 0, readinessToken: token, selection: { requirementIds: result.ids, relationshipIds: result.relationships.map(({ id }) => id).sort() } });
    } catch (error) { throw converted(error); }
  }
}

function scopedSnapshot(documents, ids) {
  const selected = new Set(ids);
  const output = clone(documents);
  for (const level of ["business", "software"]) {
    output[level].requirements = output[level].requirements.filter(({ id }) => selected.has(id));
    output[level].relationships = output[level].relationships.filter((link) => {
      const endpoints = [link.source, link.target].filter((endpoint) => endpoint.kind === "requirement");
      return endpoints.length > 0 && endpoints.every((endpoint) => selected.has(endpoint.id));
    });
  }
  if (output.business.changeControl) output.business.changeControl = { ...output.business.changeControl, changes: [], outbox: [], baselineMemberships: output.business.changeControl.baselineMemberships.filter(({ requirementId }) => selected.has(requirementId)) };
  if (output.business.qualityControl) output.business.qualityControl = {
    ...output.business.qualityControl,
    reviews: output.business.qualityControl.reviews.filter((review) => review.requirementVersions.every(({ id }) => selected.has(id))),
    verificationPlans: output.business.qualityControl.verificationPlans.filter(({ requirementId }) => selected.has(requirementId)),
    evidence: output.business.qualityControl.evidence.filter((record) => record.requirementVersions.every(({ id }) => selected.has(id))),
  };
  return output;
}

export class CreateBaselineService {
  constructor({ repository, baselineStore, policy, readinessTokenStore, audit }) { this.repository = repository; this.store = baselineStore; this.configuredPolicy = policy; this.tokens = readinessTokenStore; this.audit = audit; }
  async execute(request, context) {
    try {
      if (!principal(context).startsWith("human:")) throw new ApplicationError("FORBIDDEN", "Baseline creation requires an authenticated accountable human principal");
      if (!this.tokens) throw new ApplicationError("INTERNAL_ERROR", "Baseline readiness token storage is not configured");
      const token = this.tokens.verify(request.readinessToken, context.now);
      const current = await this.repository.read();
      const policy = this.configuredPolicy ? clone(this.configuredPolicy) : await this.repository.getPolicy();
      const ids = [...new Set(request.requirementIds ?? token.ids)].sort();
      if (token.repositoryRevision !== current.business.repositoryRevision || token.principalId !== principal(context) || canonicalHash(ids) !== canonicalHash(token.ids) || token.configurationVersion !== policy.configurationVersion) throw new ApplicationError("VERSION_CONFLICT", "Readiness token is stale for the current repository state");
      if (!present(request.name) || !present(request.purpose ?? request.rationale) || !(request.approvalReferences?.length)) throw new ApplicationError("INVALID_ARGUMENT", "Baseline name, purpose, and approval references are required");
      const baselineId = await this.store.nextId();
      const documents = scopedSnapshot(current, ids);
      const relationships = allRelationships(documents);
      const manifest = defined({
        approvalReferences: clone(request.approvalReferences), baselineId, configuration: clone(request.configuration ?? {}), createdAt: new Date(context.now).toISOString(), createdBy: actor(context),
        exclusions: clone(request.exclusions ?? []), name: request.name, policyVersion: policy.configurationVersion, project: request.project ?? "default", purpose: request.purpose ?? request.rationale,
        release: request.release ?? null, reportTemplateVersions: clone(request.reportTemplateVersions ?? ["1.0.0"]), requirementVersions: allRequirements(documents).map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)), scope: { kind: "exact-ids", requirementIds: ids },
        relationshipVersions: relationships.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)), repositoryRevision: token.repositoryRevision,
        schemaVersionCaptured: documents.business.schemaVersion, sourceRepositoryRevision: request.sourceRepositoryRevision ?? "unavailable", traceModelVersion: policy.traceabilityModelVersion,
        unresolvedAuthorizedExceptions: clone(token.exceptions ?? []), variant: request.variant ?? null, version: 1,
      });
      const snapshot = { documents, policy, capturedAt: manifest.createdAt };
      const command = clone(request);
      delete command.correlationId;
      delete command.idempotencyKey;
      const result = await this.repository.execute((mutable) => {
        mutable.business.changeControl ??= { baselineMemberships: [], changes: [], nextChangeNumber: 1, nextOutboxNumber: 1, outbox: [], schemaVersion: "1.0.0" };
        for (const { id, version } of manifest.requirementVersions) mutable.business.changeControl.baselineMemberships.push({ baselineId, requirementId: id, version });
        return { baselineId };
      }, { actor: actor(context), expectedRepositoryRevision: token.repositoryRevision, idempotency: { correlationId: request.correlationId, key: request.idempotencyKey, requestHash: canonicalHash(command), scope: `baselines.create:${principal(context)}:${actor(context)}` }, provenance: { command: "baselines.create", correlationId: request.correlationId, principalId: principal(context), reason: manifest.purpose, role: context.identity?.role } });
      const committedBaselineId = result.result.baselineId;
      if (result.replayed) {
        const existing = await this.store.get(committedBaselineId);
        return response(request, result.repositoryRevision, { manifest: existing.manifest, replayed: true });
      }
      let stored;
      stored = await this.store.create(manifest, snapshot);
      await this.audit?.append?.({ agentId: actor(context), baselineId, correlationId: request.correlationId, event: "baseline-created", manifestChecksum: stored.manifestChecksum, principalId: principal(context), repositoryRevision: result.repositoryRevision, timestamp: new Date(context.now).toISOString() });
      return response(request, result.repositoryRevision, { manifest: stored, replayed: result.replayed ?? false });
    } catch (error) { throw converted(error); }
  }
}

export class GetBaselineService {
  constructor({ repository, baselineStore }) { this.repository = repository; this.store = baselineStore; }
  async execute(request) { try { const baseline = await this.store.get(request.baselineId); return response(request, await this.repository.revision(), request.projection ? { manifest: baseline.manifest } : baseline, undefined, { baselineId: request.baselineId, kind: "baseline", repositoryRevision: baseline.manifest.repositoryRevision }); } catch (error) { throw converted(error); } }
}

export class ListBaselinesService {
  constructor({ repository, baselineStore }) { this.repository = repository; this.store = baselineStore; }
  async execute(request) { const values = await this.store.list(); const limit = request.limit ?? 100; const items = values.slice(0, limit); return response(request, await this.repository.revision(), { baselines: items }, { returnedCount: items.length, truncated: items.length < values.length }); }
}

function changes(left, right, path = "") {
  if (canonicalHash({ present: left !== undefined, value: left ?? null }) === canonicalHash({ present: right !== undefined, value: right ?? null })) return [];
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) || Array.isArray(right)) return [{ path: path || "/", before: left ?? null, after: right ?? null, change: left === undefined ? "added" : right === undefined ? "removed" : "changed" }];
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort().flatMap((key) => changes(left[key], right[key], `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`));
}

function compareDocuments(left, right) {
  const compareCollection = (kind, extract) => {
    const a = new Map(extract(left).map((item) => [item.id, item])); const b = new Map(extract(right).map((item) => [item.id, item])); const output = [];
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      if (!a.has(id)) output.push({ id, kind, change: "added", afterVersion: b.get(id).version });
      else if (!b.has(id)) output.push({ id, kind, change: a.get(id).retirement ? "removed" : "removed", beforeVersion: a.get(id).version });
      else { const fields = changes(a.get(id), b.get(id)); if (fields.length) output.push({ id, kind, change: !a.get(id).retirement && b.get(id).retirement ? "retired" : "changed", beforeVersion: a.get(id).version, afterVersion: b.get(id).version, fields }); }
    }
    return output;
  };
  const items = compareCollection("requirement", allRequirements); const relationships = compareCollection("relationship", allRelationships); const configuration = changes(left.configuration, right.configuration, "/configuration");
  return { items, relationships, configuration, summary: { added: [...items, ...relationships].filter(({ change }) => change === "added").length, changed: [...items, ...relationships].filter(({ change }) => change === "changed").length, removed: [...items, ...relationships].filter(({ change }) => new Set(["removed", "retired"]).has(change)).length, configurationChanges: configuration.length } };
}

async function selection(selector, repository, store) {
  if (selector === "current") return { documents: await repository.read(), source: { kind: "current", repositoryRevision: await repository.revision() } };
  if (/^revision:[0-9]+$/u.test(selector)) { const revision = Number(selector.slice(9)); return { documents: await repository.readRevision(revision), source: { kind: "revision", repositoryRevision: revision } }; }
  const id = selector.startsWith("baseline:") ? selector.slice(9) : selector;
  if (/^BL-[0-9]{6}$/u.test(id)) { const baseline = await store.get(id); return { documents: baseline.documents, source: { baselineId: id, kind: "baseline", repositoryRevision: baseline.manifest.repositoryRevision } }; }
  const match = /^((?:BR|SR|RL)-[0-9]{6})@(\d+)$/u.exec(selector);
  if (match) { const found = await repository.readVersion(match[1], Number(match[2])); return { record: found.record, source: { id: match[1], itemVersion: Number(match[2]), kind: "version", repositoryRevision: found.repositoryRevision } }; }
  throw new ApplicationError("INVALID_ARGUMENT", `Unknown comparison selector: ${selector}`);
}

export class CompareRequirementsService {
  constructor({ repository, baselineStore, cursorSecret }) { this.repository = repository; this.store = baselineStore; this.cursor = new CursorCodec(cursorSecret); }
  async execute(request) {
    try {
      const [left, right] = await Promise.all([selection(request.left, this.repository, this.store), selection(request.right, this.repository, this.store)]);
      const result = left.record || right.record ? { fields: changes(left.record, right.record), summary: { changedFields: changes(left.record, right.record).length } } : compareDocuments(left.documents, right.documents);
      const limit = request.limit ?? 100;
      const fingerprint = canonicalHash({ left: request.left, right: request.right });
      let offset = 0;
      if (request.cursor) { const cursor = this.cursor.decode(request.cursor); if (cursor.fingerprint !== fingerprint) throw new ApplicationError("INVALID_ARGUMENT", "Comparison cursor does not match the requested comparison"); offset = cursor.offset; }
      const details = left.record || right.record ? (result.fields ?? []).map((entry) => ({ ...entry, bucket: "fields" })) : [...(result.items ?? []).map((entry) => ({ ...entry, bucket: "items" })), ...(result.relationships ?? []).map((entry) => ({ ...entry, bucket: "relationships" }))];
      const selected = details.slice(offset, offset + limit);
      if (left.record || right.record) result.fields = selected.map(({ bucket, ...entry }) => entry);
      else { result.items = selected.filter(({ bucket }) => bucket === "items").map(({ bucket, ...entry }) => entry); result.relationships = selected.filter(({ bucket }) => bucket === "relationships").map(({ bucket, ...entry }) => entry); }
      const nextOffset = offset + selected.length;
      const page = { returnedCount: selected.length, truncated: nextOffset < details.length, ...(nextOffset < details.length ? { nextCursor: this.cursor.encode({ fingerprint, offset: nextOffset }) } : {}) };
      return response(request, await this.repository.revision(), { ...result, left: left.source, right: right.source }, page);
    } catch (error) { throw converted(error); }
  }
}

export class CompareBaselineService extends CompareRequirementsService {}

export class ListAuditService {
  constructor({ repository, audit }) { this.repository = repository; this.audit = audit; }
  async execute(request) { if (!this.audit?.list) throw new ApplicationError("INTERNAL_ERROR", "Governed audit storage is not configured"); const result = await this.audit.list({ limit: request.limit ?? 100 }); return response(request, await this.repository.revision(), { events: result.events }, { returnedCount: result.events.length, truncated: result.events.length < result.total }); }
}

export class VerifyAuditService {
  constructor({ repository, audit, baselineStore }) { this.repository = repository; this.audit = audit; this.store = baselineStore; }
  async execute(request) { if (!this.audit?.verify) throw new ApplicationError("INTERNAL_ERROR", "Governed audit storage is not configured"); const audit = await this.audit.verify(); const baselines = this.store?.verify ? await this.store.verify() : undefined; return response(request, await this.repository.revision(), { audit, ...(baselines ? { baselines } : {}) }); }
}

export function createHistoryBaselineServices(options) {
  const tokens = options.readinessTokenStore ?? new ReadinessTokenStore(options.readinessTokens);
  const shared = { ...options, readinessTokenStore: tokens };
  return { HistoryService: new HistoryService(shared), CheckBaselineReadinessService: new CheckBaselineReadinessService(shared), CreateBaselineService: new CreateBaselineService(shared), GetBaselineService: new GetBaselineService(shared), ListBaselinesService: new ListBaselinesService(shared), CompareRequirementsService: new CompareRequirementsService(shared), CompareBaselineService: new CompareBaselineService(shared), ListAuditService: new ListAuditService(shared), VerifyAuditService: new VerifyAuditService(shared) };
}

export { compareDocuments, readiness };
