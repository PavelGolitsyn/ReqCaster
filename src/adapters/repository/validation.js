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
envelopeFields.add("changeControl");
envelopeFields.add("qualityControl");
const requirementFields = new Set(["id", "level", "version", "statement", "shortLabel", "category", "status", "priority", "criticality", "owner", "rationale", "verificationMethods", "acceptanceCriteria", "sourceReferences", "provenance", "retirement", "customAttributes", "lifecycleHistory"]);
const relationshipFields = new Set(["id", "version", "type", "source", "target", "status", "suspect", "rationale", "provenance", "retirement", "history", "customAttributes"]);
const endpointFields = new Set(["kind", "id", "version", "system", "artifactType", "externalId", "externalVersion", "uri", "systemOfRecord"]);
const relationshipHistoryFields = new Set(["action", "at", "by", "status", "assessment", "rationale", "triggeringItemVersion", "changedFields", "rule", "reason"]);
const acceptanceFields = new Set(["id", "text", "verificationMethod"]);
const referenceFields = new Set(["type", "uri", "title"]);
const provenanceFields = new Set(["createdAt", "createdBy", "updatedAt", "updatedBy", "source", "accountablePrincipal", "aiAssistance"]);
const assistanceFields = new Set(["assisted", "provider", "model", "suggestionId"]);
const retirementFields = new Set(["retiredAt", "retiredBy", "rationale", "decisionReference"]);
const relationshipStatuses = new Set(["valid", "suspect", "invalid", "waived"]);
const changeStatuses = new Set(["draft", "triaged", "analyzing", "ready_for_decision", "approved", "rejected", "deferred", "implementing", "verifying", "closed", "cancelled"]);

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

function boundedJson(value, path, issues, depth = 0) {
  if (depth > 12) { issue(issues, path, "exceeds governed record depth 12"); return; }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) issue(issues, path, "must be a finite JSON number other than negative zero");
    return;
  }
  if (typeof value === "string") { boundedString(value, path, issues, 20_000, 0); return; }
  if (Array.isArray(value)) {
    if (value.length > 10_000) issue(issues, path, "must contain at most 10000 items");
    value.forEach((entry, index) => boundedJson(entry, `${path}/${index}`, issues, depth + 1));
    return;
  }
  if (!object(value)) { issue(issues, path, "must contain only JSON values"); return; }
  if (Object.keys(value).length > 256) issue(issues, path, "must contain at most 256 properties");
  for (const [key, entry] of Object.entries(value)) {
    if (key.length < 1 || key.length > 128) issue(issues, `${path}/${key}`, "property name must contain 1..128 characters");
    boundedJson(entry, `${path}/${key}`, issues, depth + 1);
  }
}

function validateLifecycleHistory(entries, path, issues) {
  if (!Array.isArray(entries) || entries.length > 4096) { issue(issues, path, "must be a bounded array"); return; }
  entries.forEach((entry, index) => {
    const child = `${path}/${index}`;
    if (!object(entry)) { issue(issues, child, "must be an object"); return; }
    for (const field of ["action", "at", "by", "accountablePrincipal", "from", "to", "reason", "policyVersion"]) {
      if (!(field in entry)) issue(issues, `${child}/${field}`, "is required");
      else if (field === "at") timestamp(entry[field], `${child}/${field}`, issues);
      else boundedString(entry[field], `${child}/${field}`, issues, field === "reason" ? 4000 : 256);
    }
    boundedJson(entry, child, issues);
  });
}

