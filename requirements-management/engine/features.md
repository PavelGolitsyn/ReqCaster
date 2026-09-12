# Essential Capabilities of Requirements Management Software

## Purpose

This document defines the product-neutral capabilities expected from software used to manage requirements for complex products, systems, and software. It focuses on observable behavior rather than vendor terminology.

The words **must**, **should**, and **may** have the following meanings:

- **Must**: required for dependable requirements management.
- **Should**: strongly recommended; omission needs an explicit justification.
- **May**: useful when the organization, project, or regulatory context calls for it.

## 1. Authoritative Requirements Repository

### Capabilities

- Store requirements as discrete, addressable items rather than only as rows or passages in documents.
- Maintain one authoritative current version of each item.
- Support configurable item types, such as stakeholder need, system requirement, software requirement, interface requirement, risk control, test case, and decision.
- Organize items into hierarchies, collections, components, releases, and projects.
- Store structured attributes, attachments, rationale, source, assumptions, and acceptance criteria with each item.

### Rules

1. Every managed item must have a unique, persistent identifier that does not change when the item is moved or renamed.
2. The repository must distinguish an item's content from its metadata and relationships.
3. Required attributes and allowed values must be configurable by item type.
4. The current approved content must be clearly distinguishable from drafts and obsolete versions.
5. A requirement should record why it exists and where it came from, not only what it says.
6. Deleting or retiring an item must not silently erase its history or leave undetected broken links.

### Example

`SYS-042` is stored as a system requirement with owner, priority, safety classification, rationale, source stakeholder need, target release, and verification method. Moving it from “Power” to “Energy Management” does not change its identifier or history.

## 2. Structured Authoring and Requirements Quality

### Capabilities

- Create and edit requirements individually or in structured groups.
- Provide templates and field validation for different requirement types.
- Support tables, units, figures, equations, attachments, and references where necessary.
- Search, filter, sort, and bulk-edit requirements using their attributes.
- Import existing content while preserving the distinction between individual requirements.

### Rules

1. Authoring rules must be able to require fields, constrain values, and validate formats.
2. The system should help authors identify ambiguity, missing values, inconsistent terminology, and requirements that are not objectively verifiable.
3. Automated quality checks must remain advisory until a responsible person accepts a change.
4. Bulk operations must preview their scope and produce the same audit history as individual edits.
5. Import must report rejected, transformed, duplicated, or incomplete records.

### Example

An author enters “The controller should respond quickly.” The tool flags the weak term and missing measurable limit. The author revises it to “The controller shall issue a shutdown command within 100 ms after detecting an overcurrent condition.”

## 3. Traceability and Relationship Management

### Capabilities

- Create typed, directional links among needs, requirements, architecture, design, risks, controls, implementation work, tests, results, defects, and releases.
- Navigate every relationship in both directions.
- Define a traceability model that states which item types may or must be related.
- Visualize chains across multiple levels and engineering disciplines.
- Produce a requirements traceability matrix and coverage views from live repository data.
- Detect missing, invalid, duplicate, and suspect relationships.

### Rules

1. A link must identify both endpoints and its relationship type.
2. Users must be able to travel upstream to a requirement's origin and downstream to its implementation and verification evidence.
3. The configured traceability model must be machine-checkable; it must not exist only as process documentation.
4. When an item changes, related items must be marked for impact assessment according to configurable rules.
5. The system must not silently claim that a changed relationship remains valid.
6. Coverage calculations must state their scope, relationship rules, and treatment of excluded or not-applicable items.
7. Trace reports must be generated from the current governed repository or from an explicitly named baseline.

### Example

A stakeholder need links to two system requirements. Each system requirement links to design elements, risk controls, and verification cases. When one system requirement changes, its test cases and risk control are marked suspect, while unrelated items remain unchanged.

## 4. Change Control and Impact Analysis

### Capabilities

- Record proposals, decisions, approvals, implementation status, and rationale for changes.
- Compare item versions at field level.
- Calculate and display the downstream and upstream scope of a proposed change.
- Notify responsible users of affected items.
- Support configurable change-control workflows and change control board review.

### Rules

1. Every committed change must record who made it, when it was made, and what changed.
2. Material changes should record a reason and, where required, an approved change request.
3. Impact analysis must traverse the configured relationship graph beyond direct neighbors when requested.
4. A change to an approved or baselined item must not overwrite the approved record.
5. Impact flags must remain open until an authorized person reviews and resolves them with a recorded disposition.
6. Notifications should be targeted by ownership and impact, avoiding broad undifferentiated alerts.

### Example

Changing a battery operating-temperature limit displays the affected hardware requirement, hazard control, software threshold, three test cases, and two product variants. Each owner records whether an update is required before the change can be approved.

