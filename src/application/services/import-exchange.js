import { randomUUID } from "node:crypto";

import { canonicalHash, parseStrictJson } from "../../adapters/repository/canonical-json.js";
import { assertValidRepositoryDocuments } from "../../adapters/repository/validation.js";
import { parseRelationshipId, parseRequirementId } from "../../domain/identifiers.js";
import { blockingFindings, validateRequirementDraft } from "../../domain/quality.js";
import { ApplicationError } from "../errors.js";

const clone = (value) => structuredClone(value);
const REQUIREMENT_FIELDS = Object.freeze([
  "statement", "shortLabel", "category", "status", "priority", "criticality", "owner", "rationale",
  "verificationMethods", "acceptanceCriteria", "sourceReferences", "customAttributes", "reuse",
]);
const SOURCE_ALIASES = Object.freeze({
  acceptance_criteria: "acceptanceCriteria", criticality: "criticality", description: "statement", id: "id",
  level: "level", owner: "owner", priority: "priority", rationale: "rationale", short_label: "shortLabel",
  source_id: "id", source_references: "sourceReferences", statement: "statement", status: "status", text: "statement",
  type: "level", verification_methods: "verificationMethods", version: "expectedVersion",
});
const IMPORT_MAPPING_VERSION = "1.0.0";

function timestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApplicationError("INVALID_ARGUMENT", "The trusted clock returned an invalid timestamp");
  return parsed.toISOString();
}

function actor(context) { return context.identity?.agentId ?? "unknown-agent"; }
function principal(context) { return context.identity?.principal?.id ?? "unknown-principal"; }
function identityScope(context, operation) { return `${operation}:${principal(context)}:${actor(context)}`; }
function response(request, repositoryRevision, data, source) {
  return { schemaVersion: "1.0.0", repositoryRevision, correlationId: request.correlationId, data, ...(source ? { source } : {}) };
}

function converted(error) {
  if (error instanceof ApplicationError) return error;
  const known = new Set(["INVALID_ARGUMENT", "SCHEMA_VIOLATION", "NOT_FOUND", "VERSION_CONFLICT", "REPOSITORY_BUSY", "INTEGRITY_FAILURE"]);
  return new ApplicationError(known.has(error?.code) ? error.code : "INTERNAL_ERROR", error?.message ?? "Exchange operation failed", { cause: error, details: error?.details ?? [] });
}

function commandHash(request) {
  const copy = clone(request);
  delete copy.correlationId;
  delete copy.idempotencyKey;
  return canonicalHash(copy);
}