function validateChangeControl(value, path, issues) {
  if (!object(value)) { issue(issues, path, "must be an object"); return; }
  const allowed = new Set(["schemaVersion", "nextChangeNumber", "nextOutboxNumber", "changes", "outbox", "baselineMemberships"]);
  for (const field of Object.keys(value)) if (!allowed.has(field)) issue(issues, `${path}/${field}`, "is not allowed");
  required(value, ["schemaVersion", "nextChangeNumber", "nextOutboxNumber", "changes", "outbox", "baselineMemberships"], path, issues);
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) issue(issues, `${path}/schemaVersion`, `must equal ${CURRENT_SCHEMA_VERSION}`);
  for (const field of ["nextChangeNumber", "nextOutboxNumber"]) positiveVersion(value[field], `${path}/${field}`, issues);
  if (!Array.isArray(value.changes) || value.changes.length > 100_000) issue(issues, `${path}/changes`, "must be a bounded array");
  else value.changes.forEach((change, index) => {
    const child = `${path}/changes/${index}`;
    if (!object(change)) { issue(issues, child, "must be an object"); return; }
    required(change, ["id", "version", "status", "title", "rationale", "source", "initiator", "accountableOwner", "createdAt", "updatedAt", "history", "proposedChanges", "impacts"], child, issues);
    if (!/^CH-(?!000000)[0-9]{6}$/u.test(change.id ?? "")) issue(issues, `${child}/id`, "must be a canonical change ID");
    positiveVersion(change.version, `${child}/version`, issues);
    if (!changeStatuses.has(change.status)) issue(issues, `${child}/status`, "is not a governed change status");
    for (const field of ["title", "rationale", "initiator", "accountableOwner"]) if (field in change) boundedString(change[field], `${child}/${field}`, issues, field === "rationale" ? 4000 : 256);
    for (const field of ["createdAt", "updatedAt"]) if (field in change) timestamp(change[field], `${child}/${field}`, issues);
    if (!Array.isArray(change.history) || change.history.length < 1 || change.history.length > 4096) issue(issues, `${child}/history`, "must be a non-empty bounded array");
    if (!Array.isArray(change.proposedChanges) || change.proposedChanges.length < 1 || change.proposedChanges.length > 500) issue(issues, `${child}/proposedChanges`, "must be a non-empty bounded array");
    if (!Array.isArray(change.impacts) || change.impacts.length > 10_000) issue(issues, `${child}/impacts`, "must be a bounded array");
    boundedJson(change, child, issues);
  });
  if (!Array.isArray(value.outbox) || value.outbox.length > 200_000) issue(issues, `${path}/outbox`, "must be a bounded array");
  else value.outbox.forEach((event, index) => {
    const child = `${path}/outbox/${index}`;
    if (!object(event)) { issue(issues, child, "must be an object"); return; }
    required(event, ["id", "eventType", "aggregateId", "recipientRefs", "summary", "createdAt", "status", "attempts"], child, issues);
    if (!/^OB-(?!000000)[0-9]{6}$/u.test(event.id ?? "")) issue(issues, `${child}/id`, "must be a canonical outbox ID");
    if (!new Set(["pending", "delivered", "failed", "dead-letter"]).has(event.status)) issue(issues, `${child}/status`, "is not a governed outbox status");
    boundedJson(event, child, issues);
  });
  if (!Array.isArray(value.baselineMemberships) || value.baselineMemberships.length > 1_000_000) issue(issues, `${path}/baselineMemberships`, "must be a bounded array");
  else value.baselineMemberships.forEach((membership, index) => {
    const child = `${path}/baselineMemberships/${index}`;
    if (!object(membership)) { issue(issues, child, "must be an object"); return; }
    required(membership, ["baselineId", "requirementId", "version"], child, issues);
    if (!parseRequirementId(membership.requirementId)) issue(issues, `${child}/requirementId`, "must be a canonical requirement ID");
    positiveVersion(membership.version, `${child}/version`, issues);
    boundedJson(membership, child, issues);
  });
}