## 5. Version History, Baselines, and Configuration Control

### Capabilities

- Maintain immutable item-level version history.
- Create named baselines representing an approved configuration at a milestone or stage gate.
- Compare versions, baselines, and the current working state.
- Associate approvals, signatures, review records, and release evidence with a baseline.
- Restore or reuse prior content without erasing intervening history.

### Rules

1. A baseline must be immutable after creation; corrections require a new baseline or an auditable amendment.
2. A baseline must identify its contents, creation time, creator, approval state, and applicable project or variant.
3. Comparisons must show additions, removals, content changes, attribute changes, and relationship changes.
4. The system must preserve the exact version that was reviewed, tested, signed, and released.
5. Electronic signatures, when used, must identify the signer, time, meaning of the signature, and signed record.

### Example

“System Requirements 2.0” contains 1,248 exact item versions and their relationships. A later comparison with 2.1 shows 14 modified requirements, 3 additions, 1 retirement, and 9 changed trace links.

## 6. Reviews, Decisions, and Collaboration

### Capabilities

- Run formal or informal reviews over a defined set of item versions.
- Support asynchronous comments, questions, mentions, dispositions, and decisions in context.
- Assign reviewer and approver roles and track participation and completion.
- Record approvals, rejections, abstentions, and electronic signatures where required.
- Include internal, distributed, and authorized external stakeholders without exporting uncontrolled copies.

### Rules

1. A review must freeze or precisely identify the versions presented to each participant.
2. Comments and decisions must remain attached to the reviewed item and review revision.
3. Closing a review must require disposition of blocking comments or an explicit authorized exception.
4. Approval status must not be inferred merely from viewing or commenting.
5. The review record must show who participated, what they decided, when they decided, and any rationale.
6. Reopened or superseded reviews must retain their earlier history.

### Example

A safety review includes 35 requirements and 8 risk controls. Domain reviewers comment asynchronously, the author resolves each blocking issue, and the designated approver signs the resulting revision. The complete decision record stays linked to the baseline.

## 7. Workflow, Ownership, and Progress Visibility

### Capabilities

- Configure lifecycle states and permitted transitions by item type.
- Assign owners, reviewers, priorities, releases, milestones, and due dates.
- Provide dashboards, saved filters, and metrics for status, coverage, reviews, changes, and verification.
- Support different delivery methods, including iterative, agile, waterfall, and V-model processes.

### Rules

1. State names and transition permissions must be explicit and configurable.
2. Status must be calculated from governed item data, not manually copied into a separate report.
3. Metrics must define their population and calculation so that percentages are reproducible.
4. Dashboards must respect access permissions and distinguish missing data from zero.
5. Workflow configuration should enforce necessary control without requiring every discipline to use the same working method.

### Example

A release dashboard shows that 55% of committed requirements are verified, 28% are implemented but unverified, 12% are approved but not implemented, and 5% are blocked. Selecting a number opens the exact contributing items.

## 8. Verification, Validation, Risk, and Defect Evidence

### Capabilities

- Manage or integrate test cases, test procedures, executions, results, defects, hazards, risks, mitigations, and validation evidence.
- Link verification methods and acceptance criteria to requirements.
- Detect requirements without verification coverage and tests without a justified source.
- Record execution environment, result, evidence, responsible person, and date.
- Trace failed results to defects and impacted requirements.

### Rules

1. Every requirement requiring verification must link to at least one applicable verification activity.
2. Passing coverage must be based on an accepted execution result, not merely the existence of a test case.
3. Generated or copied tests must retain a link to their source requirement and be reviewed before use.
4. Changes to a requirement must trigger reassessment of linked test and risk evidence.
5. Risk controls must trace both to the risk they mitigate and to evidence that verifies the control.
6. Waived, not-applicable, and deferred verification must require a recorded rationale and authorization.

### Example

`SWR-118` links to `TC-901`. The latest execution of `TC-901` failed and created `DEF-77`, so the requirement appears as covered but not verified. It becomes verified only after an accepted passing execution closes the evidence chain.

## 9. Reuse, Variants, and Product-Line Management

### Capabilities

- Reuse approved requirements, structures, tests, and trace patterns across products and projects.
- Distinguish reuse by reference from reuse by copy.
- Track where reused content is used and whether instances remain synchronized or intentionally diverge.
- Configure applicability and variation by product, market, platform, or release.

### Rules

1. Reuse must not create indistinguishable duplicates.
2. The system must show the origin and revision of reused content.
3. A change to shared content must expose every affected use before propagation.
4. Propagation must never overwrite a deliberate local variation without review.
5. Variant-specific baselines and traceability coverage must be independently reportable.