function csvRows(content) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (character !== "\r") field += character;
  }
  if (quoted) throw new ApplicationError("INVALID_ARGUMENT", "CSV input contains an unterminated quoted field");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.trim());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) throw new ApplicationError("INVALID_ARGUMENT", "CSV headers must be non-empty and unique");
  return rows.filter((values) => values.some((value) => value !== "")).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function decodeXml(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

function reqifRows(content) {
  const rows = [];
  for (const match of content.matchAll(/<SPEC-OBJECT\b([^>]*)>([\s\S]*?)<\/SPEC-OBJECT>/giu)) {
    const attribute = (name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, "iu").exec(match[1])?.[1];
    const id = attribute("IDENTIFIER");
    const values = [...match[2].matchAll(/<THE-VALUE(?:\s[^>]*)?>([\s\S]*?)<\/THE-VALUE>/giu)].map((entry) => decodeXml(entry[1])).filter(Boolean);
    const longName = attribute("LONG-NAME");
    rows.push({ id, level: attribute("LEVEL") ?? (/^SR-/u.test(id ?? "") ? "software" : "business"), statement: values[0] ?? longName, short_label: longName, category: attribute("CATEGORY"), owner: attribute("OWNER"), priority: attribute("PRIORITY"), rationale: attribute("RATIONALE"), verification_methods: attribute("VERIFICATION-METHODS")?.split(/[;,]/u).map((value) => value.trim()).filter(Boolean) });
  }
  if (!rows.length) throw new ApplicationError("INVALID_ARGUMENT", "ReqIF input contains no supported SPEC-OBJECT records");
  return rows;
}

function parseSource(format, content) {
  if (Buffer.byteLength(content, "utf8") > 5_000_000) throw new ApplicationError("INVALID_ARGUMENT", "Import input exceeds the 5 MB bounded channel");
  if (format === "csv") return { requirements: csvRows(content), relationships: [], version: "rfc4180" };
  if (format === "reqif") return { requirements: reqifRows(content), relationships: [], version: /REQ-IF[^>]*VERSION\s*=\s*"([^"]+)"/iu.exec(content)?.[1] ?? "detected" };
  let parsed;
  try { parsed = parseStrictJson(Buffer.from(content), { maximumBytes: 5_000_000 }); }
  catch (error) { throw new ApplicationError("INVALID_ARGUMENT", "JSON import could not be parsed", { details: [{ path: "/content", reason: error.message }] }); }
  if (Array.isArray(parsed)) return { requirements: parsed, relationships: [], version: "unversioned" };
  if (!parsed || typeof parsed !== "object") throw new ApplicationError("INVALID_ARGUMENT", "JSON import must be an array or object");
  if (parsed.business || parsed.software) return {
    requirements: [...(parsed.business?.requirements ?? []), ...(parsed.software?.requirements ?? [])],
    relationships: [...(parsed.business?.relationships ?? []), ...(parsed.software?.relationships ?? [])],
    version: parsed.schemaVersion ?? parsed.business?.schemaVersion ?? "unversioned",
  };
  return { requirements: parsed.requirements ?? parsed.items ?? [], relationships: parsed.relationships ?? [], version: parsed.schemaVersion ?? parsed.version ?? "unversioned" };
}

function parseStructured(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    try { return JSON.parse(trimmed); } catch { return value; }
  }
  return value;
}

function normalizeLevel(value, id) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["business", "br", "business-requirement"].includes(normalized)) return "business";
  if (["software", "sr", "software-requirement"].includes(normalized)) return "software";
  return parseRequirementId(id)?.level;
}

function normalizeRequirement(row, index, defaultStatus) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return { error: "source item must be an object", index };
  const mapped = {};
  const unmappedFields = [];
  const transformations = [];
  for (const [sourceField, raw] of Object.entries(row)) {
    const target = SOURCE_ALIASES[sourceField] ?? (REQUIREMENT_FIELDS.includes(sourceField) ? sourceField : undefined);
    if (!target) { if (!["provenance", "lifecycleHistory", "retirement", "reuse"].includes(sourceField)) unmappedFields.push(sourceField); continue; }
    const value = parseStructured(raw);
    if (value !== undefined && value !== "") mapped[target] = value;
    if (target !== sourceField) transformations.push({ from: sourceField, to: target, kind: "field-mapping" });
  }
  const sourceId = mapped.id === undefined ? undefined : String(mapped.id).trim();
  if (sourceId && sourceId.length > 256) return { error: "source ID exceeds 256 characters", index };
  delete mapped.id;
  const expectedVersion = Number.isInteger(mapped.expectedVersion) ? mapped.expectedVersion : Number(row.version || row.expectedVersion) || undefined;
  delete mapped.expectedVersion;
  mapped.level = normalizeLevel(mapped.level, sourceId);
  if (mapped.status === undefined) { mapped.status = defaultStatus; transformations.push({ field: "status", kind: "defaulted", value: defaultStatus }); }
  for (const field of ["verificationMethods", "acceptanceCriteria", "sourceReferences", "customAttributes"]) if (typeof mapped[field] === "string") mapped[field] = parseStructured(mapped[field]);
  return { index, mapped, sourceId, transformations, unmappedFields, expectedVersion };
}

function contentOf(item) {
  return Object.fromEntries(REQUIREMENT_FIELDS.filter((field) => field in item).map((field) => [field, clone(item[field])]));
}

