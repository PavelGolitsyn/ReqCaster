import { MAX_IDENTIFIER_NUMBER, parseRelationshipId, parseRequirementId } from "../../domain/identifiers.js";
import { ValidationError } from "./errors.js";

export const CURRENT_SCHEMA_VERSION = "1.0.0";
export const DOCUMENT_LIMITS = Object.freeze({
  maximumBytes: 5_000_000,
  requirements: 100_000,
  relationships: 200_000,
  acceptanceCriteria: 128,
  references: 128,
  verificationMethods: 32,
  string: 10_000,
  customDepth: 5,
  customProperties: 64,
  customArray: 64,
  customString: 4_000,
});

const envelopeFields = new Set(["$schema", "schemaVersion", "documentType", "repositoryRevision", "nextRequirementNumber", "nextRelationshipNumber", "requirements", "relationships"]);
const requirementFields = new Set(["id", "level", "version", "statement", "shortLabel", "category", "status", "priority", "criticality", "owner", "rationale", "verificationMethods", "acceptanceCriteria", "sourceReferences", "provenance", "retirement", "customAttributes"]);
const relationshipFields = new Set(["id", "version", "type", "source", "target", "suspect", "rationale", "provenance", "retirement", "customAttributes"]);
const endpointFields = new Set(["kind", "id", "version"]);
const acceptanceFields = new Set(["id", "text", "verificationMethod"]);
const referenceFields = new Set(["type", "uri", "title"]);
const provenanceFields = new Set(["createdAt", "createdBy", "updatedAt", "updatedBy", "source"]);
const retirementFields = new Set(["retiredAt", "retiredBy", "rationale"]);
const externalKinds = new Set(["external:test", "external:component"]);