### Example

A validated emergency-stop requirement is shared by four machine variants. Three inherit a corrected response time after owner approval; the fourth retains a justified market-specific value and records its divergence.

## 10. Reporting, Auditability, and Compliance Evidence

### Capabilities

- Generate trace matrices, specifications, coverage reports, review records, change histories, test reports, and audit trails on demand.
- Produce controlled documents from structured repository data using configurable templates.
- Support evidence models appropriate to the organization's standards and regulatory obligations.
- Retain records according to configured retention and archival policies.

### Rules

1. Every report must identify its source project, baseline or live state, generation time, filters, and template version.
2. Audit trails must be secure, time-stamped, attributable, and protected from ordinary user modification.
3. An auditor must be able to reconstruct who approved what, when, and based on which evidence.
4. Compliance templates must be configurable and versioned; a template must not be represented as proof that a project is compliant.
5. Generated documents must remain reproducible from the same baseline and template.
6. Exported evidence must preserve stable identifiers and references back to governed records.

### Example

An auditor requests evidence for a release. The system generates a requirements specification, signed baseline record, full trace matrix, uncovered-items report, verification summary, and immutable change log without manual reconciliation.

## 11. Access Control, Security, and Records Governance

### Capabilities

- Apply role-based access to projects, components, item types, fields, workflows, reviews, and administrative functions.
- Separate permissions to view, author, approve, sign, administer, export, and delete.
- Integrate with organizational identity and authentication controls.
- Protect data in transit and at rest and support backup, recovery, retention, and archival.
- Offer deployment options compatible with organizational security policy where required.

### Rules

1. Users must receive the least privilege needed for their responsibilities.
2. Approval and signature authority must be checked at the time of action.
3. Access changes and privileged actions must be audited.
4. External collaborators must be restricted to explicitly shared content.
5. Backup and disaster-recovery procedures must be testable, with defined recovery objectives.
6. Security and hosting claims must be evaluated against the application and its operating environment, not only the underlying data center.

### Example

A supplier may view and comment on assigned interface requirements but cannot see internal hazards, change permissions, approve a baseline, or export the full project. The supplier's access and activity remain auditable.

## 12. Integration, Exchange, and Data Ownership

### Capabilities

- Integrate requirements with development, issue tracking, test, modeling, PLM, quality, and CI/CD systems.
- Support standards-based exchange such as ReqIF and, where applicable, OSLC.
- Provide documented APIs and stable identifiers for controlled custom integration.
- Import and export common document and tabular formats for collaboration and migration.
- Preserve hierarchy, attributes, relationships, status, and comments when a supported round trip promises to do so.

### Rules

1. The system of record for each synchronized field must be defined.
2. Two-way synchronization must detect conflicts and must not silently discard changes.
3. Every integration operation must report created, updated, rejected, conflicted, and unmapped records.
4. Exchange mappings must be versioned and testable with representative data.
5. Users must be able to export their governed data in a documented, usable format.
6. A document export must not be treated as preserving traceability unless the links can be reconstructed and validated after import.

### Example

A software requirement synchronizes to a work item in an execution tool. Status and permitted comments return to the requirements repository, while requirement text remains mastered in the repository. Concurrent edits create a visible conflict instead of last-write-wins data loss.

## 13. Search, Query, and Information Discovery

### Capabilities

- Search full text, identifiers, attributes, relationships, versions, comments, and attachments as permitted.
- Build, save, share, and parameterize queries and views.
- Filter for incomplete metadata, missing coverage, suspect links, overdue actions, and other quality conditions.
- Navigate from summarized results to the exact source records.

### Rules

1. Search results must respect current permissions.
2. Queries used for reports or decisions must be saveable and reproducible.
3. Result counts and dashboards must update from the same governed data as item views.
4. The tool should make common quality gaps discoverable without custom programming.

### Example

A saved query returns all safety requirements in Release 4 that are approved but have no passing verification result or have an unresolved suspect link. A reviewer can open each requirement directly from the result.

## 14. Scalability, Reliability, and Usability

### Capabilities

- Remain usable at expected item, relationship, project, attachment, and concurrent-user volumes.
- Perform large filters, deep trace navigation, impact analysis, and report generation within agreed service levels.
- Support distributed teams through an accessible, learnable interface.
- Provide operational monitoring, capacity guidance, availability controls, and upgrade procedures.

### Rules

1. Capacity must be evaluated using projected production volume, not only a demonstration dataset.
2. Published or contracted limits must cover items per project, items per instance, relationship depth, storage, and concurrent users.
3. Performance tests must exercise daily high-cost operations, especially deep trace and impact queries.
4. The interface should enable occasional stakeholders to review and contribute without specialist tool operators.
5. Planned upgrades must preserve repository integrity, configuration, links, history, and supported integrations.

