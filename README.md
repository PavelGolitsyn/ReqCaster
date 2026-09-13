# speccaster

Speccaster is a contract-first requirements management engine for engineering
teams that work with AI agents and automated clients. It turns business and
software requirements into governed, versioned records that tools can query and
change safely instead of treating a collection of documents as unstructured
text.

## What it is

Speccaster is a headless Node.js engine with versioned MCP and HTTP contracts.
It sits between agents or approved applications and a project’s requirements
repository. The engine validates every request, applies authorization and
workflow policy, performs atomic writes, and records enough history and
provenance to explain who changed what, why, and at which version.

It is intended to be embedded in a trusted MCP host or HTTP service. It is not a
general-purpose document editor, graphical requirements UI, issue tracker, test
runner, or complete ALM system. External designs, tests, risks, regulations, and
implementation work are linked as governed references while their source
systems remain authoritative.

## What it is for

Use Speccaster when people and agents need to share one reliable requirements
source of truth without allowing direct or ambiguous edits. Typical uses
include:

- giving an implementation or test agent a small, permission-filtered set of
  exact requirements instead of an entire specification dump;
- capturing new business and software obligations with stable IDs, validation,
  ownership, rationale, acceptance criteria, and human accountability;
- tracing requirements to upstream needs, downstream implementation, tests,
  evidence, risks, regulations, releases, and other external artifacts;
- controlling lifecycle transitions and material changes after approval;
- assessing the impact of a proposed change before it is committed;
- creating reproducible baselines, reviews, verification records, reports, and
  audit evidence for release or compliance decisions;
- importing existing requirements and governing AI-generated proposals without
  allowing either source to bypass human review.

## What it can do

- **Author requirements:** validate drafts, allocate `BR-` and `SR-` IDs, create,
  update, bulk-edit, and retire requirements with optimistic concurrency and
  durable idempotency.
- **Read efficiently:** perform exact lookups, bounded full-text search,
  structured filtering, field projection, pagination, and current, historical,
  or baseline reads while enforcing repository, component, and field scopes.
- **Manage traceability:** create typed links, traverse them in either direction,
  find coverage gaps and orphans, calculate bounded impact, and mark links
  suspect when relevant content changes.
- **Govern decisions:** enforce policy-versioned lifecycle transitions,
  controlled change requests, impact dispositions, human decisions, previewed
  implementation, and closure gates.
- **Preserve evidence:** reconstruct item and relationship history, maintain a
  hash-chained audit log, create immutable checksummed baselines, compare
  versions, and verify integrity.
- **Support verification:** freeze review scope at exact versions, record review
  findings and human decisions, manage objective verification plans and accepted
  evidence, and detect stale evidence after material changes.
- **Exchange and reuse data:** preview and commit JSON, CSV, and ReqIF imports;
  generate governed exports; adopt requirements by reference or clone; and
  propagate reusable changes with explicit divergence handling.
- **Govern AI assistance:** store attributable AI proposals and suggestions,
  require explicit accountable-human acceptance, and preserve subsequent human
  edits in provenance.
- **Operate safely:** enforce bounded queues, deadlines, cancellation, safe
  telemetry, health checks, integrity verification, backup and isolated restore,
  migration preview, derived-index rebuilds, and metadata-only support bundles.

## Storage model

The engine stores the current state in two canonical files:

- `business-requirements.json`
- `software-requirements.json`

Treat those files as an engine-owned database. Clients must use the application
services through the MCP or HTTP adapter; editing the JSON directly causes an
integrity failure. Supporting audit, history, baseline, configuration, index,
and recovery data lives under `<requirements-root>/.engine/`.

## Requirements

- Node.js 22 or newer
- npm
- An absolute path for each requirements repository

Install and verify the checkout:

```sh
npm ci
npm run ci
```

## Quick start

Create an empty requirements repository. The directory may be new, but its path
must be absolute:

```sh
npm run repository -- init /absolute/path/to/requirements
npm run repository -- validate /absolute/path/to/requirements
```

Initialization creates both canonical documents, installs the current schemas
and policy under `.engine/`, initializes the audit log, and records revision 0.
Running `init` again opens and validates an existing repository; it does not
replace its contents.

Speccaster is currently an embeddable ESM engine, not a standalone HTTP or MCP
daemon. A host application opens the repository, wires the required service
families into `ApplicationDispatcher`, maps credentials to trusted identities,
and exposes the dispatcher through `createMcpAdapter` or `createHttpAdapter`.
The adapters expose transport-neutral `callTool`/`dispatch` methods; the host is
responsible for its MCP server or HTTP listener, TLS, and credential validation.

This minimal MCP example enables create, get, list, and search:

```js
import { randomUUID } from "node:crypto";

import { createMcpAdapter } from "./src/adapters/mcp/index.js";
import {
  CanonicalJsonRepository,
  PersistentSearchIndex,
  TamperEvidentAuditLog,
} from "./src/adapters/repository/index.js";
import { AuthorizationPolicyEvaluator } from "./src/application/authorization.js";
import {
  staticIdentityLookup,
  TrustedIdentityResolver,
} from "./src/application/identity.js";
import {
  createAuthoringServices,
  createReadServices,
} from "./src/application/services/index.js";
import { ApplicationDispatcher } from "./src/application/services/dispatcher.js";

const root = "/absolute/path/to/requirements";
const searchIndex = new PersistentSearchIndex(root);
const audit = new TamperEvidentAuditLog(root);
const repository = new CanonicalJsonRepository(root, { audit, searchIndex });
await repository.open();

const policy = await repository.getPolicy();
const authorization = new AuthorizationPolicyEvaluator({
  policyVersion: policy.configurationVersion,
  repositoryId: "default",
});
const serviceOptions = { audit, authorization, policy, repository, searchIndex };
const services = {
  ...createReadServices(serviceOptions),
  ...createAuthoringServices(serviceOptions),
};
const dispatcher = new ApplicationDispatcher({
  audit,
  authorization,
  clock: { now: () => new Date().toISOString() },
  services,
});

// Replace this static mapping with verification against your trusted identity
// provider. Request bodies never supply their own role or principal.
const credential = "development-credential";
const identity = new TrustedIdentityResolver({
  audience: "speccaster",
  issuers: ["development"],
  lookup: staticIdentityLookup([[credential, {
    agentId: "agent:requirements-manager",
    authentication: { audience: "speccaster", issuer: "development" },
    principal: { id: "human:owner" },
    role: "requirements-manager",
  }]]),
});
const mcp = createMcpAdapter(dispatcher, { identity });

const created = await mcp.callTool("requirements.create", {
  schemaVersion: "1.0.0",
  correlationId: randomUUID(),
  idempotencyKey: randomUUID(),
  expectedRepositoryRevision: await repository.revision(),
  draft: {
    level: "business",
    statement: "The product shall preserve approved settings after restart.",
    category: "functional",
    owner: "team:product",
    priority: "high",
    rationale: "Users expect their approved configuration to persist.",
    source: "product-policy",
  },
}, credential);

const found = await mcp.callTool("requirements.get", {
  schemaVersion: "1.0.0",
  correlationId: randomUUID(),
  id: created.data.record.id,
  preset: "authoring",
  relationships: "counts",
}, credential);

console.log(found.data);
```

To enable the other Stage 0–9 service families, import their factories from
`src/application/services/index.js` and add them to the same service map:

```js
const services = {
  ...createReadServices(serviceOptions),
  ...createAuthoringServices(serviceOptions),
  ...createTraceabilityServices(serviceOptions),
  ...createWorkflowServices(serviceOptions),
  ...createHistoryBaselineServices(serviceOptions),
  ...createReviewVerificationReportingServices(serviceOptions),
  ...createImportExchangeServices(serviceOptions),
  ...createReuseAiGovernanceServices(serviceOptions),
};
```

Pass shared persistent collaborators where applicable: a
`TamperEvidentAuditLog`, `ImmutableBaselineStore`, `PersistentSearchIndex`, and
an authorization evaluator. For historical reads, also provide a snapshot
provider that maps baseline and item-version reads to those stores. Production
hosts should additionally configure `BoundedExecutionGate`,
`OperationalTelemetry`, and `EngineHealthService` from `src/operations/`.

Use `createHttpAdapter(dispatcher, { identity, health })` in the same way when
the hosting application exposes HTTP. The normative tool definitions and HTTP
shapes are committed in:

- [`generated/v1/mcp-tools.json`](generated/v1/mcp-tools.json)
- [`generated/v1/openapi.json`](generated/v1/openapi.json)
- [`generated/v1/schemas/`](generated/v1/schemas/)

## Calling the engine

Every request includes `schemaVersion: "1.0.0"` and a caller-generated
`correlationId`. Mutations also include:

- an `idempotencyKey` of at least eight characters;
- `expectedRepositoryRevision` for repository-level optimistic concurrency;
- `expectedVersion` when changing an existing governed record.

The engine allocates stable `BR-000001`, `SR-000001`, and relationship IDs.
Clients do not choose IDs or creation provenance. Successful responses echo the
schema version, correlation ID, and resulting repository revision. Retry a
mutation with the same identity, idempotency key, and request content to replay
the stored result safely. On `VERSION_CONFLICT`, reread the affected state and
submit a newly reviewed request; do not silently overwrite it.

Search compactly first, then fetch only the selected records:

```js
const candidates = await mcp.callTool("requirements.search", {
  schemaVersion: "1.0.0",
  correlationId: randomUUID(),
  query: "preserve settings",
  filters: { status: ["proposed", "approved"] },
  projection: ["id", "shortLabel", "status"],
  limit: 20,
}, credential);

const details = await mcp.callTool("requirements.get", {
  schemaVersion: "1.0.0",
  correlationId: randomUUID(),
  ids: candidates.data.items.map(({ id }) => id),
  preset: "verification",
  relationships: "summary",
}, credential);
```