function exactFieldDiff(before, after) {
  return [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort().flatMap((field) => {
    const left = { present: field in (before ?? {}), value: before?.[field] ?? null };
    const right = { present: field in (after ?? {}), value: after?.[field] ?? null };
    return canonicalHash(left) === canonicalHash(right) ? [] : [{ field, before: left.value, beforePresent: left.present, after: right.value, afterPresent: right.present }];
  });
}

function allocateRequirementId(documents, level) {
  const document = documents[level];
  const prefix = level === "business" ? "BR" : "SR";
  const id = `${prefix}-${String(document.nextRequirementNumber).padStart(6, "0")}`;
  document.nextRequirementNumber += 1;
  return id;
}

function reserveRequirementId(documents, id) {
  const parsed = parseRequirementId(id);
  documents[parsed.level].nextRequirementNumber = Math.max(documents[parsed.level].nextRequirementNumber, parsed.number + 1);
}

function allocateRelationshipId(documents) {
  const number = documents.business.nextRelationshipNumber;
  documents.business.nextRelationshipNumber += 1;
  documents.software.nextRelationshipNumber += 1;
  return `RL-${String(number).padStart(6, "0")}`;
}

function importProvenance(source, context, now) {
  return { accountablePrincipal: principal(context), aiAssistance: { assisted: false }, createdAt: now, createdBy: actor(context), source, updatedAt: now, updatedBy: actor(context) };
}

function aliasReference(sourceId, format) {
  return { type: "external-alias", uri: `urn:import:${encodeURIComponent(format)}:${encodeURIComponent(sourceId)}`, title: sourceId };
}

function prepareImport(before, source, request, context, policy) {
  const after = clone(before);
  const now = timestamp(context.now);
  const all = () => [...after.business.requirements, ...after.software.requirements];
  const byId = new Map(all().map((item) => [item.id, item]));
  const aliases = new Map();
  const sourceIds = new Set();
  const items = [];
  const findings = [];
  const defaultStatus = policy.authoringRules.defaultStatus;
  for (const [index, row] of source.requirements.entries()) {
    const normalized = normalizeRequirement(row, index, defaultStatus);
    if (normalized.error) { items.push({ sourceIndex: index, outcome: "rejected", reason: normalized.error }); continue; }
    const { mapped, sourceId, transformations, unmappedFields } = normalized;
    if (sourceId && sourceIds.has(sourceId)) { items.push({ sourceIndex: index, sourceId, outcome: "duplicate", reason: "source ID is repeated in the import" }); continue; }
    if (sourceId) sourceIds.add(sourceId);
    if (!mapped.level || !mapped.statement || !mapped.category) {
      items.push({ sourceIndex: index, ...(sourceId ? { sourceId } : {}), outcome: "incomplete", reason: "level, statement, and category are required", unmappedFields });
      continue;
    }
    const parsedId = parseRequirementId(sourceId);
    if (parsedId && parsedId.level !== mapped.level) {
      items.push({ sourceIndex: index, sourceId, outcome: "conflicted", reason: "source ID prefix conflicts with the mapped level", unmappedFields });
      continue;
    }
    const existing = parsedId ? byId.get(sourceId) : undefined;
    const allowedFields = context.authorization?.allowedFields ? new Set(context.authorization.allowedFields(context.security, ["id", "level", ...REQUIREMENT_FIELDS])) : null;
    const unauthorizedFields = allowedFields ? Object.keys(mapped).filter((field) => field !== "level" && !allowedFields.has(field)) : [];
    if (unauthorizedFields.length) {
      items.push({ sourceIndex: index, ...(sourceId ? { sourceId } : {}), outcome: "rejected", reason: "mapped fields exceed the caller's authorized field scope", unmappedFields: unauthorizedFields });
      continue;
    }
    if (existing && context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, existing)) {
      items.push({ sourceIndex: index, ...(sourceId ? { sourceId } : {}), outcome: "conflicted", reason: "source identity cannot be reconciled within the caller's authorized component scope" });
      continue;
    }
    const quality = validateRequirementDraft(mapped, policy, { existingRequirements: all(), excludeId: existing?.id, forCommit: true, newRecord: !existing });
    findings.push(...quality.map((finding) => ({ ...finding, sourceIndex: index, sourceId: sourceId ?? null })));
    if (blockingFindings(quality).length) {
      items.push({ sourceIndex: index, ...(sourceId ? { sourceId } : {}), outcome: "rejected", reason: "governed validation failed", findings: quality, transformations, unmappedFields });
      continue;
    }
    if (existing) {
      if (normalized.expectedVersion === undefined || normalized.expectedVersion !== existing.version) {
        items.push({ sourceIndex: index, sourceId, id: existing.id, outcome: "conflicted", reason: `expectedVersion must equal current version ${existing.version}`, transformations, unmappedFields });
        continue;
      }
      const proposed = contentOf({ ...mapped, level: existing.level });
      const current = contentOf(existing);
      aliases.set(sourceId, existing.id);
      if (canonicalHash(current) === canonicalHash(proposed)) {
        items.push({ sourceIndex: index, sourceId, id: existing.id, outcome: "unchanged", transformations, unmappedFields });
        continue;
      }
      const fromStatus = existing.status;
      for (const field of REQUIREMENT_FIELDS) {
        if (field in mapped) existing[field] = clone(mapped[field]);
        else delete existing[field];
      }
      existing.level = parseRequirementId(existing.id).level;
      existing.version += 1;
      existing.provenance = { ...existing.provenance, accountablePrincipal: principal(context), updatedAt: now, updatedBy: actor(context), source: `import:${request.format}` };
      existing.lifecycleHistory = [...(existing.lifecycleHistory ?? []), { accountablePrincipal: principal(context), action: "import-update", at: now, by: actor(context), from: fromStatus, policyVersion: policy.configurationVersion, reason: `Imported with mapping ${request.mappingVersion}`, to: existing.status }];
      items.push({ sourceIndex: index, sourceId, id: existing.id, outcome: "updated", beforeVersion: normalized.expectedVersion, afterVersion: existing.version, diff: exactFieldDiff(current, contentOf(existing)), transformations, unmappedFields });
      continue;
    }
    let id;
    if (parsedId && !byId.has(sourceId)) { id = sourceId; reserveRequirementId(after, id); }
    else id = allocateRequirementId(after, mapped.level);
    const sourceReferences = clone(mapped.sourceReferences ?? []);
    if (sourceId && id !== sourceId) sourceReferences.push(aliasReference(sourceId, request.format));
    const record = { ...contentOf(mapped), id, level: mapped.level, provenance: importProvenance(`import:${request.format}`, context, now), version: 1, ...(sourceReferences.length ? { sourceReferences } : {}) };
    if (context.authorization?.canReadItem && !context.authorization.canReadItem(context.security, record)) {
      items.push({ sourceIndex: index, ...(sourceId ? { sourceId } : {}), outcome: "rejected", reason: "mapped item is outside the caller's authorized component scope", transformations, unmappedFields });
      continue;
    }
    after[mapped.level].requirements.push(record);
    byId.set(id, record);
    if (sourceId) aliases.set(sourceId, id);
    items.push({ sourceIndex: index, ...(sourceId ? { sourceId } : {}), id, outcome: "created", idOutcome: id === sourceId ? "preserved" : "allocated", diff: exactFieldDiff({}, contentOf(record)), transformations, unmappedFields });
  }

  const relationshipResults = [];
  const allRelationships = () => [...after.business.relationships, ...after.software.relationships];
  const sourceRelationshipIds = new Set();
  for (const [index, row] of source.relationships.entries()) {
    const sourceId = row?.source?.id ?? row?.sourceId;
    const targetId = row?.target?.id ?? row?.targetId;
    const mappedSource = aliases.get(sourceId) ?? sourceId;
    const mappedTarget = aliases.get(targetId) ?? targetId;
    const type = row?.type ?? row?.relationshipType;
    const importedId = row?.id;
    if (importedId && sourceRelationshipIds.has(importedId)) { relationshipResults.push({ sourceIndex: index, sourceId: importedId, outcome: "duplicate" }); continue; }
    if (importedId) sourceRelationshipIds.add(importedId);
    if (!mappedSource || !mappedTarget || !type || !byId.has(mappedSource) || !byId.has(mappedTarget)) { relationshipResults.push({ sourceIndex: index, ...(importedId ? { sourceId: importedId } : {}), outcome: "incomplete", reason: "relationship endpoints and type must resolve to imported or existing requirements" }); continue; }
    if (allRelationships().some((link) => !link.retirement && link.type === type && link.source?.id === mappedSource && link.target?.id === mappedTarget)) { relationshipResults.push({ sourceIndex: index, ...(importedId ? { sourceId: importedId } : {}), outcome: "duplicate", reason: "equivalent relationship already exists" }); continue; }
    const rule = policy.relationships.find((entry) => entry.type === type);
    if (!rule) { relationshipResults.push({ sourceIndex: index, ...(importedId ? { sourceId: importedId } : {}), outcome: "rejected", reason: "relationship type is not configured" }); continue; }
    let id = importedId && parseRelationshipId(importedId) && !allRelationships().some((link) => link.id === importedId) ? importedId : allocateRelationshipId(after);
    if (id === importedId) {
      const number = parseRelationshipId(id).number + 1;
      after.business.nextRelationshipNumber = Math.max(after.business.nextRelationshipNumber, number);
      after.software.nextRelationshipNumber = Math.max(after.software.nextRelationshipNumber, number);
    }
    const sourceItem = byId.get(mappedSource);
    const targetItem = byId.get(mappedTarget);
    const relationship = { history: [{ action: "created", at: now, by: actor(context), rationale: "Imported relationship", status: "valid" }], id, provenance: importProvenance(`import:${request.format}`, context, now), source: { kind: "requirement", id: mappedSource, version: sourceItem.version }, target: { kind: "requirement", id: mappedTarget, version: targetItem.version }, status: "valid", suspect: false, type, version: 1 };
    after[sourceItem.level].relationships.push(relationship);
    relationshipResults.push({ sourceIndex: index, ...(importedId ? { sourceId: importedId } : {}), id, outcome: "created", idOutcome: id === importedId ? "preserved" : "allocated", after: clone(relationship) });
  }
  let validationError;
  try { assertValidRepositoryDocuments(after.business, after.software, policy); }
  catch (error) { validationError = error; }
  if (validationError) items.push({ sourceIndex: null, outcome: "rejected", reason: "normalized repository validation failed", details: validationError.details ?? [] });
  const combined = [...items, ...relationshipResults];
  const names = ["created", "updated", "unchanged", "duplicate", "conflicted", "rejected", "incomplete", "transformed", "unmapped"];
  const counts = Object.fromEntries(names.map((name) => [name, combined.filter(({ outcome }) => outcome === name).length]));
  counts.transformed = items.filter(({ transformations }) => transformations?.length).length;
  counts.unmapped = items.filter(({ unmappedFields }) => unmappedFields?.length).length;
  const blocking = counts.conflicted + counts.rejected + counts.incomplete > 0;
  const normalizedDiff = {
    requirements: items.filter(({ outcome }) => ["created", "updated"].includes(outcome)).map(({ sourceIndex, sourceId, id, outcome, beforeVersion, afterVersion, diff }) => ({ sourceIndex, ...(sourceId ? { sourceId } : {}), id, outcome, diff, ...(beforeVersion ? { beforeVersion } : {}), ...(afterVersion ? { afterVersion } : {}) })),
    relationships: relationshipResults.filter(({ outcome }) => outcome === "created").map(({ sourceIndex, sourceId, id, outcome, after: relationship }) => ({ sourceIndex, ...(sourceId ? { sourceId } : {}), id, outcome, after: relationship })),
  };
  return { after, blocking, counts, findings, items, normalizedDiff, relationshipResults };
}