function validateQualityControl(value, path, issues) {
  if (!object(value)) { issue(issues, path, "must be an object"); return; }
  const allowed = new Set(["schemaVersion", "nextReviewNumber", "nextFindingNumber", "nextPlanNumber", "nextEvidenceNumber", "reviews", "verificationPlans", "evidence"]);
  for (const field of Object.keys(value)) if (!allowed.has(field)) issue(issues, `${path}/${field}`, "is not allowed");
  required(value, [...allowed], path, issues);
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) issue(issues, `${path}/schemaVersion`, `must equal ${CURRENT_SCHEMA_VERSION}`);
  for (const field of ["nextReviewNumber", "nextFindingNumber", "nextPlanNumber", "nextEvidenceNumber"]) positiveVersion(value[field], `${path}/${field}`, issues);
  const collections = [
    ["reviews", "RV", 100_000],
    ["verificationPlans", "VP", 200_000],
    ["evidence", "EV", 200_000],
  ];
  for (const [name, prefix, maximum] of collections) {
    if (!Array.isArray(value[name]) || value[name].length > maximum) { issue(issues, `${path}/${name}`, "must be a bounded array"); continue; }
    const ids = new Set();
    value[name].forEach((record, index) => {
      const child = `${path}/${name}/${index}`;
      if (!object(record)) { issue(issues, child, "must be an object"); return; }
      required(record, ["id", "version"], child, issues);
      if (!new RegExp(`^${prefix}-(?!000000)[0-9]{6}$`, "u").test(record.id ?? "")) issue(issues, `${child}/id`, `must be a canonical ${prefix} ID`);
      if (ids.has(record.id)) issue(issues, `${child}/id`, "is duplicated");
      ids.add(record.id);
      positiveVersion(record.version, `${child}/version`, issues);
      boundedJson(record, child, issues);
    });
    const counter = prefix === "RV" ? "nextReviewNumber" : prefix === "VP" ? "nextPlanNumber" : "nextEvidenceNumber";
    const largest = Math.max(0, ...value[name].map((record) => Number(record?.id?.slice(3))).filter(Number.isInteger));
    if (Number.isInteger(value[counter]) && value[counter] <= largest) issue(issues, `${path}/${counter}`, `must be greater than every allocated ${prefix} number`);
  }
  for (const [index, review] of (value.reviews ?? []).entries()) {
    if (!Array.isArray(review.findings) || review.findings.length > 10_000) { issue(issues, `${path}/reviews/${index}/findings`, "must be a bounded array"); continue; }
    const ids = new Set();
    for (const [findingIndex, finding] of review.findings.entries()) {
      const child = `${path}/reviews/${index}/findings/${findingIndex}`;
      if (!/^FN-(?!000000)[0-9]{6}$/u.test(finding?.id ?? "")) issue(issues, `${child}/id`, "must be a canonical finding ID");
      if (ids.has(finding?.id)) issue(issues, `${child}/id`, "is duplicated within the review");
      ids.add(finding?.id);
    }
  }
  const largestFinding = Math.max(0, ...(value.reviews ?? []).flatMap((review) => review.findings ?? []).map((finding) => Number(finding?.id?.slice(3))).filter(Number.isInteger));
  if (Number.isInteger(value.nextFindingNumber) && value.nextFindingNumber <= largestFinding) issue(issues, `${path}/nextFindingNumber`, "must be greater than every allocated FN number");
}

function provenance(value, path, issues) {
  if (!exactFields(value, provenanceFields, path, issues)) return;
  required(value, ["createdAt", "createdBy", "updatedAt", "updatedBy"], path, issues);
  for (const name of ["createdAt", "updatedAt"]) if (name in value) timestamp(value[name], `${path}/${name}`, issues);
  for (const name of ["createdBy", "updatedBy", "source", "accountablePrincipal"]) if (name in value) boundedString(value[name], `${path}/${name}`, issues, 256);
  if ("aiAssistance" in value) {
    const assistance = value.aiAssistance;
    if (exactFields(assistance, assistanceFields, `${path}/aiAssistance`, issues)) {
      required(assistance, ["assisted"], `${path}/aiAssistance`, issues);
      if (typeof assistance.assisted !== "boolean") issue(issues, `${path}/aiAssistance/assisted`, "must be a boolean");
      for (const name of ["provider", "model", "suggestionId"]) if (name in assistance) boundedString(assistance[name], `${path}/aiAssistance/${name}`, issues, name === "suggestionId" ? 256 : 128);
    }
  }
  if (typeof value.createdAt === "string" && typeof value.updatedAt === "string" && value.updatedAt < value.createdAt) issue(issues, `${path}/updatedAt`, "must not precede createdAt");
}