Pagination cursors are opaque and pinned to the repository revision,
configuration, query, and authorization scope. Use `page.nextCursor` unchanged
in the next request. Preview/commit workflows for bulk edits, imports, controlled
changes, and reuse propagation return short-lived actor-bound tokens; commit
exactly the accepted preview, and obtain a new preview after expiry or any
concurrent write.

## Roles

| Role | Access |
| --- | --- |
| `requirements-manager` | Read, validate, author, decide, baseline, import, configure, and audit, subject to workflow policy |
| `tester` | Read and validate drafts without persistence |
| `implementer` | Read and validate drafts without persistence |
| `reviewer` | Read and return non-persistent findings; cannot approve |

The transport must derive `agentId`, role, accountable human principal, expiry,
and optional repository/component/field scopes from a verified credential.
Role or principal claims in a request body are ignored. Lifecycle decisions,
review decisions, evidence acceptance, change approval, and exceptions require
an authenticated accountable human principal.

## Operator commands

Repository commands print canonical JSON and return a non-zero exit code on
failure:

```sh
npm run repository -- validate /absolute/path/to/requirements
npm run repository -- diagnose /absolute/path/to/requirements
npm run repository -- integrity-check /absolute/path/to/requirements
npm run repository -- rebuild-index /absolute/path/to/requirements
npm run repository -- rotate-audit /absolute/path/to/requirements
```

Migration and recovery commands:

```sh
npm run repository -- migration-preview /absolute/path/to/requirements
npm run repository -- migrate /absolute/path/to/requirements
npm run repository -- restore-migration /absolute/path/to/requirements MIGRATION_ID
npm run repository -- recover /absolute/path/to/requirements
```

Backup and support commands require explicit absolute destinations. Restore
always targets a new, empty directory; never restore over the live repository:

```sh
npm run repository -- backup /absolute/path/to/requirements /absolute/path/to/backup
npm run repository -- verify-backup /absolute/path/to/backup
npm run repository -- restore /absolute/path/to/backup /absolute/path/to/empty-restore-root
npm run repository -- support-bundle /absolute/path/to/requirements /absolute/path/to/support.json
```

Keep backups encrypted outside the live requirements root. Validate a restored
copy, its audit chain, its baselines, and its rebuilt index before cutover. See
the [backup and recovery runbook](docs/operators/backup-and-recovery.md) and
[break-glass procedure](docs/operators/break-glass-recovery.md).

## Configuration

The default governed policy is [`config/policy.v1.json`](config/policy.v1.json).
Role permissions are documented in
[`config/authorization.v1.json`](config/authorization.v1.json), and bounded
admission, backup objectives, and telemetry defaults are in
[`config/production.v1.json`](config/production.v1.json). Initialization copies
the applicable repository policy into `.engine/`. Treat that installed copy as
engine-owned state, and version and validate policy changes before deployment.

For production, run one repository per dedicated non-login service account,
restrict filesystem access to the engine process, authenticate at the transport
edge, terminate TLS 1.2 or newer, source secrets from a secret manager, encrypt
repository and backup volumes as required, and keep request/response bodies out
of operational telemetry. The complete controls are in
[`docs/production/security-and-deployment-hardening.md`](docs/production/security-and-deployment-hardening.md).

## Feature guides

- [Reads and search](docs/engine/search-and-read-semantics.md)
- [Controlled authoring and quality](docs/engine/controlled-authoring-guide.md)
- [Traceability, coverage, and impact](docs/engine/traceability-and-impact-guide.md)
- [Lifecycle and controlled changes](docs/engine/workflow-and-change-control-guide.md)
- [History, baselines, comparison, and audit](docs/engine/history-baselines-and-audit-guide.md)
- [Reviews, verification, reports, and metrics](docs/engine/reviews-verification-and-reporting-guide.md)
- [Import, export, reuse, and AI governance](docs/engine/import-exchange-reuse-ai-governance-guide.md)
- [Production operations and incident response](docs/production/operations-and-incident-response.md)

The staged design and acceptance criteria are in the
[`docs/engine/implementation-plan/`](docs/engine/implementation-plan/) directory.

## Development

```sh
npm run contracts:generate   # regenerate committed MCP/OpenAPI contracts
npm run contracts:check      # fail if generated contracts drift
npm test                     # run the Node test suite
npm run ci                   # format, lint, schema, contract, policy, security, tests
npm run benchmark:search -- 100000
npm run benchmark:production -- 100000 15
```

The architecture contract starts at
[`docs/architecture/README.md`](docs/architecture/README.md), with accepted
decisions under
[`docs/architecture/decisions/`](docs/architecture/decisions/README.md).