export class ImportPreviewStore {
  constructor(options = {}) { this.entries = new Map(); this.ttlMilliseconds = options.ttlMilliseconds ?? 5 * 60 * 1000; }
  issue(value, now) {
    const token = `${randomUUID()}${randomUUID().replaceAll("-", "")}`;
    this.entries.set(token, { ...clone(value), expiresAt: new Date(now).getTime() + this.ttlMilliseconds });
    return token;
  }
  get(token, context) {
    const entry = this.entries.get(token);
    if (!entry || entry.identity !== identityScope(context, "imports") || entry.expiresAt <= new Date(context.now).getTime()) throw new ApplicationError("PREVIEW_EXPIRED", "Import preview is missing, expired, or belongs to another actor");
    return clone(entry);
  }
}

export class PreviewImportService {
  constructor(options) { this.repository = options.repository; this.configuredPolicy = options.policy; this.store = options.importPreviewStore; }
  async execute(request, context) {
    try {
      if (request.mappingVersion !== IMPORT_MAPPING_VERSION) throw new ApplicationError("INVALID_ARGUMENT", `Unsupported import mapping version ${request.mappingVersion}`);
      const [before, policy] = await Promise.all([this.repository.read(), this.configuredPolicy ? clone(this.configuredPolicy) : this.repository.getPolicy()]);
      const revision = before.business.repositoryRevision;
      if (request.expectedRepositoryRevision !== revision) throw new ApplicationError("VERSION_CONFLICT", "Expected repository revision does not match current revision", { current: { repositoryRevision: revision } });
      const source = parseSource(request.format, request.content);
      if (!Array.isArray(source.requirements) || !Array.isArray(source.relationships)) throw new ApplicationError("INVALID_ARGUMENT", "Import collections must be arrays");
      if (source.requirements.length > policy.limits.bulkMaximum) throw new ApplicationError("INVALID_ARGUMENT", `Import exceeds configured item limit ${policy.limits.bulkMaximum}`);
      const prepared = prepareImport(before, source, request, context, policy);
      const sourceHash = canonicalHash({ content: request.content, format: request.format });
      const diffHash = canonicalHash({ after: prepared.after, mappingVersion: request.mappingVersion, repositoryRevision: revision, sourceHash });
      const losses = [];
      if (request.format === "csv") losses.push({ feature: "relationships", disposition: "unsupported", reason: "CSV 1.0 is a flat requirement exchange" }, { feature: "history", disposition: "unsupported", reason: "CSV 1.0 does not carry governed history" });
      if (request.format === "reqif") losses.push({ feature: "attachments", disposition: "reference-only", reason: "Embedded ReqIF attachment payloads are not imported" }, { feature: "history", disposition: "unsupported", reason: "ReqIF history is not mapped by version 1.0.0" });
      const sourceKeys = new Set(source.requirements.flatMap((item) => item && typeof item === "object" ? Object.keys(item) : []));
      if (["parent", "children", "hierarchy"].some((key) => sourceKeys.has(key))) losses.push({ feature: "hierarchy", disposition: "unsupported", reason: "Mapping 1.0.0 requires hierarchy to be expressed as configured relationships" });
      if (["attachments", "attachment"].some((key) => sourceKeys.has(key))) losses.push({ feature: "attachments", disposition: "reference-only", reason: "Binary attachment bodies are not stored in the canonical repository" });
      if (["history", "lifecycleHistory", "provenance"].some((key) => sourceKeys.has(key))) losses.push({ feature: "history", disposition: "transformed", reason: "Source history is disclosed but canonical import attribution is newly recorded" });
      const previewToken = this.store.issue({ after: prepared.after, counts: prepared.counts, diffHash, identity: identityScope(context, "imports"), mappingVersion: request.mappingVersion, policyVersion: policy.configurationVersion, repositoryRevision: revision, sourceHash, valid: !prepared.blocking }, context.now);
      return response(request, revision, {
        counts: prepared.counts, diffHash, findings: prepared.findings, items: prepared.items, losses, mapping: { version: request.mappingVersion }, normalizedDiff: prepared.normalizedDiff,
        previewToken, relationships: prepared.relationshipResults, source: { encoding: "utf-8", format: request.format, version: source.version, hash: sourceHash }, valid: !prepared.blocking,
        reconciliation: { accountedRequirements: prepared.items.length, accountedRelationships: prepared.relationshipResults.length, sourceRequirements: source.requirements.length, sourceRelationships: source.relationships.length },
      });
    } catch (error) { throw converted(error); }
  }
}

