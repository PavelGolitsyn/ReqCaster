import { ERROR_CODES } from "../application/errors.js";
import { TOOL_CATALOG } from "../application/services/catalog.js";

const string = (options = {}) => ({ type: "string", ...options });
const integer = (options = {}) => ({ type: "integer", ...options });
const array = (items, options = {}) => ({ type: "array", items, ...options });
const object = (properties, required = [], options = {}) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
  ...options,
});

const correlationId = string({ pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$" });
const idempotencyKey = string({ minLength: 8, maxLength: 128 });
const requirementId = string({ pattern: "^(BR|SR)-[0-9]{6}$" });
const opaqueCursor = string({ minLength: 1, maxLength: 2048 });
const projection = array(string({ pattern: "^[A-Za-z][A-Za-z0-9.]{0,63}$" }), { uniqueItems: true, maxItems: 32 });
const expectedRepositoryRevision = integer({ minimum: 0 });
const expectedVersion = integer({ minimum: 1 });
const requirementIds = array(requirementId, { minItems: 1, maxItems: 50, uniqueItems: true });
const relationshipId = string({ pattern: "^RL-[0-9]{6}$" });
const changeId = string({ pattern: "^CH-[0-9]{6}$" });
const reviewId = string({ pattern: "^RV-[0-9]{6}$" });
const findingId = string({ pattern: "^FN-[0-9]{6}$" });
const verificationPlanId = string({ pattern: "^VP-[0-9]{6}$" });
const verificationEvidenceId = string({ pattern: "^EV-[0-9]{6}$" });
const baselineException = object({
  code: string({ minLength: 1, maxLength: 64 }),
  requirementId,
  relationshipId,
  rationale: string({ minLength: 1, maxLength: 4000 }),
  authority: string({ minLength: 1, maxLength: 256 }),
  expiresAt: string({ minLength: 1, maxLength: 32 }),
  reviewAt: string({ minLength: 1, maxLength: 32 }),
}, ["code", "rationale", "authority"]);
const evidenceReference = object({
  id: string({ minLength: 1, maxLength: 256 }),
  type: string({ minLength: 1, maxLength: 64 }),
  uri: string({ minLength: 1, maxLength: 2048 }),
  status: { enum: ["planned", "passed", "failed", "accepted", "not_applicable"] },
}, ["id", "type"]);
const endpoint = object({
  kind: string({ minLength: 1, maxLength: 64 }),
  id: string({ minLength: 1, maxLength: 256 }),
  version: expectedVersion,
  system: string({ minLength: 1, maxLength: 128 }),
  artifactType: string({ minLength: 1, maxLength: 64 }),
  externalId: string({ minLength: 1, maxLength: 256 }),
  externalVersion: string({ minLength: 1, maxLength: 128 }),
  uri: string({ minLength: 1, maxLength: 2048 }),
  systemOfRecord: string({ minLength: 1, maxLength: 128 }),
}, ["kind"]);
const sourceItemVersion = object({ id: string({ minLength: 1, maxLength: 256 }), version: expectedVersion }, ["id", "version"]);
const aiAssistance = object({
  assisted: { type: "boolean" }, provider: string({ minLength: 1, maxLength: 128 }), service: string({ minLength: 1, maxLength: 128 }), model: string({ minLength: 1, maxLength: 128 }),
  suggestionId: string({ minLength: 1, maxLength: 256 }), runId: string({ minLength: 1, maxLength: 256 }), promptTemplateVersion: string({ minLength: 1, maxLength: 128 }), ruleVersion: string({ minLength: 1, maxLength: 128 }),
  generatedAt: string({ minLength: 20, maxLength: 32 }), sourceItems: array(sourceItemVersion, { maxItems: 500 }), requester: string({ minLength: 1, maxLength: 256 }), contentHash: string({ pattern: "^[a-f0-9]{64}$" }),
  rationale: string({ minLength: 1, maxLength: 4000 }), proposalStatus: { enum: ["proposed", "accepted", "rejected"] },
  acceptance: object({
    acceptedAt: string({ minLength: 20, maxLength: 32 }), acceptedBy: string({ minLength: 1, maxLength: 256 }), principal: string({ minLength: 1, maxLength: 256 }), rationale: string({ minLength: 1, maxLength: 4000 }),
    proposedContentHash: string({ pattern: "^[a-f0-9]{64}$" }), acceptedContentHash: string({ pattern: "^[a-f0-9]{64}$" }),
    diff: array(object({ field: string({ minLength: 1, maxLength: 64 }), before: {}, after: {} }, ["field"]), { maxItems: 64 }),
  }, ["acceptedAt", "acceptedBy", "principal", "rationale", "proposedContentHash", "acceptedContentHash", "diff"]),
  humanEdits: array(object({ at: string({ minLength: 20, maxLength: 32 }), by: string({ minLength: 1, maxLength: 256 }), principal: string({ minLength: 1, maxLength: 256 }), fields: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }), reason: string({ minLength: 1, maxLength: 4000 }) }, ["at", "by", "principal", "fields"]), { maxItems: 4096 }),
}, ["assisted"]);
const query = (payload, required = []) => object(
  { schemaVersion: { const: "1.0.0" }, correlationId, ...payload },
  ["schemaVersion", "correlationId", ...required],
);
const command = (payload, required = []) => object(
  { schemaVersion: { const: "1.0.0" }, correlationId, idempotencyKey, expectedRepositoryRevision, ...payload },
  ["schemaVersion", "correlationId", "idempotencyKey", "expectedRepositoryRevision", ...required],
);

