import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { PERMISSIONS } from "../authorization.js";
import { ApplicationError } from "../errors.js";
import { AuthorizationPartitionedReadCache } from "../read-cache.js";
import { parseRequirementId } from "../../domain/identifiers.js";
import { buildSearchIndex, SEARCH_INDEX_VERSION, searchIndex } from "../../index/search-index.js";

const ALL_FIELDS = Object.freeze([
  "acceptanceCriteria", "allocation", "category", "criticality", "customAttributes", "id", "level", "owner", "priority",
  "provenance", "rationale", "release", "retirement", "shortLabel", "sourceReferences", "statement", "status", "tags",
  "verificationMethods", "version",
]);
const PRESETS = Object.freeze({
  authoring: ["id", "level", "version", "shortLabel", "statement", "rationale", "category", "status", "priority", "criticality", "owner", "allocation", "release", "tags", "sourceReferences", "customAttributes"],
  full: ALL_FIELDS,
  summary: ["id", "level", "version", "shortLabel", "statement", "status", "priority", "criticality"],
  verification: ["id", "level", "version", "shortLabel", "statement", "status", "acceptanceCriteria", "verificationMethods", "sourceReferences"],
});
const LARGE_FIELDS = new Set(["acceptanceCriteria", "customAttributes", "rationale", "sourceReferences", "statement"]);
const SORT_FIELDS = new Set(["id", "level", "category", "status", "priority", "criticality", "owner", "release", "updatedAt", "version"]);
const FILTER_ARRAY_LIMITS = Object.freeze({ allocation: 64, category: 32, criticality: 32, document: 2, id: 50, level: 2, owner: 64, priority: 32, release: 64, status: 32, tags: 64, verificationMethod: 32, version: 64 });
const FILTER_PREDICATES = Object.freeze(["hasExternalReference", "hasSuspectLinks", "missingSource", "missingVerification"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function digest(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function applicationError(error, fallbackCode = "INTERNAL_ERROR") {
  if (error instanceof ApplicationError) return error;
  if (recognizedErrorCode(error?.code)) return new ApplicationError(error.code, error.message, { details: error.details, cause: error });
  return new ApplicationError(fallbackCode, "The read operation could not be completed", { cause: error });
}

function recognizedErrorCode(value) {
  return ["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "FORBIDDEN", "VERSION_CONFLICT", "REPOSITORY_BUSY", "INTEGRITY_FAILURE", "INTERNAL_ERROR"].includes(value);
}

function clone(value) {
  return structuredClone(value);
}

function allRecords(documents) {
  return [...documents.business.requirements, ...documents.software.requirements];
}

function allRelationships(documents) {
  return [...documents.business.relationships, ...documents.software.relationships];
}

function assertSnapshot(documents) {
  const revision = documents?.business?.repositoryRevision;
  if (!Number.isInteger(revision) || revision !== documents?.software?.repositoryRevision) {
    throw new ApplicationError("INTEGRITY_FAILURE", "The selected repository snapshot is inconsistent");
  }
  return revision;
}

async function selectSnapshot(repository, snapshotProvider, request) {
  if (request.baselineId) {
    if (!snapshotProvider) throw new ApplicationError("NOT_FOUND", "The selected requirements context was not found");
    let snapshot;
    try {
      snapshot = snapshotProvider.readBaseline
        ? await snapshotProvider.readBaseline(request.baselineId)
        : await snapshotProvider.read({ baselineId: request.baselineId });
    } catch (error) {
      throw applicationError(error, "NOT_FOUND");
    }
    if (!snapshot) throw new ApplicationError("NOT_FOUND", "The selected requirements context was not found");
    const documents = snapshot.documents ?? snapshot;
    return { documents, source: { baselineId: request.baselineId, kind: "baseline", repositoryRevision: assertSnapshot(documents) } };
  }
  const documents = await repository.read();
  return { documents, source: { kind: "current", repositoryRevision: assertSnapshot(documents) } };
}

function activeRequirement(requirement) {
  return !requirement.retirement && requirement.status !== "retired";
}

function validTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validateSearchRequest(request, listMode) {
  if (request.query !== undefined && (typeof request.query !== "string" || request.query.length > 1000)) {
    throw new ApplicationError("INVALID_ARGUMENT", "Search query exceeds the supported size");
  }
  if (request.projection && request.preset) throw new ApplicationError("INVALID_ARGUMENT", "Choose either a projection or a preset");
  if (request.baselineId !== undefined && (typeof request.baselineId !== "string" || !request.baselineId.length || request.baselineId.length > 128)) {
    throw new ApplicationError("INVALID_ARGUMENT", "Baseline selection is invalid");
  }
  if (request.filters && (typeof request.filters !== "object" || Array.isArray(request.filters))) {
    throw new ApplicationError("INVALID_ARGUMENT", "Filters must be an object");
  }
  const allowedFilters = new Set([...Object.keys(FILTER_ARRAY_LIMITS), ...FILTER_PREDICATES, "updatedFrom", "updatedTo"]);
  if (Object.keys(request.filters ?? {}).some((field) => !allowedFilters.has(field))) throw new ApplicationError("INVALID_ARGUMENT", "Filter is not supported");
  for (const [field, maximum] of Object.entries(FILTER_ARRAY_LIMITS)) {
    const values = request.filters?.[field];
    if (values !== undefined && (!Array.isArray(values) || values.length > maximum || new Set(values.map(stableJson)).size !== values.length)) {
      throw new ApplicationError("INVALID_ARGUMENT", `${field} filter is invalid or exceeds its limit`);
    }
  }
  for (const field of FILTER_PREDICATES) {
    if (request.filters?.[field] !== undefined && typeof request.filters[field] !== "boolean") throw new ApplicationError("INVALID_ARGUMENT", `${field} must be boolean`);
  }
  if (request.filters?.id !== undefined && (!Array.isArray(request.filters.id) || request.filters.id.some((id) => !parseRequirementId(id)))) {
    throw new ApplicationError("INVALID_ARGUMENT", "ID filters must use canonical requirement IDs");
  }
  for (const name of ["updatedFrom", "updatedTo"]) {
    if (request.filters?.[name] !== undefined && !validTimestamp(request.filters[name])) throw new ApplicationError("INVALID_ARGUMENT", `${name} must be a timestamp`);
  }
  if (request.filters?.updatedFrom && request.filters?.updatedTo && request.filters.updatedFrom > request.filters.updatedTo) {
    throw new ApplicationError("INVALID_ARGUMENT", "updatedFrom must not be later than updatedTo");
  }
  if (request.sort && !new Set(["asc", "desc"]).has(request.sort.direction)) throw new ApplicationError("INVALID_ARGUMENT", "Sort direction is invalid");
  if (listMode && request.query) throw new ApplicationError("INVALID_ARGUMENT", "requirements.list does not accept relevance query text");
}

function sanitizeValue(field, value) {
  if (field === "customAttributes") {
    return Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !key.startsWith("confidential.") && !key.startsWith("secret.")));
  }
  return clone(value);
}

function selectedFields(request, decision, authorization, pageSize) {
  const requested = request.projection ?? PRESETS[request.preset ?? "summary"];
  if (!Array.isArray(requested) || !requested.length || requested.some((field) => !ALL_FIELDS.includes(field))) {
    throw new ApplicationError("INVALID_ARGUMENT", "Projection contains an unsupported requirement field");
  }
  const unique = [...new Set(["id", "version", ...requested])];
  const allowed = authorization.allowedFields(decision, unique);
  if (!allowed.includes("id")) throw new ApplicationError("FORBIDDEN", "The requested projection is not permitted");
  const largeFieldCount = allowed.filter((field) => LARGE_FIELDS.has(field)).length;
  if (largeFieldCount > 1 && largeFieldCount * pageSize > 40) {
    throw new ApplicationError("INVALID_ARGUMENT", "Projection is too large for the requested page size");
  }
  return allowed;
}

function project(requirement, fields) {
  return Object.fromEntries(fields.filter((field) => requirement[field] !== undefined).map((field) => [field, sanitizeValue(field, requirement[field])]));
}

function relationSummary(requirementId, relationships, allowedIds, mode, maximum = 100) {
  if (!mode || mode === "none") return {};
  const related = relationships.filter(({ source, target, retirement }) => (
    !retirement && (source.id === requirementId || target.id === requirementId)
  )).filter(({ source, target }) => {
    const other = source.id === requirementId ? target : source;
    return other.kind !== "requirement" || allowedIds.has(other.id);
  });
  const counts = {};
  for (const relationship of related) counts[relationship.type] = (counts[relationship.type] ?? 0) + 1;
  if (mode === "counts") return { relationshipCounts: counts };
  return {
    relationshipCounts: counts,
    relationships: related.slice(0, maximum).map(({ id, source, suspect, target, type, version }) => ({ id, source, suspect, target, type, version })),
    relationshipsTruncated: related.length > maximum,
  };
}

function etag(requirement, source) {
  return `"${digest({ id: requirement.id, source, version: requirement.version })}"`;
}

function response(request, revision, source, data, page) {
  return {
    correlationId: request.correlationId,
    data,
    ...(page ? { page } : {}),
    repositoryRevision: revision,
    schemaVersion: "1.0.0",
    source,
  };
}

export class CursorCodec {
  constructor(secret = randomBytes(32)) {
    if (typeof secret !== "string" && !Buffer.isBuffer(secret)) throw new TypeError("Cursor secret must be bytes or a string");
    this.secret = secret;
  }

  encode(payload) {
    const body = Buffer.from(stableJson(payload)).toString("base64url");
    const signature = createHmac("sha256", this.secret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  decode(cursor) {
    if (typeof cursor !== "string" || cursor.length > 2048) throw new ApplicationError("INVALID_ARGUMENT", "Cursor is invalid");
    const [body, signature, extra] = cursor.split(".");
    if (!body || !signature || extra) throw new ApplicationError("INVALID_ARGUMENT", "Cursor is invalid");
    const actual = Buffer.from(signature);
    const expected = Buffer.from(createHmac("sha256", this.secret).update(body).digest("base64url"));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApplicationError("INVALID_ARGUMENT", "Cursor is invalid");
    try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
    catch { throw new ApplicationError("INVALID_ARGUMENT", "Cursor is invalid"); }
  }
}

class ReadService {
  constructor({ repository, authorization, snapshotProvider, searchIndex, policy = {}, cache, cursorSecret, cursorTtlMilliseconds = 900_000, responseSizeMaximum }) {
    if (!repository?.read) throw new TypeError("A Repository port is required");
    this.repository = repository;
    this.authorization = authorization;
    this.snapshotProvider = snapshotProvider;
    this.searchIndex = searchIndex;
    this.policy = policy;
    this.cache = cache ?? new AuthorizationPartitionedReadCache();
    this.cursorCodec = new CursorCodec(cursorSecret);
    this.cursorTtlMilliseconds = cursorTtlMilliseconds;
    this.responseSizeMaximum = responseSizeMaximum ?? policy?.limits?.responseSizeMaximum ?? 256_000;
  }

  context(context) {
    const authorization = context.authorization ?? this.authorization;
    if (!authorization) throw new TypeError("An Authorization port is required");
    const decision = context.security ?? authorization.evaluate(context.identity, PERMISSIONS.READ, { now: context.now });
    if (!decision.allowed) throw new ApplicationError("FORBIDDEN", "Caller is not authorized for this operation");
    return { authorization, decision };
  }

  cacheKey(kind, request, revision, source, decision) {
    return digest({ kind, projection: request.projection ?? request.preset, request, revision, scope: decision.scopeKey, source });
  }
}

export class GetRequirementService extends ReadService {
  async execute(request, context) {
    const { authorization, decision } = this.context(context);
    const ids = request.ids ?? (request.id ? [request.id] : []);
    if (request.id && request.ids) throw new ApplicationError("INVALID_ARGUMENT", "Choose either id or ids");
    if (request.projection && request.preset) throw new ApplicationError("INVALID_ARGUMENT", "Choose either a projection or a preset");
    if (request.version !== undefined && (!Number.isInteger(request.version) || request.version < 1 || request.baselineId)) {
      throw new ApplicationError("INVALID_ARGUMENT", "Version must be positive and applies only to current-state reads");
    }
    if (!ids.length || ids.length > 50 || new Set(ids).size !== ids.length || ids.some((id) => !parseRequirementId(id))) {
      throw new ApplicationError("INVALID_ARGUMENT", "One to fifty exact canonical requirement IDs are required");
    }
    if (request.version !== undefined && ids.length !== 1) throw new ApplicationError("INVALID_ARGUMENT", "An exact version read requires one ID");
    const selected = await selectSnapshot(this.repository, this.snapshotProvider, request);
    const revision = selected.source.repositoryRevision;
    const responseSource = request.version === undefined ? selected.source : { ...selected.source, itemVersion: request.version, kind: "version" };
    const fields = selectedFields(request, decision, authorization, ids.length);
    const key = this.cacheKey("get", request, revision, responseSource, decision);
    const cached = this.cache.get(key);
    if (cached) return cached;
    let requirements = allRecords(selected.documents);
    if (request.version !== undefined) {
      const current = requirements.find(({ id, version }) => id === ids[0] && version === request.version);
      if (current) requirements = [current];
      else if (this.snapshotProvider?.readVersion) {
        try {
          const historic = await this.snapshotProvider.readVersion(ids[0], request.version);
          requirements = historic ? [historic.requirement ?? historic] : [];
        } catch {
          requirements = [];
        }
      } else requirements = [];
    }
    const byId = new Map(requirements.map((item) => [item.id, item]));
    const readable = allRecords(selected.documents).filter((item) => authorization.canReadItem(decision, item));
    const allowedIds = new Set(readable.map(({ id }) => id));
    const relations = allRelationships(selected.documents);
    const results = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (!item || !authorization.canReadItem(decision, item) || (!request.includeRetired && !activeRequirement(item))) {
        throw new ApplicationError("NOT_FOUND", "Requirement was not found");
      }
      results.push({
        ...project(item, fields),
        etag: etag(item, responseSource),
        ...relationSummary(item.id, relations, allowedIds, request.relationships, Math.min(this.policy?.limits?.graphNodeMaximum ?? 100, 100)),
      });
    }
    const data = ids.length === 1 ? results[0] : { items: results, returnedCount: results.length };
    if (Buffer.byteLength(stableJson(data), "utf8") > this.responseSizeMaximum) {
      throw new ApplicationError("INVALID_ARGUMENT", "Projection cannot fit within the response-size ceiling");
    }
    const result = response(request, revision, responseSource, data);
    this.cache.set(key, result);
    return result;
  }
}

function compareField(left, right, field) {
  const a = field === "updatedAt" ? left.requirement.provenance?.updatedAt : left.requirement[field];
  const b = field === "updatedAt" ? right.requirement.provenance?.updatedAt : right.requirement[field];
  if (a === b) return left.requirement.id.localeCompare(right.requirement.id);
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
}

function snippet(text, needles, maximum = 240) {
  const value = String(text ?? "").replace(/\s+/gu, " ");
  const normalized = value.toLocaleLowerCase("und");
  const offsets = needles.map((needle) => normalized.indexOf(needle)).filter((offset) => offset >= 0);
  const center = offsets.length ? Math.min(...offsets) : 0;
  const start = Math.max(0, center - 60);
  const end = Math.min(value.length, start + maximum);
  return `${start ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`;
}

class SearchService extends ReadService {
  constructor(options, listMode) {
    super(options);
    this.listMode = listMode;
  }

  async execute(request, context) {
    const started = Date.now();
    const { authorization, decision } = this.context(context);
    validateSearchRequest(request, this.listMode);
    const selected = await selectSnapshot(this.repository, this.snapshotProvider, request);
    const revision = selected.source.repositoryRevision;
    const deadline = started + (this.policy?.limits?.timeoutMilliseconds ?? 30_000);
    const maximum = Math.min(this.policy?.limits?.searchMaximum ?? 100, 100);
    const limit = request.limit ?? this.policy?.limits?.searchDefault ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > maximum) throw new ApplicationError("INVALID_ARGUMENT", `Limit must be between 1 and ${maximum}`);
    if (this.listMode && !request.sort) throw new ApplicationError("INVALID_ARGUMENT", "requirements.list requires an explicit deterministic field sort");
    if (request.sort && !SORT_FIELDS.has(request.sort.field)) throw new ApplicationError("INVALID_ARGUMENT", "Sort field is not supported");
    const fields = selectedFields(request, decision, authorization, limit);
    const records = allRecords(selected.documents).filter((item) => authorization.canReadItem(decision, item));
    const allowedIds = new Set(records.map(({ id }) => id));
    const normalizedRequest = {
      baselineId: request.baselineId,
      filters: stable(request.filters ?? {}),
      includeRetired: Boolean(request.includeRetired),
      listMode: this.listMode,
      projection: fields,
      query: this.listMode ? "" : request.query ?? "",
      sort: request.sort ?? (request.query ? { direction: "desc", field: "relevance" } : { direction: "asc", field: "id" }),
    };
    const queryHash = digest(normalizedRequest);
    let offset = 0;
    if (request.cursor) {
      const cursor = this.cursorCodec.decode(request.cursor);
      const cursorAge = Date.now() - cursor.issuedAt;
      if (cursor.repositoryRevision !== revision || cursor.queryHash !== queryHash || cursor.scopeHash !== digest(decision.scopeKey) || cursor.configurationVersion !== String(this.policy.configurationVersion ?? "1") || cursor.indexVersion !== SEARCH_INDEX_VERSION) {
        throw new ApplicationError("INVALID_ARGUMENT", "Cursor is stale for the selected repository context");
      }
      if (!Number.isInteger(cursor.offset) || cursor.offset < 0 || !Number.isFinite(cursor.issuedAt) || cursorAge < 0 || cursorAge > this.cursorTtlMilliseconds) {
        throw new ApplicationError("INVALID_ARGUMENT", "Cursor is invalid or expired");
      }
      offset = cursor.offset;
    }
    let matches;
    let indexStatus = "current";
    const scopedSnapshot = selected.source.kind === "baseline" || decision.componentRestricted;
    try {
      if (scopedSnapshot) throw new Error("Selected context requires an authorization-filtered canonical index");
      const health = await this.searchIndex?.health?.();
      if (!this.searchIndex || health?.repositoryRevision !== revision || health?.stale) {
        if (!this.searchIndex?.rebuild) throw new Error("No derived index is configured");
        await this.searchIndex.rebuild(selected.documents, { configurationVersion: this.policy.configurationVersion, deadline });
      }
      matches = await this.searchIndex.query({
        allowedIds,
        allowedSearchFields: decision.fieldRestricted ? decision.fields : undefined,
        deadline,
        filters: request.filters,
        includeRetired: request.includeRetired,
        query: normalizedRequest.query,
      });
    } catch (error) {
      if (error?.message === "Search timeout exceeded") throw new ApplicationError("INVALID_ARGUMENT", "Search exceeded its bounded execution time");
      if (!scopedSnapshot) this.searchIndex?.markStale?.(error);
      indexStatus = selected.source.kind === "baseline" ? "canonical-snapshot" : decision.componentRestricted ? "authorization-scan" : "canonical-fallback";
      const scopedRelationships = allRelationships(selected.documents).filter(({ source, target }) => (
        (source.kind !== "requirement" || allowedIds.has(source.id)) && (target.kind !== "requirement" || allowedIds.has(target.id))
      ));
      try {
        const fallback = buildSearchIndex({
          business: { ...selected.documents.business, relationships: scopedRelationships.filter((relationship) => selected.documents.business.relationships.includes(relationship)), requirements: records.filter(({ level }) => level === "business") },
          software: { ...selected.documents.software, relationships: scopedRelationships.filter((relationship) => selected.documents.software.relationships.includes(relationship)), requirements: records.filter(({ level }) => level === "software") },
        }, { configurationVersion: this.policy.configurationVersion, deadline });
        matches = searchIndex(fallback, { allowedSearchFields: decision.fieldRestricted ? decision.fields : undefined, deadline, filters: request.filters, includeRetired: request.includeRetired, query: normalizedRequest.query });
      } catch (error_) {
        const message = error_?.message === "Search timeout exceeded" ? "Search exceeded its bounded execution time" : error_.message;
        throw new ApplicationError("INVALID_ARGUMENT", message);
      }
    }
    const byId = new Map(records.map((item) => [item.id, item]));
    const ranked = matches.map((match) => ({ ...match, requirement: byId.get(match.entry.id) })).filter(({ requirement }) => requirement);
    const sort = normalizedRequest.sort;
    if (sort.field === "relevance") ranked.sort((left, right) => (left.score - right.score) * (sort.direction === "desc" ? -1 : 1) || left.requirement.id.localeCompare(right.requirement.id));
    else ranked.sort((left, right) => {
      const compared = compareField(left, right, sort.field);
      const leftValue = sort.field === "updatedAt" ? left.requirement.provenance?.updatedAt : left.requirement[sort.field];
      const rightValue = sort.field === "updatedAt" ? right.requirement.provenance?.updatedAt : right.requirement[sort.field];
      if (leftValue === rightValue) return left.requirement.id.localeCompare(right.requirement.id);
      return compared * (sort.direction === "desc" ? -1 : 1);
    });

    const needles = [normalizedRequest.query.toLocaleLowerCase("und").replaceAll('"', "").trim()].filter(Boolean);
    const items = [];
    let position = offset;
    while (position < ranked.length && items.length < limit) {
      const match = ranked[position];
      const item = {
        ...project(match.requirement, fields),
        matchedFields: match.matchedFields,
        relevance: match.score,
        snippets: Object.fromEntries(match.matchedFields.filter((field) => ["statement", "shortLabel", "rationale"].includes(field)).map((field) => [field, snippet(match.requirement[field], needles)])),
      };
      const candidate = [...items, item];
      if (Buffer.byteLength(stableJson(candidate), "utf8") > this.responseSizeMaximum) {
        if (!items.length) throw new ApplicationError("INVALID_ARGUMENT", "Projection cannot fit within the response-size ceiling");
        break;
      }
      items.push(item);
      position += 1;
      if (Date.now() > deadline) {
        throw new ApplicationError("INVALID_ARGUMENT", "Search exceeded its bounded execution time");
      }
    }
    const truncated = position < ranked.length;
    const nextCursor = truncated ? this.cursorCodec.encode({
      configurationVersion: String(this.policy.configurationVersion ?? "1"),
      indexVersion: SEARCH_INDEX_VERSION,
      issuedAt: Date.now(),
      offset: position,
      queryHash,
      repositoryRevision: revision,
      scopeHash: digest(decision.scopeKey),
    }) : undefined;
    return response(request, revision, selected.source, {
      appliedFilters: stable(request.filters ?? {}),
      indexStatus,
      items,
      sort,
    }, { nextCursor, returnedCount: items.length, truncated });
  }
}

export class SearchRequirementsService extends SearchService {
  constructor(options) { super(options, false); }
}

export class ListRequirementsService extends SearchService {
  constructor(options) { super(options, true); }
}

export function createReadServices(options) {
  return {
    GetRequirementService: new GetRequirementService(options),
    ListRequirementsService: new ListRequirementsService(options),
    SearchRequirementsService: new SearchRequirementsService(options),
  };
}

export { ALL_FIELDS as REQUIREMENT_READ_FIELDS, PRESETS as REQUIREMENT_PROJECTION_PRESETS };
