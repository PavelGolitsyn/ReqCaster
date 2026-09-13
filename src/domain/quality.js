const VERSION = "1.0.0";

export const QUALITY_RULE_CATALOG = Object.freeze([
  { id: "REQ-STRUCT-001", version: VERSION, title: "Known draft fields", kind: "structural", defaultSeverity: "error" },
  { id: "REQ-STRUCT-002", version: VERSION, title: "Required authoring metadata", kind: "structural", defaultSeverity: "error" },
  { id: "REQ-STRUCT-003", version: VERSION, title: "Controlled vocabulary", kind: "structural", defaultSeverity: "error" },
  { id: "REQ-QUALITY-001", version: VERSION, title: "Explicit subject", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-002", version: VERSION, title: "Binding obligation", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-003", version: VERSION, title: "Measurable threshold and units", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-004", version: VERSION, title: "Vague or weak terms", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-005", version: VERSION, title: "Passive ownership", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-006", version: VERSION, title: "Ambiguous pronoun", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-007", version: VERSION, title: "Single obligation", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-008", version: VERSION, title: "No unresolved placeholders", kind: "heuristic", defaultSeverity: "warning" },
  { id: "REQ-QUALITY-009", version: VERSION, title: "Possible duplicate", kind: "heuristic", defaultSeverity: "info" },
  { id: "REQ-QUALITY-010", version: VERSION, title: "Consistent terminology", kind: "heuristic", defaultSeverity: "info" },
  { id: "REQ-QUALITY-011", version: VERSION, title: "Solution-neutral wording", kind: "heuristic", defaultSeverity: "info" },
  { id: "REQ-QUALITY-012", version: VERSION, title: "Explicit conditions", kind: "heuristic", defaultSeverity: "info" },
]);

const RULES = new Map(QUALITY_RULE_CATALOG.map((rule) => [rule.id, rule]));
const DRAFT_FIELDS = new Set([
  "level", "statement", "shortLabel", "category", "status", "priority", "criticality", "owner", "rationale", "source",
  "verificationMethods", "acceptanceCriteria", "sourceReferences", "customAttributes", "aiAssistance", "reuse",
]);

function empty(value) {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

function evidence(statement, match) {
  if (!match) return undefined;
  return { start: match.index, end: match.index + match[0].length, text: match[0] };
}

function add(findings, policy, ruleId, path, explanation, correction, match) {
  const rule = RULES.get(ruleId);
  const promoted = (policy?.qualityRules?.promotedRuleIds ?? []).includes(ruleId);
  findings.push({
    ruleId,
    ruleVersion: rule.version,
    severity: promoted && rule.kind === "heuristic" ? "error" : rule.defaultSeverity,
    path,
    ...(match ? { evidence: evidence(path === "/statement" ? match.input : "", match) } : {}),
    explanation,
    suggestedCorrection: correction,
    source: rule.kind === "heuristic" ? "heuristic" : "deterministic",
    blocking: rule.kind === "structural" || promoted,
  });
}

function tokens(value) {
  return new Set(String(value ?? "").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? []);
}

function similarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / new Set([...a, ...b]).size;
}

export function validateRequirementDraft(draft, policy, options = {}) {
  const findings = [];
  const candidate = draft && typeof draft === "object" && !Array.isArray(draft) ? draft : {};
  for (const field of Object.keys(candidate)) {
    if (!DRAFT_FIELDS.has(field)) add(findings, policy, "REQ-STRUCT-001", `/${field}`, "The field is not part of the controlled authoring contract.", "Remove the field or use a supported structured attribute.");
  }

  const required = ["level", "statement", "category"];
  const configuredRequired = (policy?.authoringRules?.requiredFields ?? []).find(({ level }) => level === candidate.level)?.fields ?? [];
  if (options.forCommit) required.push(...configuredRequired);
  for (const field of required) {
    if (empty(candidate[field])) add(findings, policy, "REQ-STRUCT-002", `/${field}`, `${field} is required.`, `Provide a governed ${field} value.`);
  }
  if (options.forCommit && (policy?.authoringRules?.rationaleOrSourceLevels ?? []).includes(candidate.level) && empty(candidate.rationale) && empty(candidate.source) && empty(candidate.sourceReferences)) {
    add(findings, policy, "REQ-STRUCT-002", "/rationale", "A rationale or source is required for governed content.", "Add rationale, source, or at least one source reference.");
  }
  if (options.forCommit && (policy?.authoringRules?.verificationPlanningLevels ?? []).includes(candidate.level) && empty(candidate.verificationMethods) && empty(candidate.acceptanceCriteria)) {
    add(findings, policy, "REQ-STRUCT-002", "/verificationMethods", "Software requirements require verification planning.", "Add a verification method or measurable acceptance criterion.");
  }
  if (candidate.aiAssistance?.assisted === true) {
    for (const field of ["provider", "service", "model", "runId", "promptTemplateVersion", "ruleVersion", "generatedAt", "sourceItems", "requester", "contentHash", "rationale", "proposalStatus"]) {
      if (empty(candidate.aiAssistance[field])) add(findings, policy, "REQ-STRUCT-002", `/aiAssistance/${field}`, `AI-assisted content requires ${field} provenance.`, `Record the accountable AI proposal ${field}.`);
    }
    if (options.newRecord && candidate.aiAssistance.proposalStatus && candidate.aiAssistance.proposalStatus !== "proposed") add(findings, policy, "REQ-STRUCT-003", "/aiAssistance/proposalStatus", "New AI-assisted content must begin as a proposal.", "Use proposed until an accountable human accepts it.");
  }

  const vocabularies = [["category", "categories"], ["status", "statuses"], ["priority", "priorities"], ["criticality", "criticalities"]];
  for (const [field, vocabulary] of vocabularies) {
    if (!empty(candidate[field]) && !(policy?.requirements?.[vocabulary] ?? []).includes(candidate[field])) {
      add(findings, policy, "REQ-STRUCT-003", `/${field}`, `${candidate[field]} is not in the configured ${vocabulary} vocabulary.`, `Choose one of: ${(policy?.requirements?.[vocabulary] ?? []).join(", ")}.`);
    }
  }
  for (const [index, method] of (candidate.verificationMethods ?? []).entries()) {
    if (!(policy?.requirements?.verificationMethods ?? []).includes(method)) add(findings, policy, "REQ-STRUCT-003", `/verificationMethods/${index}`, `${method} is not a configured verification method.`, `Choose one of: ${(policy?.requirements?.verificationMethods ?? []).join(", ")}.`);
  }
  for (const [index, criterion] of (candidate.acceptanceCriteria ?? []).entries()) {
    if (criterion?.verificationMethod && !(policy?.requirements?.verificationMethods ?? []).includes(criterion.verificationMethod)) add(findings, policy, "REQ-STRUCT-003", `/acceptanceCriteria/${index}/verificationMethod`, `${criterion.verificationMethod} is not a configured verification method.`, `Choose one of: ${(policy?.requirements?.verificationMethods ?? []).join(", ")}.`);
  }

  const statement = typeof candidate.statement === "string" ? candidate.statement : "";
  if (statement) {
    const obligation = /\b(?:shall|must)\b/iu.exec(statement);
    const subject = /^\s*(?:when|while|if|where|after|before)?[^,]{0,120}\b(?:shall|must)\b/iu.exec(statement);
    if (!subject) add(findings, policy, "REQ-QUALITY-001", "/statement", "No clear actor or system subject was detected before the obligation.", "Name the responsible system or actor before ‘shall’ or ‘must’.");
    if (!obligation) add(findings, policy, "REQ-QUALITY-002", "/statement", "No binding obligation was detected.", "Express the obligation with a named subject and ‘shall’ or ‘must’.");
    const vague = /\b(?:quickly|rapidly|timely|efficient(?:ly)?|adequate(?:ly)?|appropriate(?:ly)?|easy|user[- ]friendly|as soon as possible|normally|generally|should|may)\b/iu.exec(statement);
    if (vague) add(findings, policy, "REQ-QUALITY-004", "/statement", "The highlighted term is subjective, weak, or open to inconsistent interpretation.", "Replace it with an observable threshold or an explicit condition.", vague);
    const numericWithoutUnit = /\b\d+(?:\.\d+)?\b(?!\s*(?:%|ms|s|min|h|days?|bytes?|kib|mib|gib|hz|khz|mhz|v|a|w|°c|celsius|meters?|mm|cm|km)\b)/iu.exec(statement);
    if (numericWithoutUnit) add(findings, policy, "REQ-QUALITY-003", "/statement", "A numeric threshold without an explicit unit was detected.", "State the unit or dimension that makes the threshold objectively verifiable.", numericWithoutUnit);
    if (vague && !/\b\d+(?:\.\d+)?\s*(?:%|ms|s|min|h|days?|bytes?|kib|mib|gib|hz|khz|mhz|v|a|w|°c|celsius|meters?|mm|cm|km)\b/iu.test(statement)) {
      add(findings, policy, "REQ-QUALITY-003", "/statement", "The quality claim has no measurable threshold and unit.", "Add an observable limit, tolerance, rate, or duration with units.");
    }
    if (candidate.category === "quality" && !/\b\d+(?:\.\d+)?\s*(?:%|ms|s|min|h|days?|bytes?|kib|mib|gib|hz|khz|mhz|v|a|w|°c|celsius|meters?|mm|cm|km)\b/iu.test(statement)) {
      add(findings, policy, "REQ-QUALITY-003", "/statement", "A quality requirement needs an objectively measurable threshold and unit.", "Add the applicable limit, tolerance, rate, duration, or capacity with units.");
    }
    const passive = /\b(?:shall|must)\s+be\s+[a-z]+(?:ed|en)\b/iu.exec(statement);
    if (passive) add(findings, policy, "REQ-QUALITY-005", "/statement", "Passive wording can hide responsibility for the action.", "Name the actor that performs the action.", passive);
    const pronoun = /^\s*(?:this|that|it|they|these|those)\b/iu.exec(statement);
    if (pronoun) add(findings, policy, "REQ-QUALITY-006", "/statement", "The opening pronoun may refer to more than one prior concept.", "Replace the pronoun with the exact system, actor, or data item.", pronoun);
    const obligations = statement.match(/\b(?:shall|must)\b/giu) ?? [];
    if (obligations.length > 1) add(findings, policy, "REQ-QUALITY-007", "/statement", `${obligations.length} obligations were detected in one requirement.`, "Split independently verifiable obligations into separate requirements.");
    const placeholder = /\b(?:TBD|TBC|TODO|FIXME|to be determined|to be confirmed)\b/iu.exec(statement);
    if (placeholder) add(findings, policy, "REQ-QUALITY-008", "/statement", "An unresolved placeholder was detected.", "Resolve the value before governance, or record it in a controlled issue.", placeholder);
    const inconsistent = /\buser\b.*\boperator\b|\boperator\b.*\buser\b/iu.exec(statement);
    if (inconsistent) add(findings, policy, "REQ-QUALITY-010", "/statement", "Potentially interchangeable actor terms appear in one statement.", "Use the project’s preferred term or define the distinction explicitly.", inconsistent);
    const design = /\b(?:React|Angular|PostgreSQL|MySQL|MongoDB|JSON file|database table|REST endpoint|Kafka)\b/iu.exec(statement);
    if (design && !new Set(["interface", "constraint"]).has(candidate.category)) add(findings, policy, "REQ-QUALITY-011", "/statement", "The wording may prescribe a design rather than the needed outcome.", "State the required behavior and move implementation choices to design constraints when appropriate.", design);
    if (candidate.level === "software" && !/\b(?:when|while|if|where|after|before|upon|during)\b/iu.test(statement)) add(findings, policy, "REQ-QUALITY-012", "/statement", "No explicit operating or triggering condition was detected for this software behavior.", "State the condition when it affects when, where, or how the obligation applies.");
  }

  const duplicateCandidates = [];
  for (const existing of options.existingRequirements ?? []) {
    if (existing.id === options.excludeId || existing.status === "retired") continue;
    const score = similarity(statement, existing.statement);
    if (score >= 0.72) duplicateCandidates.push({ id: existing.id, score: Number(score.toFixed(3)) });
  }
  duplicateCandidates.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  if (duplicateCandidates.length) {
    const match = duplicateCandidates.slice(0, 5);
    add(findings, policy, "REQ-QUALITY-009", "/statement", `Possible near-duplicate candidates: ${match.map(({ id, score }) => `${id} (${score})`).join(", ")}.`, "Compare the candidates; keep, merge, or distinguish them through a manager-submitted edit.");
    findings.at(-1).candidates = match;
  }
  return findings;
}

export function blockingFindings(findings) {
  return findings.filter(({ blocking }) => blocking);
}

export const QUALITY_RULE_VERSION = VERSION;