function retirement(value, path, issues) {
  if (!exactFields(value, retirementFields, path, issues)) return;
  required(value, ["retiredAt", "retiredBy", "rationale"], path, issues);
  if ("retiredAt" in value) timestamp(value.retiredAt, `${path}/retiredAt`, issues);
  for (const name of ["retiredBy", "rationale", "decisionReference"]) if (name in value) boundedString(value[name], `${path}/${name}`, issues, name === "rationale" ? 4000 : 256);
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
  if ("lifecycleHistory" in record) validateLifecycleHistory(record.lifecycleHistory, `${path}/lifecycleHistory`, issues);
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
  } else if (typeof endpoint.kind === "string" && /^external:[a-z][a-z0-9_-]{0,62}$/u.test(endpoint.kind)) {
    boundedString(endpoint.id, `${path}/id`, issues, 256);
    if ("version" in endpoint) issue(issues, `${path}/version`, "is allowed only for requirement endpoints");
    for (const [name, maximum] of [["system", 128], ["artifactType", 64], ["externalId", 256], ["externalVersion", 128], ["systemOfRecord", 128], ["uri", 2048]]) {
      if (name in endpoint) boundedString(endpoint[name], `${path}/${name}`, issues, maximum);
    }
    const metadata = ["system", "artifactType", "externalId", "systemOfRecord"];
    const present = metadata.filter((name) => name in endpoint);
    if (present.length && present.length !== metadata.length) issue(issues, path, "external system-of-record metadata must be complete");
    if (endpoint.artifactType && endpoint.kind !== `external:${endpoint.artifactType}`) issue(issues, `${path}/artifactType`, "must agree with the external endpoint kind");
  } else issue(issues, `${path}/kind`, "must be requirement or a configured external artifact kind");
}

function validateRelationshipHistory(entries, path, issues) {
  if (!Array.isArray(entries) || entries.length > 4096) { issue(issues, path, "must be a bounded array"); return; }
  entries.forEach((entry, index) => {
    const child = `${path}/${index}`;
    if (!exactFields(entry, relationshipHistoryFields, child, issues)) return;
    required(entry, ["action", "at", "by", "status"], child, issues);
    if (!new Set(["created", "suspect-marked", "reassessed", "retired"]).has(entry.action)) issue(issues, `${child}/action`, "is not a governed relationship history action");
    if (!relationshipStatuses.has(entry.status)) issue(issues, `${child}/status`, "is not a governed relationship status");
    if ("at" in entry) timestamp(entry.at, `${child}/at`, issues);
    for (const [name, maximum] of [["by", 256], ["assessment", 64], ["rationale", 4000], ["rule", 128], ["reason", 1000]]) if (name in entry) boundedString(entry[name], `${child}/${name}`, issues, maximum);
    if ("triggeringItemVersion" in entry) positiveVersion(entry.triggeringItemVersion, `${child}/triggeringItemVersion`, issues);
    if ("changedFields" in entry) {
      if (!Array.isArray(entry.changedFields) || entry.changedFields.length > 64 || new Set(entry.changedFields).size !== entry.changedFields.length) issue(issues, `${child}/changedFields`, "must be a bounded unique array");
      else entry.changedFields.forEach((field, fieldIndex) => boundedString(field, `${child}/changedFields/${fieldIndex}`, issues, 64));
    }
  });
}