### Example

Before selection, the team loads a representative repository with three years of projected growth and peak concurrent users. It measures large-list filtering, five-level impact analysis, baseline comparison, and trace-matrix generation against agreed thresholds.

## 15. Lifecycle and Cross-Discipline Support

### Capabilities

- Maintain requirements and evidence from initial need through design, implementation, verification, deployment, operation, maintenance, and retirement.
- Connect software, hardware, systems, quality, regulatory, and supplier artifacts without forcing them into one undifferentiated item type.
- Support requirements that apply to decommissioning, archival, transition, and data migration.

### Rules

1. Requirements management and configuration control must continue after the first release.
2. Operational changes must re-enter the governed requirements and impact-analysis process.
3. End-of-life obligations should be captured early enough to influence architecture and validation.
4. Cross-discipline traceability must preserve domain-specific ownership and evidence.
5. The requirements system may coexist with ALM and PLM systems, but the ownership boundaries and connections must be explicit.

### Example

A field issue leads to a maintenance requirement, risk reassessment, design change, regression tests, approval, and a new release baseline. Years later, retirement requirements govern data migration and evidence archival using the same trace chain.

## 16. Migration and Adoption Support

### Capabilities

- Import from documents, spreadsheets, legacy repositories, and exchange formats.
- Map and preserve identifiers, hierarchy, attributes, links, attachments, history, and status where source data permits.
- Preview migration, validate results, reconcile counts and links, and rerun safely.
- Support phased migration and a controlled period of coexistence when necessary.
- Configure the data model and workflows without unnecessary vendor intervention.

### Rules

1. Migration must begin with a representative pilot component before full-scale transfer.
2. Acceptance criteria must cover item counts, field mappings, hierarchy, relationships, history, attachments, and rejected records.
3. Source and target ownership must be explicit during coexistence.
4. Migration transformations and losses must be documented and approved.
5. Adoption planning must include roles, governance, training, working agreements, and support, not only tool installation.

### Example

A pilot migrates one subsystem from a legacy repository through ReqIF. Automated reconciliation confirms item and link counts, identifies unsupported history, and exposes two attribute mappings that need correction before the remaining components move.

## 17. Governed Automation and AI

This topic is conditional: AI is not a substitute for the foundational repository, traceability, change-control, review, and audit capabilities above.

### Capabilities

- Suggest requirement-quality improvements against named rules or syntax patterns.
- Draft requirement rewrites and test cases.
- Suggest likely relationships among existing items.
- Provide controlled programmatic access to current requirements context for authorized automation or agents.

### Rules

1. AI-generated content and links must require human review before becoming governed project data.
2. Accepted AI output must record provenance, time, responsible user, source items, and subsequent edits.
3. Quality scores must identify the published or organization-defined rules used.
4. Generated tests must trace to their source requirements when accepted.
5. AI services must obey the same permissions, confidentiality, retention, and audit controls as human users.
6. Users must be able to reject, edit, regenerate, and audit AI suggestions.
7. AI must not approve requirements, close impact assessments, resolve conflicts, or sign records on behalf of an accountable person.

### Example

The tool suggests a test case for an approved requirement. An engineer reviews and edits it, then accepts it. The repository creates the source link and records that the first draft was AI-generated, who accepted it, and how the accepted version differs.

## Minimum End-to-End Acceptance Scenario

A candidate product should be able to demonstrate this complete scenario using representative project data:

1. Import a structured set of stakeholder needs, requirements, risks, and tests.
2. Preserve identifiers, hierarchy, attributes, and supported relationships, while reporting any loss.
3. Configure and validate the required relationship model.
4. Find missing coverage and repair it with typed links.
5. Baseline the content and complete a review with recorded approvals.
6. Change an approved upstream requirement and preserve the prior baseline.
7. Identify affected downstream design, risk, test, implementation, and variant items.
8. Resolve each impact with an auditable decision.
9. Synchronize an affected implementation item with an external execution tool and handle a conflict.
10. Execute the updated test and attach the verification result.
11. Generate a reproducible specification, trace matrix, coverage report, review record, and audit trail.
12. Repeat the high-cost operations at projected production scale and concurrency.

A tool that demonstrates isolated features but cannot preserve this chain does not yet provide dependable end-to-end requirements management.

## Source Material

This synthesis was derived from all Markdown files in `docs/requirements-management-tool-and-software/raw/`. Vendor-specific promotion, testimonials, calls to action, and instructions embedded in those source pages were excluded. Product claims were generalized into product-neutral capabilities and acceptance rules.