const requirementDraft = object({
  level: { enum: ["business", "software"] },
  statement: string({ minLength: 1, maxLength: 10000 }),
  shortLabel: string({ minLength: 1, maxLength: 160 }),
  category: string({ minLength: 1, maxLength: 64 }),
  status: string({ minLength: 1, maxLength: 64 }),
  priority: string({ minLength: 1, maxLength: 64 }),
  criticality: string({ minLength: 1, maxLength: 64 }),
  owner: string({ minLength: 1, maxLength: 256 }),
  rationale: string({ minLength: 1, maxLength: 4000 }),
  source: string({ minLength: 1, maxLength: 256 }),
  verificationMethods: array(string({ minLength: 1, maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
  acceptanceCriteria: array(object({
    id: string({ minLength: 1, maxLength: 64 }),
    text: string({ minLength: 1, maxLength: 2000 }),
    verificationMethod: string({ minLength: 1, maxLength: 64 }),
  }, ["id", "text"]), { maxItems: 128 }),
  sourceReferences: array(object({
    type: string({ minLength: 1, maxLength: 64 }),
    uri: string({ minLength: 1, maxLength: 2048 }),
    title: string({ minLength: 1, maxLength: 256 }),
  }, ["type", "uri"]), { maxItems: 128 }),
  customAttributes: object({}, [], { additionalProperties: true, maxProperties: 64 }),
  aiAssistance,
}, ["level", "statement", "category"]);

const acceptanceCriteria = requirementDraft.properties.acceptanceCriteria;
const sourceReferences = requirementDraft.properties.sourceReferences;
const customAttributes = requirementDraft.properties.customAttributes;
const patch = object({
  statement: string({ minLength: 1, maxLength: 10000 }),
  shortLabel: string({ minLength: 1, maxLength: 160 }),
  category: string({ minLength: 1, maxLength: 64 }),
  priority: string({ minLength: 1, maxLength: 64 }),
  criticality: string({ minLength: 1, maxLength: 64 }),
  owner: string({ minLength: 1, maxLength: 256 }),
  rationale: string({ minLength: 1, maxLength: 4000 }),
  verificationMethods: requirementDraft.properties.verificationMethods,
  acceptanceCriteria,
  sourceReferences,
  customAttributes,
});

const bulkOperation = object({
  operation: { enum: ["create", "update", "retire"] },
  draft: requirementDraft,
  id: requirementId,
  expectedVersion,
  patch,
  reason: string({ minLength: 1, maxLength: 4000 }),
  decisionReference: string({ minLength: 1, maxLength: 256 }),
  replacementId: requirementId,
}, ["operation"]);

const changeOperation = object({
  operation: { enum: ["create", "update", "retire"] },
  draft: requirementDraft,
  id: requirementId,
  expectedVersion,
  patch,
  reason: string({ minLength: 1, maxLength: 4000 }),
  decisionReference: string({ minLength: 1, maxLength: 256 }),
  replacementId: requirementId,
}, ["operation"]);
const transitionException = object({
  scope: array(string({ minLength: 1, maxLength: 128 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
  rationale: string({ minLength: 1, maxLength: 4000 }),
  approver: string({ minLength: 1, maxLength: 256 }),
  expiresAt: string({ minLength: 20, maxLength: 32 }),
  reviewAt: string({ minLength: 20, maxLength: 32 }),
}, ["scope", "rationale", "approver"]);
const impactKey = object({ kind: string({ minLength: 1, maxLength: 64 }), id: string({ minLength: 1, maxLength: 256 }), version: expectedVersion }, ["kind", "id"]);

export const POLICY_BODY_SCHEMA = object({
  traceabilityModelVersion: string({ pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$" }),
  requirements: object({
    categories: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
    statuses: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
    priorities: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    criticalities: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    verificationMethods: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
  }, ["categories", "statuses", "priorities", "criticalities", "verificationMethods"]),
  authoringRules: object({
    defaultStatus: string({ minLength: 1, maxLength: 64 }),
    requiredFields: array(object({
      level: { enum: ["business", "software"] },
      fields: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    }, ["level", "fields"]), { minItems: 1, maxItems: 2 }),
    rationaleOrSourceLevels: array({ enum: ["business", "software"] }, { maxItems: 2, uniqueItems: true }),
    verificationPlanningLevels: array({ enum: ["business", "software"] }, { maxItems: 2, uniqueItems: true }),
  }, ["defaultStatus", "requiredFields", "rationaleOrSourceLevels", "verificationPlanningLevels"]),
  transitions: array(object({
    from: string({ minLength: 1, maxLength: 64 }),
    to: string({ minLength: 1, maxLength: 64 }),
    permission: string({ minLength: 1, maxLength: 128 }),
    requiredFields: array(string({ minLength: 1, maxLength: 64 }), { maxItems: 64, uniqueItems: true }),
    requiredEvidenceTypes: array(string({ minLength: 1, maxLength: 64 }), { maxItems: 64, uniqueItems: true }),
    blockingConditions: array({ enum: ["blocking-tbds", "coverage", "critical-suspect-links"] }, { maxItems: 16, uniqueItems: true }),
    impactActions: array(string({ minLength: 1, maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
    allowException: { type: "boolean" },
  }, ["from", "to", "permission", "requiredFields", "requiredEvidenceTypes", "blockingConditions", "impactActions", "allowException"]), { maxItems: 256 }),
  changeControl: object({
    protectedStatuses: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
    criticalImpactLevels: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    impactDepthMaximum: integer({ minimum: 1, maximum: 20 }),
    impactNodeMaximum: integer({ minimum: 1, maximum: 10000 }),
    outboxMaximumAttempts: integer({ minimum: 1, maximum: 100 }),
  }, ["protectedStatuses", "criticalImpactLevels", "impactDepthMaximum", "impactNodeMaximum", "outboxMaximumAttempts"]),
  relationships: array(object({
    type: string({ minLength: 1, maxLength: 64 }),
    direction: { const: "source-to-target" },
    sourceKinds: array(string({ maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    targetKinds: array(string({ maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    maxTargets: integer({ minimum: 1 }),
    suspectOn: array(string({ maxLength: 64 }), { maxItems: 16, uniqueItems: true }),
    traversal: { enum: ["upstream", "downstream", "horizontal"] },
    symmetric: { type: "boolean" },
    allowCycles: { type: "boolean" },
    rationaleRequired: { type: "boolean" },
  }, ["type", "direction", "sourceKinds", "targetKinds", "maxTargets", "suspectOn"]), { maxItems: 256 }),
  requiredMetadata: array(object({
    level: { enum: ["business", "software"] },
    status: string({ minLength: 1, maxLength: 64 }),
    fields: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
  }, ["level", "status", "fields"]), { maxItems: 256 }),
  coverageRules: array(object({
    level: { enum: ["business", "software"] },
    statuses: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
    requiredRelationshipTypes: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
  }, ["level", "statuses", "requiredRelationshipTypes"]), { maxItems: 256 }),
  baselineReadiness: object({
    allowedStatuses: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
    blockSuspectLinks: { type: "boolean" },
    blockMissingRequiredMetadata: { type: "boolean" },
  }, ["allowedStatuses", "blockSuspectLinks", "blockMissingRequiredMetadata"]),
  retirementRules: object({
    decisionReferenceStatuses: array(string({ minLength: 1, maxLength: 64 }), { maxItems: 64, uniqueItems: true }),
    blockUnresolvedCriticalDependencies: { type: "boolean" },
  }, ["decisionReferenceStatuses", "blockUnresolvedCriticalDependencies"]),
  authorizedDecisionTypes: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
  limits: object({
    searchDefault: integer({ minimum: 1 }),
    searchMaximum: integer({ minimum: 1 }),
    graphDepthMaximum: integer({ minimum: 1 }),
    graphNodeMaximum: integer({ minimum: 1 }),
    bulkMaximum: integer({ minimum: 1 }),
    bulkByteMaximum: integer({ minimum: 1024 }),
    timeoutMilliseconds: integer({ minimum: 1 }),
    responseSizeMaximum: integer({ minimum: 1024 }),
  }, ["searchDefault", "searchMaximum", "graphDepthMaximum", "graphNodeMaximum", "bulkMaximum", "bulkByteMaximum", "timeoutMilliseconds", "responseSizeMaximum"]),
  qualityRules: object({
    structuralValidation: { const: "blocking" },
    languageQuality: { const: "advisory" },
    advisorySeverities: array({ enum: ["info", "warning"] }, { minItems: 1, maxItems: 2, uniqueItems: true }),
    promotedRuleIds: array(string({ pattern: "^REQ-[A-Z]+-[0-9]{3}$" }), { maxItems: 64, uniqueItems: true }),
  }, ["structuralValidation", "languageQuality", "advisorySeverities"]),
  verification: object({
    staleOnFields: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    requireNonSuspectRelationship: { type: "boolean" },
    requirePlansForReadiness: { type: "boolean" },
  }, ["staleOnFields", "requireNonSuspectRelationship", "requirePlansForReadiness"]),
}, ["traceabilityModelVersion", "requirements", "authoringRules", "transitions", "relationships", "requiredMetadata", "coverageRules", "baselineReadiness", "retirementRules", "authorizedDecisionTypes", "limits", "qualityRules"]);

export const POLICY_DOCUMENT_SCHEMA = object({
  $schema: string({ minLength: 1, maxLength: 512 }),
  schemaVersion: { const: "1.0.0" },
  configurationVersion: string({ pattern: "^[1-9][0-9]*$" }),
  ...POLICY_BODY_SCHEMA.properties,
}, ["$schema", "schemaVersion", "configurationVersion", ...POLICY_BODY_SCHEMA.required]);

const readFilters = object({
  id: requirementIds,
  level: array({ enum: ["business", "software"] }, { maxItems: 2, uniqueItems: true }),
  document: array({ enum: ["business", "software"] }, { maxItems: 2, uniqueItems: true }),
  category: array(string({ maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
  status: array(string({ maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
  priority: array(string({ maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
  criticality: array(string({ maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
  owner: array(string({ maxLength: 256 }), { maxItems: 64, uniqueItems: true }),
  allocation: array(string({ maxLength: 160 }), { maxItems: 64, uniqueItems: true }),
  release: array(string({ maxLength: 160 }), { maxItems: 64, uniqueItems: true }),
  tags: array(string({ maxLength: 160 }), { maxItems: 64, uniqueItems: true }),
  verificationMethod: array(string({ maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
  version: array(integer({ minimum: 1 }), { maxItems: 64, uniqueItems: true }),
  updatedFrom: string({ maxLength: 32 }),
  updatedTo: string({ maxLength: 32 }),
  missingSource: { type: "boolean" },
  missingVerification: { type: "boolean" },
  hasSuspectLinks: { type: "boolean" },
  hasExternalReference: { type: "boolean" },
});
const fieldSort = object({
  field: { enum: ["id", "level", "category", "status", "priority", "criticality", "owner", "release", "updatedAt", "version", "relevance"] },
  direction: { enum: ["asc", "desc"] },
}, ["field", "direction"]);
const readSelection = {
  baselineId: string({ minLength: 1, maxLength: 128 }),
  includeRetired: { type: "boolean" },
  preset: { enum: ["summary", "authoring", "verification", "full"] },
  projection,
};

export const SCHEMAS = Object.freeze({
  GetRequest: query({ id: requirementId, ids: requirementIds, version: expectedVersion, relationships: { enum: ["none", "counts", "summary"] }, ...readSelection }),
  SearchRequest: query({
    query: string({ maxLength: 1000 }),
    filters: readFilters,
    sort: fieldSort,
    cursor: opaqueCursor,
    limit: integer({ minimum: 1, maximum: 100 }),
    ...readSelection,
  }),
  ListRequest: query({ filters: readFilters, sort: fieldSort, cursor: opaqueCursor, limit: integer({ minimum: 1, maximum: 100 }), ...readSelection }, ["sort"]),
  TraceRequest: query({
    id: requirementId,
    ids: requirementIds,
    starts: array(endpoint, { minItems: 1, maxItems: 50 }),
    direction: { enum: ["upstream", "downstream", "both"] },
    relationshipTypes: array(string({ maxLength: 64 }), { uniqueItems: true, maxItems: 32 }),
    baselineId: string({ minLength: 1, maxLength: 128 }),
    depth: integer({ minimum: 1, maximum: 5 }),
    nodeLimit: integer({ minimum: 1, maximum: 1000 }),
    projection: { enum: ["compact", "expanded"] },
    includeRetired: { type: "boolean" },
    includeSuspect: { type: "boolean" },
    includeInvalid: { type: "boolean" },
    includeWaived: { type: "boolean" },
    includeExternal: { type: "boolean" },
  }, ["direction"]),
  CoverageRequest: query({
    gap: { enum: ["missing", "planned", "present", "present-but-suspect", "stale", "failed", "waived", "deferred", "accepted-passing", "not-applicable"] },
    level: { enum: ["business", "software"] },
    statuses: array(string({ maxLength: 64 }), { uniqueItems: true, maxItems: 32 }),
    relationshipTypes: array(string({ maxLength: 64 }), { uniqueItems: true, maxItems: 32 }),
    baselineId: string({ minLength: 1, maxLength: 128 }),
    includeRetired: { type: "boolean" },
    cursor: opaqueCursor,
    limit: integer({ minimum: 1, maximum: 100 }),
  }),
  OrphanRequest: query({
    level: { enum: ["business", "software"] },
    relationshipTypes: array(string({ maxLength: 64 }), { uniqueItems: true, maxItems: 32 }),
    baselineId: string({ minLength: 1, maxLength: 128 }),
    includeRetired: { type: "boolean" },
    cursor: opaqueCursor,
    limit: integer({ minimum: 1, maximum: 100 }),
  }),
  ImpactRequest: query({
    id: requirementId,
    ids: requirementIds,
    starts: array(endpoint, { minItems: 1, maxItems: 50 }),
    direction: { enum: ["upstream", "downstream", "both"] },
    relationshipTypes: array(string({ maxLength: 64 }), { uniqueItems: true, maxItems: 32 }),
    baselineId: string({ minLength: 1, maxLength: 128 }),
    depth: integer({ minimum: 1, maximum: 5 }),
    nodeLimit: integer({ minimum: 1, maximum: 1000 }),
    includeRetired: { type: "boolean" },
    includeSuspect: { type: "boolean" },
    includeInvalid: { type: "boolean" },
    includeWaived: { type: "boolean" },
    includeExternal: { type: "boolean" },
    manuallyAddedIds: requirementIds,
  }, ["direction"]),
  CompareRequest: query({ left: string({ minLength: 1, maxLength: 128 }), right: string({ minLength: 1, maxLength: 128 }), projection, cursor: opaqueCursor, limit: integer({ minimum: 1, maximum: 100 }) }, ["left", "right"]),
  HistoryRequest: query({ id: requirementId, cursor: opaqueCursor, limit: integer({ minimum: 1, maximum: 100 }) }, ["id"]),
  ReportRequest: query({
    reportType: { enum: ["business-requirements", "software-requirements", "traceability", "coverage", "orphans", "reviews", "changes", "baseline", "baseline-comparison", "verification", "readiness", "audit", "history"] },
    baselineId: string({ maxLength: 128 }),
    compareBaselineId: string({ maxLength: 128 }),
    reportId: string({ maxLength: 128 }),
    templateVersion: string({ minLength: 1, maxLength: 64 }),
    filters: object({}, [], { additionalProperties: true, maxProperties: 32 }),
  }, ["reportType"]),
  ValidateDraftRequest: query({ draft: requirementDraft }, ["draft"]),
  CreateRequest: command({ draft: requirementDraft }, ["draft"]),
  UpdateRequest: command({ id: requirementId, expectedVersion, patch, reason: string({ minLength: 1, maxLength: 4000 }) }, ["id", "expectedVersion", "patch"]),
  RetireRequest: command({ id: requirementId, expectedVersion, reason: string({ minLength: 1, maxLength: 4000 }), decisionReference: string({ minLength: 1, maxLength: 256 }), replacementId: requirementId }, ["id", "expectedVersion", "reason"]),
  VersionedItemCommand: command({ id: string({ minLength: 1, maxLength: 128 }), expectedVersion, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["id", "expectedVersion", "rationale"]),
  LinkRequest: command({
    sourceId: requirementId,
    targetId: string({ minLength: 1, maxLength: 256 }),
    sourceExpectedVersion: expectedVersion,
    targetExpectedVersion: expectedVersion,
    source: endpoint,
    target: endpoint,
    relationshipType: string({ minLength: 1, maxLength: 64 }),
    rationale: string({ minLength: 1, maxLength: 4000 }),
  }, ["relationshipType"]),
  UnlinkRequest: command({ id: relationshipId, expectedVersion, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["id", "expectedVersion", "rationale"]),
  ReassessLinkRequest: command({
    id: relationshipId,
    expectedVersion,
    assessment: { enum: ["valid", "updated", "not_affected", "waived", "removed"] },
    rationale: string({ minLength: 1, maxLength: 4000 }),
  }, ["id", "expectedVersion", "assessment", "rationale"]),
  BulkPreviewRequest: command({ operations: array(bulkOperation, { minItems: 1, maxItems: 500 }) }, ["operations"]),
  BulkCommitRequest: object({ schemaVersion: { const: "1.0.0" }, correlationId, idempotencyKey, previewToken: string({ minLength: 32, maxLength: 2048 }) }, ["schemaVersion", "correlationId", "idempotencyKey", "previewToken"]),
  ImportCommitRequest: command({ previewToken: string({ minLength: 32, maxLength: 2048 }), diffHash: string({ pattern: "^[a-f0-9]{64}$" }) }, ["previewToken", "diffHash"]),
  ExportRequest: query({ format: { enum: ["json", "csv"] }, baselineId: string({ minLength: 1, maxLength: 128 }) }, ["format"]),
  ReuseAdoptRequest: command({ sourceId: requirementId, sourceExpectedVersion: expectedVersion, mode: { enum: ["governed-reference", "controlled-clone"] }, sourceRepository: string({ minLength: 1, maxLength: 256 }), sourceLibrary: string({ minLength: 1, maxLength: 256 }), applicability: object({}, [], { additionalProperties: true, maxProperties: 32 }), rationale: string({ minLength: 1, maxLength: 4000 }) }, ["sourceId", "sourceExpectedVersion", "mode", "sourceRepository", "applicability", "rationale"]),
  ReusePropagationPreviewRequest: command({ sourceId: requirementId, sourceExpectedVersion: expectedVersion, dispositions: array(object({ id: requirementId, action: { enum: ["accept", "retain-divergence"] }, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["id", "action", "rationale"]), { maxItems: 500 }) }, ["sourceId", "sourceExpectedVersion", "dispositions"]),
  ReusePropagationCommitRequest: command({ previewToken: string({ minLength: 32, maxLength: 2048 }), diffHash: string({ pattern: "^[a-f0-9]{64}$" }) }, ["previewToken", "diffHash"]),
  AiProposalRequest: command({ draft: requirementDraft, provider: string({ minLength: 1, maxLength: 128 }), service: string({ minLength: 1, maxLength: 128 }), model: string({ minLength: 1, maxLength: 128 }), runId: string({ minLength: 1, maxLength: 256 }), promptTemplateVersion: string({ minLength: 1, maxLength: 128 }), ruleVersion: string({ minLength: 1, maxLength: 128 }), sourceItems: array(sourceItemVersion, { maxItems: 500 }), rationale: string({ minLength: 1, maxLength: 4000 }), processor: { enum: ["internal", "external"] }, protectedFieldsIncluded: { type: "boolean" } }, ["draft", "provider", "service", "model", "runId", "promptTemplateVersion", "sourceItems", "rationale", "processor"]),
  AiProposalAcceptRequest: command({ id: requirementId, expectedVersion, proposedContentHash: string({ pattern: "^[a-f0-9]{64}$" }), acceptedPatch: patch, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["id", "expectedVersion", "proposedContentHash", "rationale"]),
  PossibleTransitionsRequest: query({ id: requirementId, expectedVersion, toStatus: string({ minLength: 1, maxLength: 64 }), evidenceReferences: array(evidenceReference, { maxItems: 128 }) }, ["id"]),
  TransitionRequest: command({
    id: requirementId,
    expectedVersion,
    expectedPolicyVersion: string({ minLength: 1, maxLength: 64 }),
    toStatus: string({ minLength: 1, maxLength: 64 }),
    rationale: string({ minLength: 1, maxLength: 4000 }),
    evidenceReferences: array(evidenceReference, { maxItems: 128 }),
    exception: transitionException,
  }, ["id", "expectedVersion", "expectedPolicyVersion", "toStatus", "rationale"]),
  DecisionRequest: command({
    id: string({ minLength: 1, maxLength: 128 }), expectedVersion,
    decision: { enum: ["approve", "reject", "waive", "abstain", "close"] },
    rationale: string({ minLength: 1, maxLength: 4000 }),
    exception: object({ rationale: string({ minLength: 1, maxLength: 4000 }), authority: string({ minLength: 1, maxLength: 256 }), expiresAt: string({ minLength: 20, maxLength: 32 }), reviewAt: string({ minLength: 20, maxLength: 32 }) }, ["rationale", "authority"]),
  }, ["id", "expectedVersion", "decision", "rationale"]),
  ChangeCreateRequest: command({
    title: string({ minLength: 1, maxLength: 200 }),
    rationale: string({ minLength: 1, maxLength: 4000 }),
    source: string({ minLength: 1, maxLength: 256 }),
    urgency: { enum: ["routine", "urgent", "emergency"] },
    accountableOwner: string({ minLength: 1, maxLength: 256 }),
    affectedRelease: string({ minLength: 1, maxLength: 160 }),
    affectedBaseline: string({ minLength: 1, maxLength: 128 }),
    affectedConfiguration: string({ minLength: 1, maxLength: 128 }),
    affectedVariant: string({ minLength: 1, maxLength: 160 }),
    affectedRequirementIds: array(requirementId, { maxItems: 500, uniqueItems: true }),
    proposedChanges: array(changeOperation, { minItems: 1, maxItems: 500 }),
  }, ["title", "rationale", "source", "accountableOwner"]),
  ChangeTriageRequest: command({ changeId, expectedVersion, accountableOwner: string({ minLength: 1, maxLength: 256 }), duplicateOf: changeId, issues: array(string({ minLength: 1, maxLength: 1000 }), { maxItems: 128 }) }, ["changeId", "expectedVersion", "accountableOwner"]),
  ChangeAnalyzeRequest: command({ changeId, expectedVersion, depth: integer({ minimum: 1, maximum: 20 }), nodeLimit: integer({ minimum: 1, maximum: 10000 }), manuallyAddedImpacts: array(impactKey, { maxItems: 1000 }), assessments: object({}, [], { additionalProperties: true, maxProperties: 32 }), acceptTruncation: { type: "boolean" }, truncationRationale: string({ minLength: 1, maxLength: 4000 }) }, ["changeId", "expectedVersion"]),
  ChangeDispositionImpactRequest: command({ changeId, expectedVersion, impact: impactKey, disposition: { enum: ["accepted", "mitigated", "not_affected", "deferred", "rejected"] }, owner: string({ minLength: 1, maxLength: 256 }), rationale: string({ minLength: 1, maxLength: 4000 }), evidenceReferences: array(evidenceReference, { maxItems: 128 }) }, ["changeId", "expectedVersion", "impact", "disposition", "owner", "rationale"]),
  ChangeDecisionRequest: command({ changeId, expectedVersion, decision: { enum: ["approve", "reject", "defer"] }, authority: string({ minLength: 1, maxLength: 256 }), rationale: string({ minLength: 1, maxLength: 4000 }), conditions: array(string({ minLength: 1, maxLength: 1000 }), { maxItems: 128 }) }, ["changeId", "expectedVersion", "decision", "authority", "rationale"]),
  ChangePreviewImplementationRequest: command({ changeId, expectedVersion }, ["changeId", "expectedVersion"]),
  ChangeCommitImplementationRequest: object({ schemaVersion: { const: "1.0.0" }, correlationId, idempotencyKey, previewToken: string({ minLength: 32, maxLength: 2048 }) }, ["schemaVersion", "correlationId", "idempotencyKey", "previewToken"]),
  ChangeCloseRequest: command({ changeId, expectedVersion, authority: string({ minLength: 1, maxLength: 256 }), rationale: string({ minLength: 1, maxLength: 4000 }), evidenceReferences: array(evidenceReference, { maxItems: 256 }), residualExceptions: array(transitionException, { maxItems: 64 }) }, ["changeId", "expectedVersion", "authority", "rationale", "evidenceReferences"]),
  ChangeGetRequest: query({ changeId }, ["changeId"]),
  WorkflowDashboardRequest: query({ owner: string({ minLength: 1, maxLength: 256 }), includeClosed: { type: "boolean" } }),
  ReviewCreateRequest: command({
    title: string({ minLength: 1, maxLength: 200 }), requirementIds: array(requirementId, { minItems: 1, maxItems: 500, uniqueItems: true }),
    relationshipIds: array(relationshipId, { maxItems: 1000, uniqueItems: true }), reviewType: { enum: ["informal", "formal"] },
    purpose: string({ minLength: 1, maxLength: 4000 }), participants: array(string({ minLength: 1, maxLength: 256 }), { maxItems: 128, uniqueItems: true }),
    scope: object({}, [], { additionalProperties: true, maxProperties: 32 }),
  }, ["title", "requirementIds", "reviewType", "purpose"]),
  ReviewGetRequest: query({ reviewId }, ["reviewId"]),
  ReviewFindingRequest: command({
    reviewId, expectedVersion, severity: { enum: ["info", "minor", "major", "blocking"] },
    summary: string({ minLength: 1, maxLength: 1000 }), comment: string({ minLength: 1, maxLength: 4000 }),
    requirementId, relationshipId,
    origin: { enum: ["human", "ai", "imported"] }, author: string({ minLength: 1, maxLength: 256 }),
    aiProvenance: object({ provider: string({ minLength: 1, maxLength: 128 }), service: string({ minLength: 1, maxLength: 128 }), model: string({ minLength: 1, maxLength: 128 }), suggestionId: string({ minLength: 1, maxLength: 256 }), runId: string({ minLength: 1, maxLength: 256 }), promptTemplateVersion: string({ minLength: 1, maxLength: 128 }), ruleVersion: string({ minLength: 1, maxLength: 128 }), rationale: string({ minLength: 1, maxLength: 4000 }) }, ["provider", "model", "suggestionId"]),
  }, ["reviewId", "expectedVersion", "severity", "summary", "origin", "author"]),
  ReviewFindingDispositionRequest: command({
    reviewId, findingId, expectedVersion, disposition: { enum: ["accepted", "resolved", "rejected", "deferred", "waived"] },
    rationale: string({ minLength: 1, maxLength: 4000 }), evidenceReferences: array(evidenceReference, { maxItems: 128 }),
  }, ["reviewId", "findingId", "expectedVersion", "disposition", "rationale"]),
  ReviewReopenRequest: command({ reviewId, expectedVersion, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["reviewId", "expectedVersion", "rationale"]),
  VerificationPlanRecordRequest: command({
    requirementId, requirementVersion: expectedVersion,
    methods: array({ enum: ["test", "demonstration", "inspection", "analysis"] }, { minItems: 1, maxItems: 4, uniqueItems: true }),
    acceptanceCriteria: array(object({ parameter: string({ minLength: 1, maxLength: 256 }), measurementMethod: string({ minLength: 1, maxLength: 1000 }), threshold: string({ minLength: 1, maxLength: 1000 }), conditions: string({ minLength: 1, maxLength: 2000 }) }, ["parameter", "measurementMethod", "threshold", "conditions"]), { minItems: 1, maxItems: 128 }),
    procedure: object({ id: string({ minLength: 1, maxLength: 256 }), version: string({ minLength: 1, maxLength: 128 }), uri: string({ minLength: 1, maxLength: 2048 }) }, ["id", "version"]),
    owner: string({ minLength: 1, maxLength: 256 }), environment: string({ minLength: 1, maxLength: 256 }), configuration: string({ minLength: 1, maxLength: 256 }), dataset: string({ minLength: 1, maxLength: 256 }), equipment: string({ minLength: 1, maxLength: 256 }), release: string({ minLength: 1, maxLength: 160 }), variant: string({ minLength: 1, maxLength: 160 }), rationale: string({ minLength: 1, maxLength: 4000 }),
  }, ["requirementId", "requirementVersion", "methods", "acceptanceCriteria", "procedure", "owner", "configuration"]),
  VerificationEvidenceRecordRequest: command({
    evidenceId: verificationEvidenceId, externalId: string({ minLength: 1, maxLength: 256 }), externalVersion: string({ minLength: 1, maxLength: 128 }),
    requirementVersions: array(object({ id: requirementId, version: expectedVersion }, ["id", "version"]), { minItems: 1, maxItems: 500 }),
    planId: verificationPlanId, relationshipId, caseId: string({ minLength: 1, maxLength: 256 }), caseVersion: string({ minLength: 1, maxLength: 128 }),
    environment: string({ minLength: 1, maxLength: 256 }), configuration: string({ minLength: 1, maxLength: 256 }), dataset: string({ minLength: 1, maxLength: 256 }), executor: string({ minLength: 1, maxLength: 256 }), executedAt: string({ minLength: 20, maxLength: 32 }), release: string({ minLength: 1, maxLength: 160 }), variant: string({ minLength: 1, maxLength: 160 }),
    expectedResult: string({ minLength: 1, maxLength: 4000 }), actualResult: string({ minLength: 1, maxLength: 4000 }),
    status: { enum: ["not_run", "passed", "failed", "blocked", "waived", "not_applicable", "superseded"] },
    artifactUri: string({ minLength: 1, maxLength: 2048 }), artifactChecksum: string({ pattern: "^[a-f0-9]{64}$" }), sourceSystem: string({ minLength: 1, maxLength: 128 }),
    defectReferences: array(string({ minLength: 1, maxLength: 256 }), { maxItems: 128, uniqueItems: true }), disposition: string({ minLength: 1, maxLength: 4000 }), rationale: string({ minLength: 1, maxLength: 4000 }), authority: string({ minLength: 1, maxLength: 256 }),
    origin: { enum: ["human", "ai", "imported", "integration"] },
    aiProvenance: object({ provider: string({ minLength: 1, maxLength: 128 }), service: string({ minLength: 1, maxLength: 128 }), model: string({ minLength: 1, maxLength: 128 }), runId: string({ minLength: 1, maxLength: 256 }), promptTemplateVersion: string({ minLength: 1, maxLength: 128 }), ruleVersion: string({ minLength: 1, maxLength: 128 }), rationale: string({ minLength: 1, maxLength: 4000 }) }, ["provider", "model", "runId"]),
    acceptanceDecision: { enum: ["accept", "record-only"] },
  }, ["externalId", "externalVersion", "requirementVersions", "caseId", "caseVersion", "environment", "configuration", "executor", "executedAt", "expectedResult", "actualResult", "status", "artifactUri", "artifactChecksum", "sourceSystem", "origin", "acceptanceDecision"]),
  VerificationStatusRequest: query({ requirementIds: array(requirementId, { maxItems: 500, uniqueItems: true }), baselineId: string({ minLength: 1, maxLength: 128 }), release: string({ minLength: 1, maxLength: 160 }), variant: string({ minLength: 1, maxLength: 160 }), configuration: string({ minLength: 1, maxLength: 256 }) }),
  MetricsDashboardRequest: query({ groupBy: { enum: ["type", "level", "owner", "priority", "criticality", "release", "status", "verification-status"] }, requirementIds: array(requirementId, { maxItems: 500, uniqueItems: true }), baselineId: string({ minLength: 1, maxLength: 128 }) }, ["groupBy"]),
  BaselineReadinessRequest: query({ requirementIds: array(requirementId, { minItems: 1, maxItems: 500, uniqueItems: true }), scope: object({}, [], { additionalProperties: true, maxProperties: 32 }), exclusions: array(string({ minLength: 1, maxLength: 512 }), { maxItems: 128 }), exceptions: array(baselineException, { maxItems: 128 }) }, ["requirementIds"]),
  BaselineCreateRequest: command({ name: string({ minLength: 1, maxLength: 200 }), requirementIds: array(requirementId, { minItems: 1, maxItems: 500, uniqueItems: true }), rationale: string({ minLength: 1, maxLength: 4000 }), purpose: string({ minLength: 1, maxLength: 4000 }), readinessToken: string({ minLength: 32, maxLength: 4096 }), approvalReferences: array({}, { minItems: 1, maxItems: 128 }), exclusions: array(string({ minLength: 1, maxLength: 512 }), { maxItems: 128 }), project: string({ minLength: 1, maxLength: 256 }), release: string({ minLength: 1, maxLength: 160 }), variant: string({ minLength: 1, maxLength: 160 }), configuration: object({}, [], { additionalProperties: true, maxProperties: 64 }), sourceRepositoryRevision: string({ minLength: 1, maxLength: 256 }), reportTemplateVersions: array(string({ minLength: 1, maxLength: 64 }), { maxItems: 32, uniqueItems: true }) }, ["name", "requirementIds", "readinessToken", "approvalReferences"]),
  BaselineGetRequest: query({ baselineId: string({ minLength: 1, maxLength: 128 }), projection }, ["baselineId"]),
  BaselineListRequest: query({ limit: integer({ minimum: 1, maximum: 100 }), cursor: opaqueCursor }),
  AuditListRequest: query({ limit: integer({ minimum: 1, maximum: 100 }), cursor: opaqueCursor }),
  AuditVerifyRequest: query({}),
  ImportPreviewRequest: command({ format: { enum: ["json", "csv", "reqif"] }, content: string({ minLength: 1, maxLength: 5000000 }), mappingVersion: string({ minLength: 1, maxLength: 64 }) }, ["format", "content", "mappingVersion"]),
  ConfigurationGetRequest: query({ configurationVersion: string({ minLength: 1, maxLength: 64 }) }),
  ConfigurationUpdateRequest: command({ currentConfigurationVersion: string({ minLength: 1, maxLength: 64 }), policy: POLICY_BODY_SCHEMA, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["currentConfigurationVersion", "policy", "rationale"]),
  OperationResponse: object({
    schemaVersion: { const: "1.0.0" },
    repositoryRevision: integer({ minimum: 0 }),
    correlationId,
    data: {},
    page: object({ returnedCount: integer({ minimum: 0 }), truncated: { type: "boolean" }, nextCursor: opaqueCursor }, ["returnedCount", "truncated"]),
    source: object({ kind: { enum: ["current", "baseline", "version"] }, baselineId: string({ minLength: 1, maxLength: 128 }), itemVersion: integer({ minimum: 1 }), repositoryRevision: integer({ minimum: 0 }) }, ["kind", "repositoryRevision"]),
  }, ["schemaVersion", "repositoryRevision", "correlationId", "data"]),
  ErrorResponse: object({
    schemaVersion: { const: "1.0.0" },
    correlationId,
    error: object({
      code: { enum: ERROR_CODES },
      message: string({ minLength: 1, maxLength: 1000 }),
      retryable: { type: "boolean" },
      details: array(object({ path: string({ maxLength: 512 }), reason: string({ maxLength: 1000 }) }, ["reason"]), { maxItems: 100 }),
      current: object({ repositoryRevision: integer({ minimum: 0 }), itemVersion: integer({ minimum: 1 }) }),
    }, ["code", "message", "retryable", "details"]),
  }, ["schemaVersion", "correlationId", "error"]),
});

export const API_VERSION = "1.0.0";
export const TOOL_DEFINITIONS = TOOL_CATALOG.map((tool) => ({
  ...tool,
  inputSchema: SCHEMAS[tool.input],
  outputSchema: SCHEMAS[tool.output],
}));