function validateRelationship(record, path, policy, issues) {
  if (!exactFields(record, relationshipFields, path, issues)) return;
  required(record, ["id", "version", "type", "source", "target", "suspect"], path, issues);
  if (!parseRelationshipId(record.id)) issue(issues, `${path}/id`, "must match RL-000001 through RL-999999");
  positiveVersion(record.version, `${path}/version`, issues);
  boundedString(record.type, `${path}/type`, issues, 64);
  if (typeof record.suspect !== "boolean") issue(issues, `${path}/suspect`, "must be a boolean");
  if ("status" in record && !relationshipStatuses.has(record.status)) issue(issues, `${path}/status`, "is not a governed relationship status");
  if (record.status === "suspect" && record.suspect !== true) issue(issues, `${path}/suspect`, "must be true when status is suspect");
  if (record.status && record.status !== "suspect" && record.suspect !== false) issue(issues, `${path}/suspect`, "must be false when status is not suspect");
  validateEndpoint(record.source, `${path}/source`, issues);
  validateEndpoint(record.target, `${path}/target`, issues);
  if ("rationale" in record) boundedString(record.rationale, `${path}/rationale`, issues, 4000);
  if ("provenance" in record) provenance(record.provenance, `${path}/provenance`, issues);
  if ("retirement" in record) retirement(record.retirement, `${path}/retirement`, issues);
  if ("customAttributes" in record) custom(record.customAttributes, `${path}/customAttributes`, issues);
  if ("history" in record) validateRelationshipHistory(record.history, `${path}/history`, issues);
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
  required(document, [...envelopeFields].filter((field) => field !== "changeControl" && field !== "qualityControl"), path, issues);
  if (document.$schema !== `.engine/schemas/v1/${level}-requirements.schema.json`) issue(issues, `${path}/$schema`, "does not name the canonical versioned schema");
  if (document.schemaVersion !== CURRENT_SCHEMA_VERSION) issue(issues, `${path}/schemaVersion`, `must equal ${CURRENT_SCHEMA_VERSION}`);
  if (document.documentType !== level) issue(issues, `${path}/documentType`, `must equal ${level}`);
  if (!Number.isInteger(document.repositoryRevision) || document.repositoryRevision < 0) issue(issues, `${path}/repositoryRevision`, "must be a non-negative integer");
  for (const field of ["nextRequirementNumber", "nextRelationshipNumber"]) if (!Number.isInteger(document[field]) || document[field] < 1 || document[field] > MAX_IDENTIFIER_NUMBER + 1) issue(issues, `${path}/${field}`, `must be between 1 and ${MAX_IDENTIFIER_NUMBER + 1}`);
  if (!Array.isArray(document.requirements) || document.requirements.length > DOCUMENT_LIMITS.requirements) issue(issues, `${path}/requirements`, "must be a bounded array");
  else document.requirements.forEach((record, index) => validateRequirement(record, level, `${path}/requirements/${index}`, policy, issues));
  if (!Array.isArray(document.relationships) || document.relationships.length > DOCUMENT_LIMITS.relationships) issue(issues, `${path}/relationships`, "must be a bounded array");
  else document.relationships.forEach((record, index) => validateRelationship(record, `${path}/relationships/${index}`, policy, issues));
  if ("changeControl" in document) {
    if (level !== "business") issue(issues, `${path}/changeControl`, "is stored only in the business canonical document");
    else validateChangeControl(document.changeControl, `${path}/changeControl`, issues);
  }
  if ("qualityControl" in document) {
    if (level !== "business") issue(issues, `${path}/qualityControl`, "is stored only in the business canonical document");
    else validateQualityControl(document.qualityControl, `${path}/qualityControl`, issues);
  }
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
      if (!record.retirement) {
        const key = `${record.type}\u0000${record.source?.kind}\u0000${record.source?.id}`;
        cardinality.set(key, (cardinality.get(key) ?? 0) + 1);
        const maximum = policy.relationships.find(({ type }) => type === record.type)?.maxTargets;
        if (maximum && cardinality.get(key) > maximum) issue(issues, path, `exceeds configured maxTargets ${maximum}`);
      }
    }
  }
  const control = business?.changeControl;
  if (control) {
    const changeIds = new Set();
    let largestChange = 0;
    for (const [index, change] of (control.changes ?? []).entries()) {
      if (changeIds.has(change.id)) issue(issues, `/business/changeControl/changes/${index}/id`, "is duplicated");
      changeIds.add(change.id);
      const number = Number(change.id?.slice(3));
      if (Number.isInteger(number)) largestChange = Math.max(largestChange, number);
    }
    if (Number.isInteger(control.nextChangeNumber) && control.nextChangeNumber <= largestChange) issue(issues, "/business/changeControl/nextChangeNumber", "must be greater than every allocated change number");
    const outboxIds = new Set();
    let largestOutbox = 0;
    for (const [index, event] of (control.outbox ?? []).entries()) {
      if (outboxIds.has(event.id)) issue(issues, `/business/changeControl/outbox/${index}/id`, "is duplicated");
      outboxIds.add(event.id);
      const number = Number(event.id?.slice(3));
      if (Number.isInteger(number)) largestOutbox = Math.max(largestOutbox, number);
    }
    if (Number.isInteger(control.nextOutboxNumber) && control.nextOutboxNumber <= largestOutbox) issue(issues, "/business/changeControl/nextOutboxNumber", "must be greater than every allocated outbox number");
    const memberships = new Set();
    for (const [index, membership] of (control.baselineMemberships ?? []).entries()) {
      const key = `${membership.baselineId}\u0000${membership.requirementId}\u0000${membership.version}`;
      if (memberships.has(key)) issue(issues, `/business/changeControl/baselineMemberships/${index}`, "is duplicated");
      memberships.add(key);
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