export class CommitImportService {
  constructor(options) { this.repository = options.repository; this.configuredPolicy = options.policy; this.store = options.importPreviewStore; this.audit = options.audit; }
  async execute(request, context) {
    try {
      const policy = this.configuredPolicy ? clone(this.configuredPolicy) : await this.repository.getPolicy();
      let preview;
      const result = await this.repository.execute((documents, allocation) => {
        preview = this.store.get(request.previewToken, context);
        if (!preview.valid) throw new ApplicationError("INVALID_ARGUMENT", "Import preview contains rejected, incomplete, or conflicted records and cannot be committed");
        if (request.diffHash !== preview.diffHash) throw new ApplicationError("INVALID_ARGUMENT", "Import diff hash differs from the preview");
        if (policy.configurationVersion !== preview.policyVersion) throw new ApplicationError("VERSION_CONFLICT", "Import mapping policy changed after preview");
        if (documents.business.repositoryRevision !== preview.repositoryRevision || request.expectedRepositoryRevision !== preview.repositoryRevision) throw new ApplicationError("VERSION_CONFLICT", "Repository changed after import preview", { current: { repositoryRevision: documents.business.repositoryRevision } });
        const currentRequirementIds = new Set([...documents.business.requirements, ...documents.software.requirements].map(({ id }) => id));
        const currentRelationshipIds = new Set([...documents.business.relationships, ...documents.software.relationships].map(({ id }) => id));
        for (const item of [...preview.after.business.requirements, ...preview.after.software.requirements]) if (!currentRequirementIds.has(item.id)) allocation.reserveRequirementId(item.id);
        for (const link of [...preview.after.business.relationships, ...preview.after.software.relationships]) if (!currentRelationshipIds.has(link.id)) allocation.reserveRelationshipId(link.id);
        for (const level of ["business", "software"]) {
          documents[level].nextRequirementNumber = preview.after[level].nextRequirementNumber;
          documents[level].nextRelationshipNumber = preview.after[level].nextRelationshipNumber;
          documents[level].requirements = clone(preview.after[level].requirements);
          documents[level].relationships = clone(preview.after[level].relationships);
        }
        return { counts: preview.counts, diffHash: preview.diffHash, mappingVersion: preview.mappingVersion, sourceHash: preview.sourceHash };
      }, { actor: actor(context), expectedRepositoryRevision: request.expectedRepositoryRevision, idempotency: { correlationId: request.correlationId, key: request.idempotencyKey, requestHash: commandHash(request), scope: identityScope(context, "imports.commit") }, provenance: { command: "imports.commit", correlationId: request.correlationId, principalId: principal(context), role: context.identity?.role } });
      if (result.committed) await this.audit?.append?.({ agentId: actor(context), correlationId: request.correlationId, diffHash: preview.diffHash, event: "import-committed", mappingVersion: preview.mappingVersion, principalId: principal(context), repositoryRevision: result.repositoryRevision, sourceHash: preview.sourceHash, timestamp: timestamp(context.now) });
      return response(request, result.repositoryRevision, { ...result.result, replayed: result.replayed ?? false });
    } catch (error) { throw converted(error); }
  }
}