function issue(issues, path, reason) {
  issues.push({ path, reason });
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value, allowed, path, issues) {
  if (!object(value)) { issue(issues, path, "must be an object"); return false; }
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}/${key}`, "is not allowed");
  return true;
}

function required(value, fields, path, issues) {
  for (const field of fields) if (!(field in value)) issue(issues, `${path}/${field}`, "is required");
}

function boundedString(value, path, issues, maximum = DOCUMENT_LIMITS.string, minimum = 1) {
  if (typeof value !== "string") issue(issues, path, "must be a string");
  else if (value.length < minimum || value.length > maximum) issue(issues, path, `must contain ${minimum}..${maximum} characters`);
  else if (value !== value.normalize("NFC")) issue(issues, path, "must be NFC-normalized");
}

function timestamp(value, path, issues) {
  boundedString(value, path, issues, 24);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    issue(issues, path, "must be a canonical UTC timestamp with milliseconds");
  }
}

function positiveVersion(value, path, issues) {
  if (!Number.isInteger(value) || value < 1) issue(issues, path, "must be a positive integer");
}

function custom(value, path, issues, depth = 0) {
  if (depth > DOCUMENT_LIMITS.customDepth) { issue(issues, path, `exceeds custom attribute depth ${DOCUMENT_LIMITS.customDepth}`); return; }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) issue(issues, path, "must be a finite JSON number other than negative zero");
    return;
  }
  if (typeof value === "string") { boundedString(value, path, issues, DOCUMENT_LIMITS.customString, 0); return; }
  if (Array.isArray(value)) {
    if (value.length > DOCUMENT_LIMITS.customArray) issue(issues, path, `must contain at most ${DOCUMENT_LIMITS.customArray} items`);
    value.forEach((item, index) => custom(item, `${path}/${index}`, issues, depth + 1));
    return;
  }
  if (!object(value)) { issue(issues, path, "must contain only JSON values"); return; }
  const keys = Object.keys(value);
  if (keys.length > DOCUMENT_LIMITS.customProperties) issue(issues, path, `must contain at most ${DOCUMENT_LIMITS.customProperties} properties`);
  for (const key of keys) {
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(key)) issue(issues, `${path}/${key}`, "extension key is invalid");
    custom(value[key], `${path}/${key}`, issues, depth + 1);
  }
}

function provenance(value, path, issues) {
  if (!exactFields(value, provenanceFields, path, issues)) return;
  required(value, ["createdAt", "createdBy", "updatedAt", "updatedBy"], path, issues);
  for (const name of ["createdAt", "updatedAt"]) if (name in value) timestamp(value[name], `${path}/${name}`, issues);
  for (const name of ["createdBy", "updatedBy", "source"]) if (name in value) boundedString(value[name], `${path}/${name}`, issues, 256);
  if (typeof value.createdAt === "string" && typeof value.updatedAt === "string" && value.updatedAt < value.createdAt) issue(issues, `${path}/updatedAt`, "must not precede createdAt");
}

function retirement(value, path, issues) {
  if (!exactFields(value, retirementFields, path, issues)) return;
  required(value, ["retiredAt", "retiredBy", "rationale"], path, issues);
  if ("retiredAt" in value) timestamp(value.retiredAt, `${path}/retiredAt`, issues);
  for (const name of ["retiredBy", "rationale"]) if (name in value) boundedString(value[name], `${path}/${name}`, issues, name === "rationale" ? 4000 : 256);
}

function validateRequirement(record, level, path, policy, issues) {
  if (!exactFields(record, requirementFields, path, issues)) return;
  required(record, ["id", "level", "version", "statement", "category", "status"], path, issues);
  const parsed = parseRequirementId(record.id);
  if (!parsed) issue(issues, `${path}/id`, "must be a canonical requirement ID without a title");
  else if (parsed.level !== level) issue(issues, `${path}/id`, `must use the ${level === "business" ? "BR" : "SR"} prefix`);
  if (record.level !== level) issue(issues, `${path}/level`, `must equal document placement ${level}`);
  positiveVersion(record.version, `${path}/version`, issues);
  boundedString(record.statement, `${path}/statement`, issues);
  for (const [name, maximum] of [["shortLabel", 160], ["category", 64], ["status", 64], ["priority", 64], ["criticality", 64], ["owner", 256], ["rationale", 4000]]) {
    if (name in record) boundedString(record[name], `${path}/${name}`, issues, maximum);
  }
  const vocabularies = [["category", "categories"], ["status", "statuses"], ["priority", "priorities"], ["criticality", "criticalities"]];
  for (const [field, vocabulary] of vocabularies) if (field in record && !policy.requirements[vocabulary].includes(record[field])) issue(issues, `${path}/${field}`, "is not in configured vocabulary");
  if ("verificationMethods" in record) {
    if (!Array.isArray(record.verificationMethods) || record.verificationMethods.length > DOCUMENT_LIMITS.verificationMethods) issue(issues, `${path}/verificationMethods`, "must be a bounded array");
    else {
      if (new Set(record.verificationMethods).size !== record.verificationMethods.length) issue(issues, `${path}/verificationMethods`, "must contain unique values");
      record.verificationMethods.forEach((method, index) => {
        if (!policy.requirements.verificationMethods.includes(method)) issue(issues, `${path}/verificationMethods/${index}`, "is not in configured vocabulary");
      });
    }
  }
  if ("acceptanceCriteria" in record) {
    if (!Array.isArray(record.acceptanceCriteria) || record.acceptanceCriteria.length > DOCUMENT_LIMITS.acceptanceCriteria) issue(issues, `${path}/acceptanceCriteria`, "must be a bounded array");
    else {
      const criterionIds = new Set();
      record.acceptanceCriteria.forEach((criterion, index) => {
        const child = `${path}/acceptanceCriteria/${index}`;
        if (!exactFields(criterion, acceptanceFields, child, issues)) return;
        required(criterion, ["id", "text"], child, issues);
        if ("id" in criterion) {
          boundedString(criterion.id, `${child}/id`, issues, 64);
          if (criterionIds.has(criterion.id)) issue(issues, `${child}/id`, "must be unique within the requirement");
          criterionIds.add(criterion.id);
        }
        if ("text" in criterion) boundedString(criterion.text, `${child}/text`, issues, 2000);
        if ("verificationMethod" in criterion && !policy.requirements.verificationMethods.includes(criterion.verificationMethod)) issue(issues, `${child}/verificationMethod`, "is not in configured vocabulary");
      });
    }
  }
  if ("sourceReferences" in record) {
    if (!Array.isArray(record.sourceReferences) || record.sourceReferences.length > DOCUMENT_LIMITS.references) issue(issues, `${path}/sourceReferences`, "must be a bounded array");
    else record.sourceReferences.forEach((reference, index) => {
      const child = `${path}/sourceReferences/${index}`;
      if (!exactFields(reference, referenceFields, child, issues)) return;
      required(reference, ["type", "uri"], child, issues);
      for (const [field, maximum] of [["type", 64], ["uri", 2048], ["title", 256]]) if (field in reference) boundedString(reference[field], `${child}/${field}`, issues, maximum);
    });
  }
  if ("provenance" in record) provenance(record.provenance, `${path}/provenance`, issues);
  if (record.status === "retired" && !("retirement" in record)) issue(issues, `${path}/retirement`, "is required for retired requirements");
  if (record.status !== "retired" && "retirement" in record) issue(issues, `${path}/retirement`, "is allowed only for retired requirements");
  if ("retirement" in record) retirement(record.retirement, `${path}/retirement`, issues);
  if ("customAttributes" in record) custom(record.customAttributes, `${path}/customAttributes`, issues);
  for (const rule of policy.requiredMetadata.filter((candidate) => candidate.level === level && candidate.status === record.status)) {
    for (const field of rule.fields) {
      const value = record[field];
      if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) issue(issues, `${path}/${field}`, "is required by configured metadata policy");
    }
  }
}

function validateEndpoint(endpoint, path, issues) {
  if (!exactFields(endpoint, endpointFields, path, issues)) return;
  required(endpoint, ["kind", "id"], path, issues);
  if (endpoint.kind === "requirement") {
    if (!parseRequirementId(endpoint.id)) issue(issues, `${path}/id`, "must be a canonical requirement ID");
    if ("version" in endpoint) positiveVersion(endpoint.version, `${path}/version`, issues);
  } else if (externalKinds.has(endpoint.kind)) {
    boundedString(endpoint.id, `${path}/id`, issues, 256);
    if ("version" in endpoint) issue(issues, `${path}/version`, "is allowed only for requirement endpoints");
  } else issue(issues, `${path}/kind`, "must be requirement, external:test, or external:component");
}

function validateRelationship(record, path, policy, issues) {
  if (!exactFields(record, relationshipFields, path, issues)) return;
  required(record, ["id", "version", "type", "source", "target", "suspect"], path, issues);
  if (!parseRelationshipId(record.id)) issue(issues, `${path}/id`, "must match RL-000001 through RL-999999");
  positiveVersion(record.version, `${path}/version`, issues);
  boundedString(record.type, `${path}/type`, issues, 64);
  if (typeof record.suspect !== "boolean") issue(issues, `${path}/suspect`, "must be a boolean");
  validateEndpoint(record.source, `${path}/source`, issues);
  validateEndpoint(record.target, `${path}/target`, issues);
  if ("rationale" in record) boundedString(record.rationale, `${path}/rationale`, issues, 4000);
  if ("provenance" in record) provenance(record.provenance, `${path}/provenance`, issues);
  if ("retirement" in record) retirement(record.retirement, `${path}/retirement`, issues);
  if ("customAttributes" in record) custom(record.customAttributes, `${path}/customAttributes`, issues);
  const rule = policy.relationships.find(({ type }) => type === record.type);
  if (!rule) issue(issues, `${path}/type`, "is not a configured relationship type");
  else {
    const kind = (endpoint) => endpoint?.kind === "requirement" ? parseRequirementId(endpoint.id)?.level : endpoint?.kind;
    if (!rule.sourceKinds.includes(kind(record.source))) issue(issues, `${path}/source`, "kind is not allowed by the trace model");
    if (!rule.targetKinds.includes(kind(record.target))) issue(issues, `${path}/target`, "kind is not allowed by the trace model");
  }
}

function validateEnvelope(document, level, policy, issues) {
  const path = `/${level}`;
  if (!exactFields(document, envelopeFields, path, issues)) return;
  required(document, [...envelopeFields], path, issues);
  if (document.$schema !== `.engine/schemas/v1/${level}-requirements.schema.json`) issue(issues, `${path}/$schema`, "does not name the canonical versioned schema");
  if (document.schemaVersion !== CURRENT_SCHEMA_VERSION) issue(issues, `${path}/schemaVersion`, `must equal ${CURRENT_SCHEMA_VERSION}`);
  if (document.documentType !== level) issue(issues, `${path}/documentType`, `must equal ${level}`);
  if (!Number.isInteger(document.repositoryRevision) || document.repositoryRevision < 0) issue(issues, `${path}/repositoryRevision`, "must be a non-negative integer");
  for (const field of ["nextRequirementNumber", "nextRelationshipNumber"]) if (!Number.isInteger(document[field]) || document[field] < 1 || document[field] > MAX_IDENTIFIER_NUMBER + 1) issue(issues, `${path}/${field}`, `must be between 1 and ${MAX_IDENTIFIER_NUMBER + 1}`);
  if (!Array.isArray(document.requirements) || document.requirements.length > DOCUMENT_LIMITS.requirements) issue(issues, `${path}/requirements`, "must be a bounded array");
  else document.requirements.forEach((record, index) => validateRequirement(record, level, `${path}/requirements/${index}`, policy, issues));
  if (!Array.isArray(document.relationships) || document.relationships.length > DOCUMENT_LIMITS.relationships) issue(issues, `${path}/relationships`, "must be a bounded array");
  else document.relationships.forEach((record, index) => validateRelationship(record, `${path}/relationships/${index}`, policy, issues));
}

export function validateRepositoryDocuments(business, software, policy) {
  const issues = [];
  validateEnvelope(business, "business", policy, issues);
  validateEnvelope(software, "software", policy, issues);
  if (business?.repositoryRevision !== software?.repositoryRevision) issue(issues, "/repositoryRevision", "canonical documents must represent one committed revision");
  if (business?.nextRelationshipNumber !== software?.nextRelationshipNumber) issue(issues, "/nextRelationshipNumber", "relationship allocators must agree");

  const requirements = new Map();
  for (const [level, document] of [["business", business], ["software", software]]) {
    for (const [index, record] of (document?.requirements ?? []).entries()) {
      if (!object(record)) continue;
      if (requirements.has(record.id)) issue(issues, `/${level}/requirements/${index}/id`, "is duplicated across canonical documents");
      else requirements.set(record.id, record);
      const parsed = parseRequirementId(record.id);
      if (parsed && Number.isInteger(document.nextRequirementNumber) && parsed.number >= document.nextRequirementNumber) issue(issues, `/${level}/nextRequirementNumber`, "must be greater than every allocated requirement number");
    }
  }

  const relationships = new Map();
  const cardinality = new Map();
  for (const [level, document] of [["business", business], ["software", software]]) {
    for (const [index, record] of (document?.relationships ?? []).entries()) {
      if (!object(record)) continue;
      const path = `/${level}/relationships/${index}`;
      if (relationships.has(record.id)) issue(issues, `${path}/id`, "is duplicated across canonical documents");
      else relationships.set(record.id, record);
      const parsed = parseRelationshipId(record.id);
      if (parsed && parsed.number >= document.nextRelationshipNumber) issue(issues, `/${level}/nextRelationshipNumber`, "must be greater than every allocated relationship number");
      for (const endpointName of ["source", "target"]) {
        const endpoint = record[endpointName];
        if (endpoint?.kind !== "requirement" || !parseRequirementId(endpoint.id)) continue;
        const target = requirements.get(endpoint.id);
        if (!target) issue(issues, `${path}/${endpointName}/id`, "refers to a missing requirement");
        else if (endpoint.version !== undefined && endpoint.version > target.version) issue(issues, `${path}/${endpointName}/version`, "refers to an unknown requirement version");
      }
      const placementId = record.source?.kind === "requirement" ? record.source.id : record.target?.kind === "requirement" ? record.target.id : null;
      const placement = parseRequirementId(placementId)?.level;
      if (placement && placement !== level) issue(issues, path, `must be stored in the ${placement} document`);
      const key = `${record.type}\u0000${record.source?.kind}\u0000${record.source?.id}`;
      cardinality.set(key, (cardinality.get(key) ?? 0) + 1);
      const maximum = policy.relationships.find(({ type }) => type === record.type)?.maxTargets;
      if (maximum && cardinality.get(key) > maximum) issue(issues, path, `exceeds configured maxTargets ${maximum}`);
    }
  }
  return issues;
}

export function assertValidRepositoryDocuments(business, software, policy) {
  const issues = validateRepositoryDocuments(business, software, policy);
  if (issues.length) throw new ValidationError(issues);
  return { business, software };
}

export function createEmptyDocument(level) {
  if (level !== "business" && level !== "software") throw new TypeError("Unknown canonical document level");
  return {
    $schema: `.engine/schemas/v1/${level}-requirements.schema.json`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    documentType: level,
    repositoryRevision: 0,
    nextRequirementNumber: 1,
    nextRelationshipNumber: 1,
    requirements: [],
    relationships: [],
  };
}
