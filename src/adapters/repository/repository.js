import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { formatRelationshipId, formatRequirementId, MAX_IDENTIFIER_NUMBER } from "../../domain/identifiers.js";
import { validatePolicy } from "../../domain/policy.js";
import { canonicalBytes, canonicalHash, parseStrictJson, sha256 } from "./canonical-json.js";
import { IntegrityError, RepositoryError, ValidationError } from "./errors.js";
import { acquireProjectLock } from "./lock.js";
import { CANONICAL_FILENAMES, canonicalDocumentPath, ENGINE_DIRECTORIES, enginePath, normalizeRequirementsRoot } from "./paths.js";
import { assertValidRepositoryDocuments, createEmptyDocument, CURRENT_SCHEMA_VERSION, DOCUMENT_LIMITS } from "./validation.js";

const defaultPolicyUrl = new URL("../../../config/policy.v1.json", import.meta.url);
const schemaDirectoryUrl = new URL("../../../schemas/v1/", import.meta.url);

function clone(value) {
  return structuredClone(value);
}

async function syncDirectory(path) {
  let handle;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EISDIR", "EPERM"]).has(error.code)) throw error;
  } finally { await handle?.close(); }
}

async function writeDurable(path, bytes, options = {}) {
  await mkdir(dirname(path), { recursive: true });
  const flags = options.exclusive ? constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY : constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY;
  const handle = await open(path, flags, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  await syncDirectory(dirname(path));
}

async function replaceDurable(path, bytes, token = randomUUID()) {
  const temporary = join(dirname(path), `.${basename(path)}.${token}.tmp`);
  await writeDurable(temporary, bytes, { exclusive: true });
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

async function assertNotSymlink(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new IntegrityError(`Repository path must not be a symbolic link: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function readCanonical(path, maximumBytes = DOCUMENT_LIMITS.maximumBytes) {
  await assertNotSymlink(path);
  const bytes = await readFile(path);
  const value = parseStrictJson(bytes, { maximumBytes });
  if (!bytes.equals(canonicalBytes(value))) throw new IntegrityError(`${basename(path)} is not canonically serialized`);
  return { bytes, value, hash: sha256(bytes) };
}

function transactionHash(manifest) {
  return canonicalHash({
    afterRevision: manifest.afterRevision,
    businessHash: manifest.after.businessHash,
    softwareHash: manifest.after.softwareHash,
    transactionId: manifest.transactionId,
  });
}

function canonicalTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function assertIntegrityRecord(value) {
  const allowed = new Set(["businessHash", "revision", "schemaVersion", "softwareHash", "transactionHash"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new IntegrityError("Committed integrity record has an invalid shape");
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION || !Number.isInteger(value.revision) || value.revision < 0) throw new IntegrityError("Committed integrity record has invalid version metadata");
  for (const name of ["businessHash", "softwareHash"]) if (!/^[a-f0-9]{64}$/u.test(value[name] ?? "")) throw new IntegrityError(`Committed integrity record has an invalid ${name}`);
  if (value.transactionHash !== null && !/^[a-f0-9]{64}$/u.test(value.transactionHash ?? "")) throw new IntegrityError("Committed integrity record has an invalid transactionHash");
}

function assertManifest(value, directoryName) {
  const allowed = new Set(["actor", "after", "afterRevision", "before", "beforeRevision", "committedAt", "createdAt", "recoveredAt", "recoveryReason", "schemaVersion", "status", "transactionId"]);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new IntegrityError("Transaction manifest has an invalid shape");
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION || value.transactionId !== directoryName || !/^[0-9]{12}-[a-f0-9-]{36}$/u.test(value.transactionId)) throw new IntegrityError("Transaction manifest identity is invalid");
  if (!new Set(["prepared", "committed", "rolled-back"]).has(value.status) || !Number.isInteger(value.beforeRevision) || value.beforeRevision < 0 || value.afterRevision !== value.beforeRevision + 1) throw new IntegrityError("Transaction manifest revision metadata is invalid");
  if (!canonicalTimestamp(value.createdAt) || typeof value.actor !== "string" || value.actor.length < 1 || value.actor.length > 256) throw new IntegrityError("Transaction manifest provenance is invalid");
  for (const side of ["before", "after"]) {
    if (!value[side] || Object.keys(value[side]).sort().join(",") !== "businessHash,softwareHash") throw new IntegrityError(`Transaction manifest ${side} checksums have an invalid shape`);
    for (const hash of Object.values(value[side])) if (!/^[a-f0-9]{64}$/u.test(hash)) throw new IntegrityError(`Transaction manifest ${side} checksum is invalid`);
  }
  for (const name of ["committedAt", "recoveredAt"]) if (name in value && !canonicalTimestamp(value[name])) throw new IntegrityError(`Transaction manifest ${name} is invalid`);
  if ("recoveryReason" in value && (typeof value.recoveryReason !== "string" || value.recoveryReason.length > 1000)) throw new IntegrityError("Transaction manifest recoveryReason is invalid");
}

function compareVersions(left, right) {
  const parse = (value) => {
    const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.exec(value ?? "");
    if (!match) throw new IntegrityError(`Invalid persisted schema version: ${value}`);
    return match.slice(1).map(Number);
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

function migrationPlan(version, migrations) {
  if (compareVersions(version, CURRENT_SCHEMA_VERSION) > 0) throw new IntegrityError(`Unsupported future schema version ${version}`);
  const plan = [];
  let cursor = version;
  const seen = new Set();
  while (cursor !== CURRENT_SCHEMA_VERSION) {
    if (seen.has(cursor)) throw new IntegrityError(`Migration cycle detected at ${cursor}`);
    seen.add(cursor);
    const migration = migrations.find(({ fromVersion }) => fromVersion === cursor);
    if (!migration) throw new IntegrityError(`No forward migration is registered from schema version ${cursor}`);
    if (compareVersions(migration.toVersion, cursor) <= 0) throw new IntegrityError(`Migration ${migration.id} is not forward-only`);
    plan.push(migration);
    cursor = migration.toVersion;
  }
  return plan;
}

function withoutVersion(record) {
  const copy = clone(record);
  delete copy.version;
  return copy;
}

function assertMonotonicTransition(before, after, allocated) {
  const issues = [];
  for (const level of ["business", "software"]) {
    if (after[level].nextRequirementNumber < before[level].value.nextRequirementNumber) issues.push({ path: `/${level}/nextRequirementNumber`, reason: "must never decrement" });
  }
  if (after.business.nextRelationshipNumber < before.business.value.nextRelationshipNumber || after.software.nextRelationshipNumber < before.software.value.nextRelationshipNumber) issues.push({ path: "/nextRelationshipNumber", reason: "must never decrement" });
  const pairs = [
    ["requirements", allocated.requirements],
    ["relationships", allocated.relationships],
  ];
  for (const [collection, allocatedIds] of pairs) {
    const oldRecords = new Map([...before.business.value[collection], ...before.software.value[collection]].map((record) => [record.id, record]));
    const newRecords = new Map([...after.business[collection], ...after.software[collection]].map((record) => [record.id, record]));
    for (const [id, oldRecord] of oldRecords) {
      const newRecord = newRecords.get(id);
      if (!newRecord) { issues.push({ path: `/${collection}/${id}`, reason: "governed records must be retired, not physically deleted" }); continue; }
      const changed = canonicalHash(withoutVersion(oldRecord)) !== canonicalHash(withoutVersion(newRecord));
      if (changed && newRecord.version !== oldRecord.version + 1) issues.push({ path: `/${collection}/${id}/version`, reason: "must increase by exactly one when an existing record changes" });
      if (!changed && newRecord.version !== oldRecord.version) issues.push({ path: `/${collection}/${id}/version`, reason: "must remain unchanged when record content is unchanged" });
    }
    for (const [id, newRecord] of newRecords) {
      if (!oldRecords.has(id) && !allocatedIds.has(id)) issues.push({ path: `/${collection}/${id}`, reason: "new identifiers must come from the transaction allocator" });
      if (!oldRecords.has(id) && newRecord.version !== 1) issues.push({ path: `/${collection}/${id}/version`, reason: "new records must start at version 1" });
    }
  }
  if (issues.length) throw new ValidationError(issues);
}

function assertConsistentPair(business, software) {
  if (business.value.schemaVersion !== software.value.schemaVersion) throw new IntegrityError("Canonical documents have different schema versions");
  const businessRevision = business.value.repositoryRevision ?? business.value.revision;
  const softwareRevision = software.value.repositoryRevision ?? software.value.revision;
  if (!Number.isInteger(businessRevision) || businessRevision < 0 || businessRevision !== softwareRevision) throw new IntegrityError("Canonical documents have different or invalid repository revisions");
}

function assertMigrationPair(documents, expectedVersion) {
  if (!documents?.business || !documents?.software || documents.business.schemaVersion !== expectedVersion || documents.software.schemaVersion !== expectedVersion) throw new IntegrityError(`Migration input is not a ${expectedVersion} canonical pair`);
  for (const level of ["business", "software"]) {
    if (!Array.isArray(documents[level].requirements) || !Array.isArray(documents[level].relationships)) throw new IntegrityError(`Migration input ${level} collections are invalid`);
  }
}

export class CanonicalJsonRepository {
  constructor(configuredRoot, options = {}) {
    this.root = normalizeRequirementsRoot(configuredRoot);
    this.policy = options.policy ? clone(options.policy) : null;
    this.policyValidated = false;
    this.lockOptions = options.lock ?? {};
    this.faultInjector = options.faultInjector ?? null;
  }

  async initialize(options = {}) {
    await mkdir(this.root, { recursive: true });
    this.root = await realpath(this.root);
    await assertNotSymlink(enginePath(this.root));
    for (const directory of ENGINE_DIRECTORIES) {
      const path = enginePath(this.root, directory);
      await assertNotSymlink(path);
      await mkdir(path, { recursive: true });
      await assertNotSymlink(path);
    }
    const release = await acquireProjectLock(enginePath(this.root, "locks", "repository.lock"), this.lockOptions);
    try {
      for (const filename of CANONICAL_FILENAMES) await assertNotSymlink(canonicalDocumentPath(this.root, filename));
      const existing = await Promise.all(CANONICAL_FILENAMES.map(async (filename) => {
        try { await lstat(canonicalDocumentPath(this.root, filename)); return true; }
        catch (error) { if (error.code === "ENOENT") return false; throw error; }
      }));
      if (existing.some(Boolean) && !existing.every(Boolean)) throw new IntegrityError("Refusing to initialize a repository with only one canonical document");
      await this.#installSchemasAndPolicy();
      if (!existing.some(Boolean)) {
        const business = createEmptyDocument("business");
        const software = createEmptyDocument("software");
        const businessBytes = canonicalBytes(business);
        const softwareBytes = canonicalBytes(software);
        await writeDurable(canonicalDocumentPath(this.root, "business-requirements.json"), businessBytes, { exclusive: true });
        await writeDurable(canonicalDocumentPath(this.root, "software-requirements.json"), softwareBytes, { exclusive: true });
        await this.#writeIntegrity({
          revision: 0,
          businessHash: sha256(businessBytes),
          softwareHash: sha256(softwareBytes),
          transactionHash: null,
        });
      } else if (options.reinitialize !== false) {
        await this.#recoverLocked();
        await this.#loadLocked();
      }
      const current = await this.#loadLocked();
      return { repositoryRevision: current.business.value.repositoryRevision, root: this.root };
    } finally { await release(); }
  }

  async open() {
    this.root = await realpath(this.root);
    await assertNotSymlink(enginePath(this.root));
    for (const directory of ENGINE_DIRECTORIES) await assertNotSymlink(enginePath(this.root, directory));
    for (const filename of CANONICAL_FILENAMES) await assertNotSymlink(canonicalDocumentPath(this.root, filename));
    await this.#loadPolicy();
    const release = await acquireProjectLock(enginePath(this.root, "locks", "repository.lock"), this.lockOptions);
    try { await this.#recoverLocked(); await this.#loadLocked(); }
    finally { await release(); }
    return this;
  }

  async read() {
    return this.#withLock(async () => {
      await this.#recoverLocked();
      const state = await this.#loadLocked();
      return { business: clone(state.business.value), software: clone(state.software.value) };
    });
  }

  async revision() {
    const documents = await this.read();
    return documents.business.repositoryRevision;
  }

  async execute(mutator, options = {}) {
    if (typeof mutator !== "function") throw new TypeError("Repository mutation must be a function");
    return this.#withLock(async () => {
      await this.#recoverLocked();
      const state = await this.#loadLocked();
      if (options.expectedRepositoryRevision !== undefined && options.expectedRepositoryRevision !== state.business.value.repositoryRevision) {
        throw new RepositoryError("VERSION_CONFLICT", "Expected repository revision does not match current revision", [{ path: "/expectedRepositoryRevision", reason: `current revision is ${state.business.value.repositoryRevision}` }]);
      }
      const business = clone(state.business.value);
      const software = clone(state.software.value);
      const allocation = this.#mutationContext(business, software);
      const result = await mutator({ business, software }, allocation.context);
      const unchanged = canonicalHash(business) === canonicalHash(state.business.value) && canonicalHash(software) === canonicalHash(state.software.value);
      if (unchanged) return { committed: false, repositoryRevision: business.repositoryRevision, result };
      const revision = state.business.value.repositoryRevision + 1;
      business.repositoryRevision = revision;
      software.repositoryRevision = revision;
      assertValidRepositoryDocuments(business, software, this.policy);
      assertMonotonicTransition(state, { business, software }, allocation.allocated);
      await this.#commitLocked(state, { business, software }, { actor: options.actor ?? "internal", faultInjector: options.faultInjector ?? this.faultInjector });
      return { committed: true, repositoryRevision: revision, result };
    });
  }

  async recover() {
    return this.#withLock(() => this.#recoverLocked());
  }

  async validate() {
    return this.#withLock(async () => {
      await this.#recoverLocked();
      const state = await this.#loadLocked();
      return { valid: true, repositoryRevision: state.business.value.repositoryRevision, checksums: { business: state.business.hash, software: state.software.hash } };
    });
  }

  async diagnose() {
    return this.#withLock(async () => {
      try {
        const transactions = await this.#manifests();
        await this.#recoverLocked();
        const state = await this.#loadLocked();
        return { healthy: true, repositoryRevision: state.business.value.repositoryRevision, transactionCount: transactions.length, pendingTransactions: transactions.filter(({ manifest }) => manifest.status === "prepared").length };
      } catch (error) {
        return { healthy: false, code: error.code ?? "INTERNAL_ERROR", message: error.message, details: error.details ?? [] };
      }
    });
  }

  async rebuildDerivedState() {
    return this.#withLock(async () => {
      await this.#recoverLocked();
      const state = await this.#loadLocked();
      const index = {
        repositoryRevision: state.business.value.repositoryRevision,
        requirementIds: [...state.business.value.requirements, ...state.software.value.requirements].map(({ id }) => id).sort(),
        relationshipIds: [...state.business.value.relationships, ...state.software.value.relationships].map(({ id }) => id).sort(),
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
      await replaceDurable(enginePath(this.root, "indexes", "repository.json"), canonicalBytes(index));
      return { repositoryRevision: index.repositoryRevision, requirements: index.requirementIds.length, relationships: index.relationshipIds.length };
    });
  }

  async previewMigrations(migrations = []) {
    return this.#withLock(async () => {
      await this.#recoverLocked();
      const state = await this.#loadRawLocked();
      return this.#prepareMigration(state, migrations);
    });
  }

  async migrate(migrations = [], options = {}) {
    return this.#withLock(async () => {
      await this.#recoverLocked();
      const state = await this.#loadRawLocked();
      const preview = this.#prepareMigration(state, migrations);
      if (!preview.required) return { committed: false, ...preview };
      const migrationRevision = (state.business.value.repositoryRevision ?? state.business.value.revision) + 1;
      const migrationId = `${String(migrationRevision).padStart(12, "0")}-${randomUUID()}`;
      const backupDirectory = enginePath(this.root, "versions", "migrations", migrationId);
      await mkdir(backupDirectory, { recursive: true });
      await Promise.all([
        writeDurable(join(backupDirectory, "business-requirements.json"), state.business.bytes, { exclusive: true }),
        writeDurable(join(backupDirectory, "software-requirements.json"), state.software.bytes, { exclusive: true }),
      ]);
      const record = {
        actor: options.actor ?? "operator",
        afterChecksums: preview.afterChecksums,
        beforeChecksums: preview.beforeChecksums,
        counts: preview.counts,
        createdAt: new Date().toISOString(),
        migrations: preview.migrations,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sourceSchemaVersion: preview.sourceSchemaVersion,
        targetSchemaVersion: preview.targetSchemaVersion,
        toolVersion: options.toolVersion ?? "0.1.0",
        warnings: preview.warnings,
      };
      await writeDurable(join(backupDirectory, "migration.json"), canonicalBytes(record), { exclusive: true });
      await syncDirectory(backupDirectory);
      await this.#commitLocked(state, preview.documents, { actor: options.actor ?? "operator:migration", faultInjector: options.faultInjector ?? this.faultInjector });
      const { documents, ...summary } = preview;
      return { committed: true, backupDirectory, migrationId, repositoryRevision: documents.business.repositoryRevision, ...summary };
    });
  }

  async restoreMigrationBackup(migrationId) {
    if (!/^[0-9]{12}-[a-f0-9-]{36}$/u.test(migrationId)) throw new TypeError("Migration backup identifier is invalid");
    return this.#withLock(async () => {
      await this.#recoverLocked();
      const directory = enginePath(this.root, "versions", "migrations", migrationId);
      const recordPath = join(directory, "migration.json");
      const [business, software, record] = await Promise.all([
        readCanonical(join(directory, "business-requirements.json")),
        readCanonical(join(directory, "software-requirements.json")),
        readCanonical(recordPath, 64_000),
      ]);
      if (business.hash !== record.value.beforeChecksums.business || software.hash !== record.value.beforeChecksums.software) throw new IntegrityError("Migration backup checksum mismatch");
      assertConsistentPair(business, software);
      await this.#installCanonical(business.bytes, "business-requirements.json", `${migrationId}-restore-business`);
      await this.#installCanonical(software.bytes, "software-requirements.json", `${migrationId}-restore-software`);
      const restoredRevision = business.value.repositoryRevision ?? business.value.revision;
      await this.#writeIntegrity({ revision: restoredRevision, businessHash: business.hash, softwareHash: software.hash, transactionHash: null });
      record.value.restoredAt = new Date().toISOString();
      await replaceDurable(recordPath, canonicalBytes(record.value));
      return { repositoryRevision: restoredRevision, restoredSchemaVersion: business.value.schemaVersion };
    });
  }

  #mutationContext(business, software) {
    const allocated = { relationships: new Set(), requirements: new Set() };
    const context = Object.freeze({
      allocateRequirementId(level) {
        const document = level === "business" ? business : level === "software" ? software : null;
        if (!document) throw new TypeError(`Unknown requirement level: ${level}`);
        if (document.nextRequirementNumber > MAX_IDENTIFIER_NUMBER) throw new RangeError(`${level} requirement identifier space is exhausted`);
        const id = formatRequirementId(level, document.nextRequirementNumber);
        document.nextRequirementNumber += 1;
        allocated.requirements.add(id);
        return id;
      },
      allocateRelationshipId() {
        if (business.nextRelationshipNumber !== software.nextRelationshipNumber) throw new IntegrityError("Relationship allocators disagree");
        if (business.nextRelationshipNumber > MAX_IDENTIFIER_NUMBER) throw new RangeError("Relationship identifier space is exhausted");
        const id = formatRelationshipId(business.nextRelationshipNumber);
        business.nextRelationshipNumber += 1;
        software.nextRelationshipNumber += 1;
        allocated.relationships.add(id);
        return id;
      },
    });
    return { allocated, context };
  }

  async #withLock(operation) {
    this.root = await realpath(this.root);
    await assertNotSymlink(enginePath(this.root));
    for (const directory of ENGINE_DIRECTORIES) await assertNotSymlink(enginePath(this.root, directory));
    for (const filename of CANONICAL_FILENAMES) await assertNotSymlink(canonicalDocumentPath(this.root, filename));
    await this.#loadPolicy();
    const release = await acquireProjectLock(enginePath(this.root, "locks", "repository.lock"), this.lockOptions);
    try { return await operation(); }
    finally { await release(); }
  }

  async #loadPolicy() {
    if (!this.policy) {
      const configured = enginePath(this.root, "config", "policy.v1.json");
      try { this.policy = (await readCanonical(configured, 1_000_000)).value; }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        this.policy = parseStrictJson(await readFile(defaultPolicyUrl), { maximumBytes: 1_000_000 });
      }
    }
    if (!this.policyValidated) {
      const issues = validatePolicy(this.policy);
      if (issues.length) throw new IntegrityError(`Repository policy is invalid: ${issues.join("; ")}`);
      this.policyValidated = true;
    }
  }

  async #installSchemasAndPolicy() {
    for (const name of ["repository-common.schema.json", "business-requirements.schema.json", "software-requirements.schema.json", "repository-config.schema.json"]) {
      const destination = enginePath(this.root, "schemas", "v1", name);
      await assertNotSymlink(dirname(destination));
      await assertNotSymlink(destination);
      try { await lstat(destination); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(new URL(name, schemaDirectoryUrl), destination, constants.COPYFILE_EXCL);
      }
    }
    const policyPath = enginePath(this.root, "config", "policy.v1.json");
    await assertNotSymlink(policyPath);
    try { await lstat(policyPath); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      const policy = this.policy ?? parseStrictJson(await readFile(defaultPolicyUrl), { maximumBytes: 1_000_000 });
      await writeDurable(policyPath, canonicalBytes(policy), { exclusive: true });
    }
    await this.#loadPolicy();
  }

  async #loadLocked() {
    try {
      const business = await readCanonical(canonicalDocumentPath(this.root, "business-requirements.json"));
      const software = await readCanonical(canonicalDocumentPath(this.root, "software-requirements.json"));
      assertValidRepositoryDocuments(business.value, software.value, this.policy);
      const integrity = await readCanonical(enginePath(this.root, "versions", "current.json"), 64_000);
      assertIntegrityRecord(integrity.value);
      if (integrity.value.revision !== business.value.repositoryRevision || integrity.value.businessHash !== business.hash || integrity.value.softwareHash !== software.hash) {
        throw new IntegrityError("Canonical document checksums do not match the committed integrity record");
      }
      await this.#verifyTransactionHash(integrity.value);
      return { business, software, integrity: integrity.value };
    } catch (error) {
      await this.#quarantineCurrent(error.message);
      throw error;
    }
  }

  async #loadRawLocked() {
    const business = await readCanonical(canonicalDocumentPath(this.root, "business-requirements.json"));
    const software = await readCanonical(canonicalDocumentPath(this.root, "software-requirements.json"));
    assertConsistentPair(business, software);
    const integrity = await readCanonical(enginePath(this.root, "versions", "current.json"), 64_000);
    assertIntegrityRecord(integrity.value);
    if (integrity.value.revision !== (business.value.repositoryRevision ?? business.value.revision) || integrity.value.businessHash !== business.hash || integrity.value.softwareHash !== software.hash) throw new IntegrityError("Canonical document checksums do not match the committed integrity record");
    await this.#verifyTransactionHash(integrity.value);
    return { business, software, integrity: integrity.value };
  }

  async #verifyTransactionHash(integrity) {
    if (integrity.transactionHash === null) return;
    const match = (await this.#manifests()).find(({ manifest }) => manifest.status === "committed" && manifest.afterRevision === integrity.revision && transactionHash(manifest) === integrity.transactionHash);
    if (!match) throw new IntegrityError("Committed transaction hash does not match a durable manifest");
  }

  #prepareMigration(state, migrations) {
    const sourceVersion = state.business.value.schemaVersion;
    const plan = migrationPlan(sourceVersion, migrations);
    if (!plan.length) return {
      afterChecksums: { business: state.business.hash, software: state.software.hash },
      beforeChecksums: { business: state.business.hash, software: state.software.hash },
      counts: { requirements: state.business.value.requirements.length + state.software.value.requirements.length, relationships: state.business.value.relationships.length + state.software.value.relationships.length },
      migrations: [], required: false, sourceSchemaVersion: sourceVersion, targetSchemaVersion: sourceVersion, warnings: [],
    };
    let documents = { business: clone(state.business.value), software: clone(state.software.value) };
    const warnings = [];
    const migrationSummaries = [];
    for (const migration of plan) {
      assertMigrationPair(documents, migration.fromVersion);
      migration.validateBefore?.(clone(documents));
      const stepBeforeChecksums = { business: canonicalHash(documents.business), software: canonicalHash(documents.software) };
      const migrated = migration.migrate(clone(documents));
      if (!migrated?.business || !migrated?.software) throw new IntegrityError(`Migration ${migration.id} did not return both canonical documents`);
      documents = migrated;
      documents.business.schemaVersion = migration.toVersion;
      documents.software.schemaVersion = migration.toVersion;
      assertMigrationPair(documents, migration.toVersion);
      migration.validateAfter?.(clone(documents));
      if (migration.toVersion === CURRENT_SCHEMA_VERSION) {
        const validationCopy = clone(documents);
        const revision = state.business.value.repositoryRevision ?? state.business.value.revision;
        validationCopy.business.repositoryRevision = revision;
        validationCopy.software.repositoryRevision = revision;
        assertValidRepositoryDocuments(validationCopy.business, validationCopy.software, this.policy);
      }
      const repeated = migration.migrate(clone(documents));
      repeated.business.schemaVersion = migration.toVersion;
      repeated.software.schemaVersion = migration.toVersion;
      if (canonicalHash(repeated) !== canonicalHash(documents)) throw new IntegrityError(`Migration ${migration.id} is not idempotent`);
      const stepWarnings = [...(migration.warnings ?? [])];
      migrationSummaries.push({
        afterChecksums: { business: canonicalHash(documents.business), software: canonicalHash(documents.software) },
        beforeChecksums: stepBeforeChecksums,
        counts: { requirements: documents.business.requirements.length + documents.software.requirements.length, relationships: documents.business.relationships.length + documents.software.relationships.length },
        fromVersion: migration.fromVersion,
        id: migration.id,
        toVersion: migration.toVersion,
        warnings: stepWarnings,
      });
      warnings.push(...stepWarnings);
    }
    const targetRevision = (state.business.value.repositoryRevision ?? state.business.value.revision) + 1;
    documents.business.repositoryRevision = targetRevision;
    documents.software.repositoryRevision = targetRevision;
    assertValidRepositoryDocuments(documents.business, documents.software, this.policy);
    return {
      afterChecksums: { business: canonicalHash(documents.business), software: canonicalHash(documents.software) },
      beforeChecksums: { business: state.business.hash, software: state.software.hash },
      counts: { requirements: documents.business.requirements.length + documents.software.requirements.length, relationships: documents.business.relationships.length + documents.software.relationships.length },
      documents,
      migrations: migrationSummaries,
      required: true,
      sourceSchemaVersion: sourceVersion,
      targetSchemaVersion: CURRENT_SCHEMA_VERSION,
      warnings,
    };
  }

  async #writeIntegrity(value) {
    await replaceDurable(enginePath(this.root, "versions", "current.json"), canonicalBytes({ schemaVersion: CURRENT_SCHEMA_VERSION, ...value }));
  }

  async #commitLocked(before, after, options) {
    const transactionId = `${String(after.business.repositoryRevision).padStart(12, "0")}-${randomUUID()}`;
    const transactionDirectory = enginePath(this.root, "transactions", transactionId);
    await mkdir(transactionDirectory, { recursive: false });
    const beforeBusiness = before.business.bytes;
    const beforeSoftware = before.software.bytes;
    const afterBusiness = canonicalBytes(after.business);
    const afterSoftware = canonicalBytes(after.software);
    const paths = {
      beforeBusiness: join(transactionDirectory, "before-business.json"),
      beforeSoftware: join(transactionDirectory, "before-software.json"),
      afterBusiness: join(transactionDirectory, "after-business.json"),
      afterSoftware: join(transactionDirectory, "after-software.json"),
      manifest: join(transactionDirectory, "manifest.json"),
    };
    await options.faultInjector?.("before-candidates");
    await Promise.all([
      writeDurable(paths.beforeBusiness, beforeBusiness, { exclusive: true }),
      writeDurable(paths.beforeSoftware, beforeSoftware, { exclusive: true }),
      writeDurable(paths.afterBusiness, afterBusiness, { exclusive: true }),
      writeDurable(paths.afterSoftware, afterSoftware, { exclusive: true }),
    ]);
    await syncDirectory(transactionDirectory);
    await options.faultInjector?.("after-candidates");
    const manifest = {
      actor: options.actor,
      after: { businessHash: sha256(afterBusiness), softwareHash: sha256(afterSoftware) },
      afterRevision: after.business.repositoryRevision,
      before: { businessHash: sha256(beforeBusiness), softwareHash: sha256(beforeSoftware) },
      beforeRevision: before.business.value.repositoryRevision ?? before.business.value.revision,
      createdAt: new Date().toISOString(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      status: "prepared",
      transactionId,
    };
    await writeDurable(paths.manifest, canonicalBytes(manifest), { exclusive: true });
    await syncDirectory(transactionDirectory);
    await options.faultInjector?.("after-prepared");
    await this.#installCanonical(afterBusiness, "business-requirements.json", transactionId);
    await options.faultInjector?.("after-business-rename");
    await this.#installCanonical(afterSoftware, "software-requirements.json", transactionId);
    await options.faultInjector?.("after-software-rename");
    await this.#writeIntegrity({ revision: manifest.afterRevision, businessHash: manifest.after.businessHash, softwareHash: manifest.after.softwareHash, transactionHash: transactionHash(manifest) });
    await options.faultInjector?.("after-integrity");
    manifest.status = "committed";
    manifest.committedAt = new Date().toISOString();
    await replaceDurable(paths.manifest, canonicalBytes(manifest), transactionId);
    await options.faultInjector?.("after-committed");
  }

  async #installCanonical(bytes, filename, token) {
    const path = canonicalDocumentPath(this.root, filename);
    const temporary = join(this.root, `.${filename}.${token}.tmp`);
    try { await lstat(temporary); throw new IntegrityError(`Transaction temporary file already exists: ${temporary}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await writeDurable(temporary, bytes, { exclusive: true });
    await rename(temporary, path);
    await syncDirectory(this.root);
  }

  async #manifests() {
    const root = enginePath(this.root, "transactions");
    let entries;
    try { entries = await readdir(root, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const results = [];
    for (const entry of entries.filter((item) => item.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(root, entry.name, "manifest.json");
      try {
        const manifest = (await readCanonical(path, 64_000)).value;
        assertManifest(manifest, entry.name);
        results.push({ directory: join(root, entry.name), manifest, path });
      }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return results;
  }

  async #recoverLocked() {
    const actions = [];
    for (const entry of await this.#manifests()) {
      const { directory, manifest, path } = entry;
      if (manifest.status !== "prepared") continue;
      const afterPaths = [join(directory, "after-business.json"), join(directory, "after-software.json")];
      const beforePaths = [join(directory, "before-business.json"), join(directory, "before-software.json")];
      try {
        const [business, software] = await Promise.all(afterPaths.map((candidate) => readCanonical(candidate)));
        if (business.hash !== manifest.after.businessHash || software.hash !== manifest.after.softwareHash) throw new IntegrityError("Prepared transaction candidate checksum mismatch");
        if (business.value.schemaVersion === CURRENT_SCHEMA_VERSION) assertValidRepositoryDocuments(business.value, software.value, this.policy);
        else assertConsistentPair(business, software);
        await this.#installCanonical(business.bytes, "business-requirements.json", `${manifest.transactionId}-recovery-business`);
        await this.#installCanonical(software.bytes, "software-requirements.json", `${manifest.transactionId}-recovery-software`);
        await this.#writeIntegrity({ revision: manifest.afterRevision, businessHash: business.hash, softwareHash: software.hash, transactionHash: transactionHash(manifest) });
        manifest.status = "committed";
        manifest.recoveredAt = new Date().toISOString();
        await replaceDurable(path, canonicalBytes(manifest));
        actions.push({ action: "rolled-forward", transactionId: manifest.transactionId, revision: manifest.afterRevision });
      } catch (candidateError) {
        await this.#quarantineFiles(afterPaths, `transaction-${manifest.transactionId}`);
        const [business, software] = await Promise.all(beforePaths.map((candidate) => readCanonical(candidate)));
        if (business.hash !== manifest.before.businessHash || software.hash !== manifest.before.softwareHash) throw new IntegrityError(`Neither side of transaction ${manifest.transactionId} is recoverable`);
        if (business.value.schemaVersion === CURRENT_SCHEMA_VERSION) assertValidRepositoryDocuments(business.value, software.value, this.policy);
        else assertConsistentPair(business, software);
        await this.#installCanonical(business.bytes, "business-requirements.json", `${manifest.transactionId}-rollback-business`);
        await this.#installCanonical(software.bytes, "software-requirements.json", `${manifest.transactionId}-rollback-software`);
        manifest.status = "rolled-back";
        manifest.recoveredAt = new Date().toISOString();
        manifest.recoveryReason = candidateError.message.slice(0, 1000);
        await this.#writeIntegrity({ revision: manifest.beforeRevision, businessHash: business.hash, softwareHash: software.hash, transactionHash: null });
        await replaceDurable(path, canonicalBytes(manifest));
        actions.push({ action: "rolled-back", transactionId: manifest.transactionId, revision: manifest.beforeRevision });
      }
    }
    return actions;
  }

  async #quarantineFiles(paths, label) {
    const directory = enginePath(this.root, "quarantine", `${new Date().toISOString().replaceAll(":", "-")}-${label}-${randomUUID()}`);
    await mkdir(directory, { recursive: true });
    for (const path of paths) {
      try { await copyFile(path, join(directory, basename(path)), constants.COPYFILE_EXCL); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    return directory;
  }

  async #quarantineCurrent(reason) {
    const directory = await this.#quarantineFiles(CANONICAL_FILENAMES.map((filename) => canonicalDocumentPath(this.root, filename)), "current");
    await writeDurable(join(directory, "reason.json"), canonicalBytes({ detectedAt: new Date().toISOString(), reason: String(reason).slice(0, 1000) }), { exclusive: true });
  }
}
