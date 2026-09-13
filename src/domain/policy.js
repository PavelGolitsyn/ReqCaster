import { QUALITY_RULE_CATALOG } from "./quality.js";

const internalKinds = new Set(["business", "software"]);
const knownPermissions = new Set(["requirements:read", "requirements:validate-draft", "requirements:mutate", "requirements:decide", "requirements:baseline", "requirements:import", "requirements:configure"]);
const knownQualityRules = new Set(QUALITY_RULE_CATALOG.map(({ id }) => id));
const authoringFields = new Set(["owner", "priority", "criticality", "rationale", "source", "sourceReferences", "verificationMethods", "acceptanceCriteria"]);
const transitionFields = new Set(["owner", "priority", "criticality", "rationale", "source", "sourceReferences", "verificationMethods", "acceptanceCriteria", "statement", "category"]);
const blockingConditions = new Set(["blocking-tbds", "coverage", "critical-suspect-links"]);

export function validatePolicy(policy) {
  const issues = [];
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(policy?.traceabilityModelVersion ?? "")) issues.push("traceability model version must be semantic version syntax");
  const statuses = new Set(policy?.requirements?.statuses ?? []);
  if (!statuses.has(policy?.authoringRules?.defaultStatus)) issues.push(`authoring default status is unknown: ${policy?.authoringRules?.defaultStatus}`);
  const authoringLevels = new Set();
  for (const rule of policy?.authoringRules?.requiredFields ?? []) {
    if (authoringLevels.has(rule.level)) issues.push(`duplicate authoring rule for level: ${rule.level}`);
    authoringLevels.add(rule.level);
    for (const field of rule.fields ?? []) if (!authoringFields.has(field)) issues.push(`authoring required field is unknown: ${field}`);
  }
  const transitionKeys = new Set();
  for (const transition of policy?.transitions ?? []) {
    for (const field of ["requiredFields", "requiredEvidenceTypes", "blockingConditions", "impactActions", "allowException"]) if (!(field in transition)) issues.push(`transition declaration is incomplete (${field}): ${transition.from}->${transition.to}`);
    if (!statuses.has(transition.from)) issues.push(`transition source is unknown: ${transition.from}`);
    if (!statuses.has(transition.to)) issues.push(`transition target is unknown: ${transition.to}`);
    if (transition.from === transition.to) issues.push(`self transition is contradictory: ${transition.from}`);
    if (!knownPermissions.has(transition.permission)) issues.push(`transition permission is unknown: ${transition.permission}`);
    for (const field of transition.requiredFields ?? []) if (!transitionFields.has(field)) issues.push(`transition required field is unknown: ${field}`);
    for (const condition of transition.blockingConditions ?? []) if (!blockingConditions.has(condition)) issues.push(`transition blocking condition is unknown: ${condition}`);
    if (new Set(transition.requiredFields ?? []).size !== (transition.requiredFields ?? []).length) issues.push(`transition required fields must be unique: ${transition.from}->${transition.to}`);
    if (new Set(transition.requiredEvidenceTypes ?? []).size !== (transition.requiredEvidenceTypes ?? []).length) issues.push(`transition evidence types must be unique: ${transition.from}->${transition.to}`);
    const key = `${transition.from}->${transition.to}`;
    if (transitionKeys.has(key)) issues.push(`duplicate transition: ${key}`);
    transitionKeys.add(key);
  }
  const relationshipTypes = new Set();
  for (const relationship of policy?.relationships ?? []) {
    if (relationshipTypes.has(relationship.type)) issues.push(`duplicate relationship rule: ${relationship.type}`);
    relationshipTypes.add(relationship.type);
    if (relationship.direction !== "source-to-target") issues.push(`relationship direction is invalid: ${relationship.type}`);
    if (![...(relationship.sourceKinds ?? []), ...(relationship.targetKinds ?? [])].every((kind) => internalKinds.has(kind) || /^external:[a-z][a-z0-9_-]{0,62}$/u.test(kind))) {
      issues.push(`relationship has unknown endpoint kind: ${relationship.type}`);
    }
    if (!Number.isInteger(relationship.maxTargets) || relationship.maxTargets < 1) issues.push(`relationship limit must be positive: ${relationship.type}`);
    if (relationship.traversal !== undefined && !new Set(["upstream", "downstream", "horizontal"]).has(relationship.traversal)) issues.push(`relationship traversal is invalid: ${relationship.type}`);
    if (relationship.symmetric && relationship.traversal !== "horizontal") issues.push(`symmetric relationship must use horizontal traversal: ${relationship.type}`);
    if (![...(relationship.sourceKinds ?? []), ...(relationship.targetKinds ?? [])].some((kind) => internalKinds.has(kind))) issues.push(`relationship has no possible internal storage owner: ${relationship.type}`);
  }
  for (const coverage of policy?.coverageRules ?? []) {
    if (!new Set(["business", "software"]).has(coverage.level)) issues.push(`coverage level is unknown: ${coverage.level}`);
    for (const status of coverage.statuses ?? []) if (!statuses.has(status)) issues.push(`coverage status is unknown: ${status}`);
    for (const type of coverage.requiredRelationshipTypes ?? []) if (!relationshipTypes.has(type)) issues.push(`coverage relationship is unknown: ${type}`);
  }
  for (const status of policy?.baselineReadiness?.allowedStatuses ?? []) {
    if (!statuses.has(status)) issues.push(`baseline status is unknown: ${status}`);
  }
  for (const status of policy?.retirementRules?.decisionReferenceStatuses ?? []) {
    if (!statuses.has(status)) issues.push(`retirement decision-reference status is unknown: ${status}`);
  }
  for (const status of policy?.changeControl?.protectedStatuses ?? []) if (!statuses.has(status)) issues.push(`change-control protected status is unknown: ${status}`);
  for (const name of ["impactDepthMaximum", "impactNodeMaximum", "outboxMaximumAttempts"]) {
    const value = policy?.changeControl?.[name];
    if (value !== undefined && (!Number.isInteger(value) || value < 1)) issues.push(`change-control limit must be positive: ${name}`);
  }
  for (const level of [...(policy?.authoringRules?.rationaleOrSourceLevels ?? []), ...(policy?.authoringRules?.verificationPlanningLevels ?? [])]) {
    if (!new Set(["business", "software"]).has(level)) issues.push(`authoring rule level is unknown: ${level}`);
  }
  const limits = policy?.limits ?? {};
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1) issues.push(`limit must be a positive integer: ${name}`);
  }
  if (limits.searchDefault > limits.searchMaximum) issues.push("searchDefault cannot exceed searchMaximum");
  const promoted = policy?.qualityRules?.promotedRuleIds ?? [];
  if (!Array.isArray(promoted)) issues.push("promoted quality rules must be an array");
  else {
    if (new Set(promoted).size !== promoted.length) issues.push("promoted quality rules must be unique");
    for (const ruleId of promoted) if (!knownQualityRules.has(ruleId) || !ruleId.startsWith("REQ-QUALITY-")) issues.push(`promoted quality rule is unknown or not advisory: ${ruleId}`);
  }
  return issues;
}