function visibleDocuments(documents, context) {
  const output = clone(documents);
  const allowed = (item) => !context.authorization?.canReadItem || context.authorization.canReadItem(context.security, item);
  const ids = new Set([...documents.business.requirements, ...documents.software.requirements].filter(allowed).map(({ id }) => id));
  for (const level of ["business", "software"]) {
    output[level].requirements = output[level].requirements.filter(({ id }) => ids.has(id));
    output[level].relationships = output[level].relationships.filter((link) => [link.source, link.target].every((endpoint) => endpoint.kind !== "requirement" || ids.has(endpoint.id)));
  }
  if (context.authorization?.allowedFields && context.security?.fieldRestricted) {
    const candidates = ["id", "level", "version", ...REQUIREMENT_FIELDS, "provenance", "retirement", "lifecycleHistory"];
    const fields = new Set(context.authorization.allowedFields(context.security, candidates));
    for (const level of ["business", "software"]) output[level].requirements = output[level].requirements.map((item) => Object.fromEntries(Object.entries(item).filter(([field]) => fields.has(field))));
  }
  return output;
}

function csvEscape(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return /[",\r\n]/u.test(serialized) ? `"${serialized.replaceAll('"', '""')}"` : serialized;
}

export class ExportRequirementsService {
  constructor(options) { this.repository = options.repository; this.baselineStore = options.baselineStore; }
  async execute(request, context) {
    try {
      let documents;
      let source;
      if (request.baselineId) {
        if (!this.baselineStore) throw new ApplicationError("NOT_FOUND", "Baseline storage is not configured");
        const baseline = await this.baselineStore.get(request.baselineId);
        documents = baseline.documents;
        source = { kind: "baseline", baselineId: request.baselineId, repositoryRevision: baseline.manifest.repositoryRevision, manifestChecksum: baseline.manifest.manifestChecksum };
      } else {
        documents = await this.repository.read();
        source = { kind: "current", repositoryRevision: documents.business.repositoryRevision };
      }
      const selected = visibleDocuments(documents, context);
      const requirements = [...selected.business.requirements, ...selected.software.requirements].sort((a, b) => a.id.localeCompare(b.id));
      const relationships = [...selected.business.relationships, ...selected.software.relationships].sort((a, b) => a.id.localeCompare(b.id));
      let content;
      const losses = [];
      if (request.format === "json") content = JSON.stringify({ schemaVersion: "1.0.0", source, requirements, relationships }, null, 2);
      else {
        const fields = ["id", "level", "version", "statement", "shortLabel", "category", "status", "priority", "criticality", "owner", "rationale", "verificationMethods", "acceptanceCriteria", "sourceReferences", "customAttributes", "reuse"];
        content = [fields.join(","), ...requirements.map((item) => fields.map((field) => csvEscape(item[field])).join(","))].join("\r\n");
        losses.push({ feature: "relationships", disposition: "separate/not-exported", reason: "CSV 1.0 is a flat collaboration view" }, { feature: "history", disposition: "flattened", reason: "Lifecycle and provenance history are not columns in CSV 1.0" });
      }
      if (context.security?.fieldRestricted) losses.push({ feature: "fields", disposition: "redacted", reason: "The caller's field authorization scope removed protected requirement fields" });
      return response(request, await this.repository.revision(), { content, contentHash: canonicalHash(content), format: request.format, losses, roundTripClaim: request.format === "json" && !context.security?.fieldRestricted ? "verified-schema-only" : "none", schema: { name: `speccaster-${request.format}`, version: "1.0.0" }, source }, source);
    } catch (error) { throw converted(error); }
  }
}

export class IntegrationContractRegistry {
  constructor(contracts = []) { this.contracts = new Map(); contracts.forEach((contract) => this.register(contract)); }
  register(contract) {
    const required = ["id", "version", "direction", "cadence", "fieldOwnership", "identityMapping", "lifecycleSemantics", "conflictDetection", "conflictResolutionOwner", "retry", "orderingReplay", "permissions", "reconciliation", "deadLetter", "compatibility", "rollback"];
    const missing = required.filter((field) => contract?.[field] === undefined);
    if (missing.length) throw new TypeError(`Integration contract is missing: ${missing.join(", ")}`);
    if (!new Set(["export", "event-outbox", "two-way"]).has(contract.direction)) throw new TypeError("Integration direction is invalid");
    if (contract.direction === "two-way" && contract.conflictPolicy === "last-write-wins") throw new TypeError("Silent last-write-wins is prohibited");
    const key = `${contract.id}@${contract.version}`;
    this.contracts.set(key, clone(contract));
    return clone(contract);
  }
  get(id, version) { return clone(this.contracts.get(`${id}@${version}`) ?? null); }
  list() { return [...this.contracts.values()].map(clone).sort((a, b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`)); }
}

export function createImportExchangeServices(options) {
  const importPreviewStore = options.importPreviewStore ?? new ImportPreviewStore(options.importPreviewTokens);
  const shared = { ...options, importPreviewStore };
  return {
    PreviewImportService: new PreviewImportService(shared),
    CommitImportService: new CommitImportService(shared),
    ExportRequirementsService: new ExportRequirementsService(shared),
  };
}

export { IMPORT_MAPPING_VERSION, parseSource, prepareImport };
