import { buildTraceabilityIndex } from "./traceability-index.js";

export const SEARCH_INDEX_VERSION = "1.0.0";

const TEXT_FIELDS = Object.freeze(["id", "statement", "shortLabel", "rationale", "sourceReferences", "customAttributes", "relationships"]);
const FIELD_WEIGHTS = Object.freeze({ id: 100, shortLabel: 18, statement: 10, rationale: 4, sourceReferences: 3, customAttributes: 2, relationships: 2 });

export function normalizeSearchText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("und").replace(/\s+/gu, " ").trim();
}

export function tokenizeSearchText(value) {
  return normalizeSearchText(value).match(/[\p{L}\p{N}]+(?:[-_.:/][\p{L}\p{N}]+)*/gu) ?? [];
}

function textValue(value) {
  if (Array.isArray(value)) return value.map(textValue).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textValue).join(" ");
  return value === undefined || value === null ? "" : String(value);
}

function permittedCustomAttributes(attributes, policy) {
  const excluded = new Set(policy.excludedFields ?? []);
  const prefixes = policy.excludedCustomAttributePrefixes ?? ["confidential.", "secret."];
  return Object.fromEntries(Object.entries(attributes ?? {}).filter(([key]) => (
    !excluded.has(`customAttributes.${key}`) && !prefixes.some((prefix) => key.startsWith(prefix))
  )));
}

function relationshipMetadata(relationships) {
  const byRequirement = new Map();
  const add = (id, value) => {
    const entries = byRequirement.get(id) ?? [];
    entries.push(value);
    byRequirement.set(id, entries);
  };
  for (const relationship of relationships) {
    if (relationship.retirement) continue;
    add(relationship.source.id, {
      direction: "outgoing",
      endpointId: relationship.target.id,
      endpointKind: relationship.target.kind,
      suspect: relationship.suspect,
      type: relationship.type,
    });
    if (relationship.target.id !== relationship.source.id) add(relationship.target.id, {
      direction: "incoming",
      endpointId: relationship.source.id,
      endpointKind: relationship.source.kind,
      suspect: relationship.suspect,
      type: relationship.type,
    });
  }
  return byRequirement;
}

function searchableReference(reference, policy) {
  const permitted = policy.externalReferenceFields ?? ["type", "title"];
  return Object.fromEntries(permitted.filter((field) => field in reference).map((field) => [field, reference[field]]));
}

