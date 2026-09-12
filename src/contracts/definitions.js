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
  allocation: array(string({ minLength: 1, maxLength: 160 }), { maxItems: 64, uniqueItems: true }),
  acceptanceCriteria: array(string({ minLength: 1, maxLength: 2000 }), { maxItems: 128 }),
}, ["level", "statement", "category"]);

export const POLICY_BODY_SCHEMA = object({
  requirements: object({
    categories: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
    statuses: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 64, uniqueItems: true }),
    priorities: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    criticalities: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    verificationMethods: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
  }, ["categories", "statuses", "priorities", "criticalities", "verificationMethods"]),
  transitions: array(object({
    from: string({ minLength: 1, maxLength: 64 }),
    to: string({ minLength: 1, maxLength: 64 }),
    permission: string({ minLength: 1, maxLength: 128 }),
  }, ["from", "to", "permission"]), { maxItems: 256 }),
  relationships: array(object({
    type: string({ minLength: 1, maxLength: 64 }),
    direction: { const: "source-to-target" },
    sourceKinds: array(string({ maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    targetKinds: array(string({ maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
    maxTargets: integer({ minimum: 1 }),
    suspectOn: array(string({ maxLength: 64 }), { maxItems: 16, uniqueItems: true }),
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
  authorizedDecisionTypes: array(string({ minLength: 1, maxLength: 64 }), { minItems: 1, maxItems: 32, uniqueItems: true }),
  limits: object({
    searchDefault: integer({ minimum: 1 }),
    searchMaximum: integer({ minimum: 1 }),
    graphDepthMaximum: integer({ minimum: 1 }),
    graphNodeMaximum: integer({ minimum: 1 }),
    bulkMaximum: integer({ minimum: 1 }),
    timeoutMilliseconds: integer({ minimum: 1 }),
  }, ["searchDefault", "searchMaximum", "graphDepthMaximum", "graphNodeMaximum", "bulkMaximum", "timeoutMilliseconds"]),
  qualityRules: object({
    structuralValidation: { const: "blocking" },
    languageQuality: { const: "advisory" },
    advisorySeverities: array({ enum: ["info", "warning"] }, { minItems: 1, maxItems: 2, uniqueItems: true }),
  }, ["structuralValidation", "languageQuality", "advisorySeverities"]),
}, ["requirements", "transitions", "relationships", "requiredMetadata", "coverageRules", "baselineReadiness", "authorizedDecisionTypes", "limits", "qualityRules"]);

export const POLICY_DOCUMENT_SCHEMA = object({
  $schema: string({ minLength: 1, maxLength: 512 }),
  schemaVersion: { const: "1.0.0" },
  configurationVersion: string({ pattern: "^[1-9][0-9]*$" }),
  ...POLICY_BODY_SCHEMA.properties,
}, ["$schema", "schemaVersion", "configurationVersion", ...POLICY_BODY_SCHEMA.required]);

export const SCHEMAS = Object.freeze({
  GetRequest: query({ id: requirementId, baselineId: string({ minLength: 1, maxLength: 128 }), projection }, ["id"]),
  SearchRequest: query({
    query: string({ maxLength: 1000 }),
    filters: object({
      level: array({ enum: ["business", "software"] }, { maxItems: 2, uniqueItems: true }),
      status: array(string({ maxLength: 64 }), { maxItems: 32, uniqueItems: true }),
      allocation: array(string({ maxLength: 160 }), { maxItems: 64, uniqueItems: true }),
    }),
    projection,
    cursor: opaqueCursor,
    limit: integer({ minimum: 1, maximum: 100 }),
  }),
  ListRequest: query({ filters: object({ level: { enum: ["business", "software"] }, status: string({ maxLength: 64 }) }), projection, cursor: opaqueCursor, limit: integer({ minimum: 1, maximum: 100 }) }),
  TraceRequest: query({ id: requirementId, direction: { enum: ["upstream", "downstream", "both"] }, relationshipTypes: array(string({ maxLength: 64 }), { uniqueItems: true, maxItems: 32 }), depth: integer({ minimum: 1, maximum: 5 }), cursor: opaqueCursor }, ["id", "direction"]),
  CoverageRequest: query({ gap: { enum: ["missing", "stale", "failed", "waived", "not-applicable"] }, level: { enum: ["business", "software"] }, cursor: opaqueCursor, limit: integer({ minimum: 1, maximum: 100 }) }, ["gap"]),
  CompareRequest: query({ left: string({ minLength: 1, maxLength: 128 }), right: string({ minLength: 1, maxLength: 128 }), projection }, ["left", "right"]),
  HistoryRequest: query({ id: requirementId, cursor: opaqueCursor, limit: integer({ minimum: 1, maximum: 100 }) }, ["id"]),
  ReportRequest: query({ reportType: { enum: ["traceability", "coverage", "history", "readiness"] }, baselineId: string({ maxLength: 128 }), reportId: string({ maxLength: 128 }) }, ["reportType"]),
  ValidateDraftRequest: query({ draft: requirementDraft }, ["draft"]),
  CreateRequest: command({ draft: requirementDraft }, ["draft"]),
  UpdateRequest: command({ id: requirementId, expectedVersion, patch: object({ statement: string({ minLength: 1, maxLength: 10000 }), shortLabel: string({ minLength: 1, maxLength: 160 }), category: string({ maxLength: 64 }) }) }, ["id", "expectedVersion", "patch"]),
  VersionedItemCommand: command({ id: string({ minLength: 1, maxLength: 128 }), expectedVersion, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["id", "expectedVersion", "rationale"]),
  LinkRequest: command({ sourceId: requirementId, targetId: string({ minLength: 1, maxLength: 256 }), relationshipType: string({ minLength: 1, maxLength: 64 }), rationale: string({ minLength: 1, maxLength: 4000 }) }, ["sourceId", "targetId", "relationshipType", "rationale"]),
  BulkPreviewRequest: command({ operations: array(object({ operation: { enum: ["create", "update", "retire", "link", "unlink", "transition"] }, subjectId: string({ maxLength: 128 }) }, ["operation"]), { minItems: 1, maxItems: 500 }) }, ["operations"]),
  BulkCommitRequest: command({ previewToken: string({ minLength: 32, maxLength: 2048 }), diffHash: string({ pattern: "^[a-f0-9]{64}$" }) }, ["previewToken", "diffHash"]),
  TransitionRequest: command({ id: requirementId, expectedVersion, toStatus: string({ minLength: 1, maxLength: 64 }), rationale: string({ minLength: 1, maxLength: 4000 }) }, ["id", "expectedVersion", "toStatus", "rationale"]),
  DecisionRequest: command({ id: string({ minLength: 1, maxLength: 128 }), expectedVersion, decision: { enum: ["approve", "reject", "waive", "abstain", "close"] }, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["id", "expectedVersion", "decision", "rationale"]),
  ChangeCreateRequest: command({ title: string({ minLength: 1, maxLength: 200 }), rationale: string({ minLength: 1, maxLength: 4000 }), affectedRequirementIds: array(requirementId, { maxItems: 500, uniqueItems: true }) }, ["title", "rationale", "affectedRequirementIds"]),
  ReviewCreateRequest: command({ title: string({ minLength: 1, maxLength: 200 }), requirementIds: array(requirementId, { minItems: 1, maxItems: 500, uniqueItems: true }), reviewType: { enum: ["informal", "formal"] } }, ["title", "requirementIds", "reviewType"]),
  BaselineReadinessRequest: query({ requirementIds: array(requirementId, { minItems: 1, maxItems: 500, uniqueItems: true }) }, ["requirementIds"]),
  BaselineCreateRequest: command({ name: string({ minLength: 1, maxLength: 200 }), requirementIds: array(requirementId, { minItems: 1, maxItems: 500, uniqueItems: true }), rationale: string({ minLength: 1, maxLength: 4000 }) }, ["name", "requirementIds", "rationale"]),
  BaselineGetRequest: query({ baselineId: string({ minLength: 1, maxLength: 128 }), projection }, ["baselineId"]),
  ImportPreviewRequest: command({ format: { enum: ["json", "csv", "reqif"] }, content: string({ minLength: 1, maxLength: 5000000 }), mappingVersion: string({ minLength: 1, maxLength: 64 }) }, ["format", "content", "mappingVersion"]),
  ConfigurationGetRequest: query({ configurationVersion: string({ minLength: 1, maxLength: 64 }) }),
  ConfigurationUpdateRequest: command({ currentConfigurationVersion: string({ minLength: 1, maxLength: 64 }), policy: POLICY_BODY_SCHEMA, rationale: string({ minLength: 1, maxLength: 4000 }) }, ["currentConfigurationVersion", "policy", "rationale"]),
  OperationResponse: object({
    schemaVersion: { const: "1.0.0" },
    repositoryRevision: integer({ minimum: 0 }),
    correlationId,
    data: {},
    page: object({ returnedCount: integer({ minimum: 0 }), truncated: { type: "boolean" }, nextCursor: opaqueCursor }, ["returnedCount", "truncated"]),
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