function definedEntries(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function buildSearchIndex(documents, options = {}) {
  const policy = options.indexPolicy ?? {};
  const requirements = [...documents.business.requirements, ...documents.software.requirements];
  const relationships = [...documents.business.relationships, ...documents.software.relationships];
  const relatedByRequirement = relationshipMetadata(relationships);
  const entries = requirements.map((requirement, index) => {
    if (index % 256 === 0 && options.deadline !== undefined && Date.now() > options.deadline) throw new Error("Search timeout exceeded");
    const related = relatedByRequirement.get(requirement.id) ?? [];
    const sourceReferences = (requirement.sourceReferences ?? []).map((reference) => searchableReference(reference, policy));
    const customAttributes = permittedCustomAttributes(requirement.customAttributes, policy);
    const hasSourceLink = related.some(({ direction, type }) => direction === "outgoing" && ["derives_from", "supersedes"].includes(type));
    const hasExternalLink = related.some(({ endpointKind }) => endpointKind.startsWith("external:"));
    const text = {
      customAttributes: normalizeSearchText(textValue(customAttributes)),
      id: normalizeSearchText(requirement.id),
      rationale: normalizeSearchText(requirement.rationale),
      relationships: normalizeSearchText(textValue(related)),
      shortLabel: normalizeSearchText(requirement.shortLabel),
      sourceReferences: normalizeSearchText(textValue(sourceReferences)),
      statement: normalizeSearchText(requirement.statement),
    };
    const allocation = requirement.allocation ?? customAttributes.allocation ?? [];
    const tags = requirement.tags ?? customAttributes.tags ?? [];
    return {
      facets: definedEntries({
        allocation: Array.isArray(allocation) ? allocation : [allocation],
        category: requirement.category,
        criticality: requirement.criticality,
        document: requirement.level,
        level: requirement.level,
        owner: requirement.owner,
        priority: requirement.priority,
        release: requirement.release ?? customAttributes.release,
        status: requirement.status,
        tags: Array.isArray(tags) ? tags : [tags],
        updatedAt: requirement.provenance?.updatedAt,
        verificationMethod: requirement.verificationMethods ?? [],
        version: requirement.version,
      }),
      id: requirement.id,
      predicates: {
        hasExternalReference: (requirement.sourceReferences?.length ?? 0) > 0 || hasExternalLink,
        hasSuspectLinks: related.some(({ suspect }) => suspect),
        missingSource: (requirement.sourceReferences?.length ?? 0) === 0 && !hasSourceLink,
        missingVerification: (requirement.verificationMethods?.length ?? 0) === 0
          && !(requirement.acceptanceCriteria ?? []).some(({ verificationMethod }) => verificationMethod)
          && !related.some(({ type }) => new Set(["verified_by", "validated_by", "verifies"]).has(type)),
      },
      relationships: related,
      retired: Boolean(requirement.retirement) || requirement.status === "retired",
      text,
      tokens: Object.fromEntries(TEXT_FIELDS.map((field) => [field, tokenizeSearchText(text[field])] )),
      version: requirement.version,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  return {
    configurationVersion: String(options.configurationVersion ?? "1"),
    entries,
    indexVersion: SEARCH_INDEX_VERSION,
    normalization: { caseFolding: "Unicode locale-independent lowercase", form: "NFKC", stemming: "none", tokenization: "Unicode letters/numbers with internal -_.:/" },
    repositoryRevision: documents.business.repositoryRevision,
    schemaVersion: documents.business.schemaVersion,
    traceability: buildTraceabilityIndex(documents, options),
  };
}

function queryTerms(query) {
  const normalized = normalizeSearchText(query);
  const phrases = [];
  let remainder = normalized.replace(/"([^"]+)"/gu, (_, phrase) => { phrases.push(phrase.trim()); return " "; });
  if (remainder.includes('"')) throw new TypeError("Search query contains an unmatched quote");
  remainder = remainder.trim();
  return { phrases: phrases.filter(Boolean), tokens: tokenizeSearchText(remainder) };
}

function array(value) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function equivalent(left, right) {
  return normalizeSearchText(left) === normalizeSearchText(right);
}

function matchesFilters(entry, filters = {}) {
  for (const field of ["level", "document", "category", "status", "priority", "criticality", "owner", "allocation", "release", "tags", "verificationMethod", "version"]) {
    if (filters[field] === undefined) continue;
    const expected = array(filters[field]);
    const actual = array(entry.facets[field]);
    if (!expected.some((wanted) => actual.some((candidate) => equivalent(candidate, wanted)))) return false;
  }
  if (filters.id !== undefined && !array(filters.id).includes(entry.id)) return false;
  for (const predicate of ["missingSource", "missingVerification", "hasSuspectLinks", "hasExternalReference"]) {
    if (filters[predicate] !== undefined && entry.predicates[predicate] !== filters[predicate]) return false;
  }
  if (filters.updatedFrom && (!entry.facets.updatedAt || entry.facets.updatedAt < filters.updatedFrom)) return false;
  if (filters.updatedTo && (!entry.facets.updatedAt || entry.facets.updatedAt > filters.updatedTo)) return false;
  return true;
}

function scoreEntry(entry, terms, allowedFields = TEXT_FIELDS) {
  if (!terms.tokens.length && !terms.phrases.length) return { matchedFields: [], score: 0 };
  const matched = new Set();
  let score = 0;
  for (const phrase of terms.phrases) {
    let found = false;
    for (const field of allowedFields) {
      if (entry.text[field].includes(phrase)) { score += FIELD_WEIGHTS[field] * 3; matched.add(field); found = true; }
    }
    if (!found) return null;
  }
  for (const token of terms.tokens) {
    let found = false;
    for (const field of allowedFields) {
      if (entry.tokens[field].some((candidate) => candidate === token || candidate.startsWith(token))) {
        score += FIELD_WEIGHTS[field] * (entry.tokens[field].includes(token) ? 2 : 1);
        matched.add(field);
        found = true;
      }
    }
    if (!found) return null;
  }
  if (terms.tokens.length === 1 && normalizeSearchText(entry.id) === terms.tokens[0]) score += 1000;
  return { matchedFields: [...matched].sort(), score };
}

export function searchIndex(index, specification = {}) {
  const terms = queryTerms(specification.query ?? "");
  const allowedIds = specification.allowedIds ? new Set(specification.allowedIds) : null;
  const allowedFields = specification.allowedSearchFields
    ? TEXT_FIELDS.filter((field) => field === "id" || specification.allowedSearchFields.includes(field))
    : TEXT_FIELDS;
  const results = [];
  for (let position = 0; position < index.entries.length; position += 1) {
    if (position % 256 === 0 && specification.deadline !== undefined && Date.now() > specification.deadline) throw new Error("Search timeout exceeded");
    const entry = index.entries[position];
    if (allowedIds && !allowedIds.has(entry.id)) continue;
    if (!specification.includeRetired && entry.retired) continue;
    if (!matchesFilters(entry, specification.filters)) continue;
    const match = scoreEntry(entry, terms, allowedFields);
    if (!match) continue;
    results.push({ entry, ...match });
  }
  return results;
}

export class EmbeddedSearchIndex {
  constructor(options = {}) {
    this.options = options;
    this.current = null;
    this.stale = true;
    this.lastError = null;
  }

  rebuild(documents, options = {}) {
    this.current = buildSearchIndex(documents, { ...this.options, ...options });
    this.stale = false;
    this.lastError = null;
    return structuredClone(this.current);
  }

  markStale(error) {
    this.stale = true;
    this.lastError = error?.message ?? String(error ?? "unknown error");
  }

  health() {
    return { available: Boolean(this.current), lastError: this.lastError, repositoryRevision: this.current?.repositoryRevision, stale: this.stale };
  }

  query(specification) {
    if (!this.current || this.stale) throw new Error("Search index is unavailable or stale");
    return searchIndex(this.current, specification);
  }
}
