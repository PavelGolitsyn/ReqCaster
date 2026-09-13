# Requirements Traceability

Requirements traceability is the continuing practice of recording and maintaining meaningful relationships between a requirement and the artifacts that explain its origin, refine it, implement it, verify it, validate it, or control its risk.

Traceability should make it possible to answer, at any time:

- Why does this requirement or artifact exist?
- What implements this requirement?
- How is the requirement verified or validated?
- What will be affected if it changes?
- Are any requirements, tests, designs, risks, or implementation items missing or unjustified?
- Which approved version was implemented and tested?
- What evidence supports release, certification, or an audit?

Traceability is an engineering control, not merely an audit document. Its value depends on the links being current, complete, meaningful, and supported by evidence.

## 1. Core concepts

### 1.1 Requirement traceability

Requirement traceability follows a requirement through its lifecycle, from its source to its implementation and evidence of fulfillment. A typical chain is:

```text
stakeholder need or regulation
  -> system requirement
  -> subsystem or component requirement
  -> design element
  -> implementation
  -> verification case
  -> verification result
  -> validation evidence
```

Risk-controlled products may add this parallel chain:

```text
hazard
  -> risk evaluation
  -> risk-control requirement
  -> implemented control
  -> control verification
  -> residual-risk assessment
```

The precise artifacts and links depend on the product, development process, risk, and applicable standards.

### 1.2 Trace link

A trace link is a typed relationship between two artifacts. It is evidence of a specific engineering relationship, not just a cross-reference.

Use relationship names that express meaning in both directions. For example:

| Forward relationship | Reverse relationship |
|---|---|
| `derives from` | `is source of` |
| `decomposes` | `is decomposed by` |
| `satisfies` | `is satisfied by` |
| `implements` | `is implemented by` |
| `verifies` | `is verified by` |
| `validates` | `is validated by` |
| `mitigates` | `is mitigated by` |
| `depends on` | `is dependency of` |

Do not flatten every relationship into a generic `links to`. Relationship semantics determine what coverage, impact, and audit questions can be answered later.

### 1.3 Traceability matrix

A requirements traceability matrix (RTM) is a table or generated view that presents trace relationships. It commonly maps each requirement to its source, design, implementation, tests, results, risks, status, and approvals.

Traceability is the ongoing practice; an RTM is one representation of its data. A static RTM is a snapshot and must not be mistaken for the live state of the project.

### 1.4 Data thread and digital thread

A data thread is the connected flow of lifecycle data among requirements, engineering, testing, production, operation, and service activities. A digital thread is the broader data-driven architecture that keeps the product's digital representations and lifecycle records connected and available to their producers and consumers.

Requirements traceability is part of this thread. It supplies explicit lineage and dependency links; the wider thread may also contain manufacturing instructions, process data, operational telemetry, maintenance records, and supply-chain history.

### 1.5 Product traceability

Product traceability follows a physical product, item, batch, or lot through sourcing, production, distribution, and use. It is related to, but distinct from, requirements traceability.

- Product tracking asks: **Where is the item now?**
- Product traceability asks: **Where has it been, what happened to it, and which records prove that history?**
- Requirements traceability asks: **Why was the product designed this way, how was the requirement realized, and what proves it was fulfilled?**

Connect these traceability domains when design decisions, configurations, materials, production records, or field issues must be traced back to requirements and controlled changes.

## 2. Directions and dimensions of traceability

### 2.1 Forward traceability

Forward traceability follows a need or requirement downstream to design, implementation, tests, and results.

It answers:

- Has every requirement been designed and implemented?
- Does every requirement have suitable verification evidence?
- Has each required risk control been implemented and verified?

Forward tracing detects missing implementation and verification coverage.

### 2.2 Backward traceability

Backward traceability follows a downstream artifact back to its originating requirement or need.

It answers:

- Why does this design element, code module, feature, or test exist?
- Is this artifact authorized by an approved requirement?
- Is this unintended scope, gold plating, or an orphan artifact?

Backward tracing detects unjustified functionality, tests, and design work.

### 2.3 Bidirectional traceability

Bidirectional traceability combines forward and backward navigation while preserving the meaning of each direction. It is required for dependable coverage analysis, scope control, and change impact analysis.

A relationship may be stored once by a tool, but both directional meanings must remain explicit and navigable. For example, a test `verifies` a requirement, while the requirement `is verified by` the test.

### 2.4 Vertical traceability

Vertical traceability connects levels of the product or requirement hierarchy, such as stakeholder need to system requirement to subsystem requirement to component requirement.

Use it to prove correct decomposition and allocation. Derived requirements—requirements necessary to make the system work but not explicitly stated at a higher level—must still have a documented rationale and appropriate upward and downward traces.

### 2.5 Horizontal traceability

Horizontal traceability connects peer artifacts or parallel disciplines at the same level. Examples include:

- A software interface requirement depending on a hardware interface requirement.
- Safety requirements shared by two subsystems.
- A requirement linked to its risk assessment, design output, or test at the same architectural level.

Use horizontal links to expose cross-team and cross-subsystem dependencies before integration.

## 3. Minimum traceability rules

The following rules form a practical baseline. Tailor cardinalities and required artifact types to the project.

### 3.1 Identification and content

1. Every controlled artifact must have a stable, unique identifier.
2. Identifiers must remain stable when an artifact moves between documents, folders, teams, or tools.
3. Every requirement must record its text, owner, state, version, source, and relevant parent or child relationships.
4. A link must identify the exact artifact version or controlled baseline to which its evidence applies.
5. Requirement summaries may aid reporting, but identifiers alone are not sufficient evidence that a relationship is valid.

### 3.2 Source and justification

1. Every requirement must trace to a stakeholder need, higher-level requirement, regulation, hazard, architectural decision, or documented derivation rationale.
2. Every design, implementation, test, and risk-control artifact must trace back to an approved source.
3. A derived requirement must state why it is necessary and identify who reviewed and approved the derivation.
4. An artifact with no justified source must be reviewed as possible scope creep, gold plating, or missing upstream documentation.

### 3.3 Implementation and verification

1. Every approved requirement must trace to the design or implementation artifact that satisfies it, when such an artifact is applicable.
2. Every verifiable requirement must trace to at least one suitable verification method and verification case.
3. Verification records must identify the executed version, environment or configuration, status, result, and supporting evidence.
4. Failed, blocked, missing, or obsolete verification must be visible; it must not be summarized as covered.
5. Validation evidence must trace back to the relevant user need or intended use. Verification and validation must not be treated as synonyms:
   - **Verification:** Was the product built correctly against its specified requirements?
   - **Validation:** Was the right product built for its intended use and stakeholder needs?

### 3.4 Risk and compliance

1. When risk management applies, trace hazards through risk controls to implementation and verification evidence.
2. Record residual-risk decisions and approvals where the governing process requires them.
3. Link applicable regulatory or standards obligations to the requirements and evidence used to address them.
4. Do not assume a generic RTM satisfies a regulation. Confirm the required artifacts, signatures, retention periods, granularity, and report format for the applicable jurisdiction and standard.

### 3.5 Currency and integrity

1. Create trace links when the related artifact is created or approved; do not postpone link creation until a milestone or audit.
2. Update traceability whenever a linked artifact is added, removed, revised, superseded, or rejected.
3. A change to an upstream artifact must mark affected downstream links or artifacts for reassessment.
4. Suspect links remain unresolved until an authorized owner confirms that the downstream artifact is still valid or updates it.
5. Do not reuse a passing result after its requirement or test has materially changed without a documented assessment.
6. Keep a history of what changed, who changed it, when it changed, why it changed, and who approved it.

### 3.6 Ownership and access

1. Assign one accountable owner for every requirement and every controlled change.
2. Define which roles may create, modify, approve, and close requirements and links.
3. Use a shared authoritative repository or a tightly integrated toolchain with defined synchronization ownership.
4. Resolve conflicting copies against the authoritative version; do not reconcile by informal email consensus alone.

## 4. Define the traceability model before tracing

A traceability information model defines the artifact types, allowed relationships, and coverage rules for a project. Establish it before large-scale authoring begins.

For each artifact type, define:

- Required upstream links.
- Required downstream links.
- Optional links.
- Prohibited links.
- Allowed relationship types.
- Minimum and maximum cardinality.
- Ownership and approval rules.
- Conditions under which a link becomes suspect.
- Coverage and exception criteria.

Example:

| Artifact type | Required upstream | Required downstream | Example rule |
|---|---|---|---|
| System requirement | Stakeholder need or approved derivation | Subsystem requirement or design; verification case | At least one source and one verification method |
| Safety requirement | Hazard or safety goal | Risk control design; verification case | No release with unresolved safety link |
| Test case | Requirement | Test result | Exactly one current procedure version per execution |
| Design element | Requirement | Implementation or inspection evidence | Must not exist without an approved source |

Keep the model small enough to maintain. A few precise relationship types are usually more useful than a large taxonomy that teams apply inconsistently.

## 5. Build and use an RTM

### 5.1 Preparation

1. Gather functional, non-functional, interface, safety, regulatory, and derived requirements.
2. Resolve ambiguity and obtain agreement on the requirements to be traced.
3. Assign unique IDs and normalize required metadata.
4. Separate external obligations from internal product requirements while linking the two.
5. Create an approved baseline so later evidence can be tied to a known revision.

### 5.2 Define the matrix or view

At minimum, include:

- Requirement ID.
- Requirement summary or text.
- Source or parent ID.
- Design or implementation reference.
- Verification method and test-case ID.
- Verification status and result.
- Owner and current version.

Add as needed:

- Validation case.
- Hazard and risk-control IDs.
- Defect IDs.
- Regulatory or standards reference.
- Approval state and approver.
- Baseline or configuration.
- Suspect-link status.
- Change request or change order.

### 5.3 Create the links

1. Trace each requirement backward to its source.
2. Trace it forward to design and implementation.
3. Link each requirement to its verification method and cases.
4. Link verification cases to their executions, results, and defects.
5. Add risk, compliance, interface, and validation links where applicable.
6. Inspect the reverse direction to find unjustified downstream artifacts.

### 5.4 Review coverage

Run coverage checks in both directions:

- Requirements without a source.
- Requirements without design or implementation links.
- Requirements without verification cases.
- Verification cases without an originating requirement.
- Design or implementation artifacts without an originating requirement.
- Hazards without controls.
- Controls without verification evidence.
- Failed or incomplete verification.
- Stale or suspect links.
- Artifacts linked to obsolete versions or baselines.

Record justified exceptions explicitly. A blank cell and an approved `not applicable` decision are not equivalent.

### 5.5 Maintain continuously

Treat the RTM as a generated view of current engineering data where possible. Review it during normal development, change reviews, test planning, design reviews, baseline creation, and release readiness—not only before an audit.

## 6. RTM example

The following simplified example shows an infusion-pump requirement chain. Real projects may need more columns and separate records for each relationship.

| Req ID | Requirement | Source | Design | Verification | Result | Risk control | State |
|---|---|---|---|---|---|---|---|
| REQ-001 | Flow-rate accuracy shall be within ±2% across 1–999 mL/h. | NEED-003 | DS-PUMP-003 | TC-SEN-001, TC-SEN-002 | Pass | RC-012 | Approved |
| REQ-002 | An audible alarm shall begin within 5 s after occlusion detection. | HAZ-008 | DS-ALARM-007 | TC-ALM-003 | Pass | RC-008 | Approved |
| REQ-003 | Battery operation shall last at least 8 h at 125 mL/h. | NEED-007 | DS-PWR-002 | TC-BAT-001, TC-BAT-005 | Pass | N/A, justified | Approved |
| REQ-004 | Wireless communication shall operate at 10 m under the defined test conditions. | SYS-ARCH-015 | DS-COMM-001 | TC-COM-012 | In progress | RC-015 | Not release-ready |

REQ-002 can be traversed backward to hazard HAZ-008 and forward to the alarm design, test, and risk control. If the occlusion algorithm changes, these connected artifacts define the initial impact-analysis scope. The team must still inspect indirect dependencies; traceability accelerates judgment but does not replace it.

## 7. Change impact analysis

Change impact analysis evaluates the consequences of a proposed change before implementation. It uses trace links to find affected artifacts, people, configurations, risks, cost, and schedule.

### 7.1 Change-analysis workflow

1. **Describe the change.** Identify the exact proposed revision and its rationale.
2. **Establish scope.** Identify affected products, variants, configurations, teams, suppliers, and lifecycle stages.
3. **Traverse links.** Follow upstream, downstream, vertical, and horizontal relationships.
4. **Assess consequences.** Evaluate technical feasibility, interfaces, safety, risk, compliance, cost, schedule, manufacturing, service, and training.
5. **Consult owners.** Involve subject-matter experts and stakeholders responsible for affected artifacts.
6. **Plan mitigation.** Define required updates, re-verification, rollout, effectivity, monitoring, and rollback criteria.
7. **Decide and record.** Approve, reject, or defer the change with the evidence and rationale.
8. **Implement and verify.** Update every affected artifact and execute the required verification or validation.
9. **Close only with evidence.** Resolve suspect links, update the baseline, and retain the final approvals and results.

Useful techniques include dependency mapping, impact matrices, stakeholder workshops, system models, simulations, and scenario analysis.

### 7.2 Example

Suppose the alarm requirement in REQ-002 changes from 5 seconds to 3 seconds. The team should review at least:

- The originating hazard and risk evaluation.
- Alarm architecture and timing budgets.
- Detection algorithm and source code.
- Hardware performance constraints.
- TC-ALM-003 and any system-level validation cases.
- Existing results, which may no longer prove the revised requirement.
- User documentation, training, manufacturing tests, and regulatory evidence.
- Related requirements that depend on alarm priority or timing.

The previous passing result must be treated as potentially stale until its applicability to the revised requirement is assessed.

## 8. Version control, baselines, and engineering changes

### 8.1 Version and baseline

- A **version** records an incremental change to one item, normally with author, time, reason, and comparison metadata.
- A **baseline** is an approved snapshot of a coherent set of items at a point in time.

Versions provide item history. Baselines preserve project or configuration context. Use both.

Baseline early enough to prove which requirement revision was designed, implemented, reviewed, and tested. Create new baselines at defined gates and after approved changes; never silently replace the evidence attached to an older baseline.

### 8.2 Engineering change management

For baselined products, use a controlled change process:

1. **Engineering Change Request (ECR):** proposes a change, explains why it is needed, and provides preliminary impact information. It does not authorize implementation.
2. **Engineering Change Order (ECO):** authorizes the approved work and records scope, owners, timing, affected configurations, verification needs, and effectivity.
3. **Engineering Change Notice (ECN):** records the completed revision and communicates which configuration is now effective.

A cross-functional change control board should review significant changes. Include engineering, quality, manufacturing, configuration management, regulatory, supply-chain, or service representation as the change requires.

Every change record should show:

- What changed.
- Why it changed.
- Who owned and approved it.
- Which artifacts and configurations were affected.
- When the change became effective.
- How it was verified and validated.
- What residual risks, exceptions, or rollout constraints remain.

## 9. Live traceability

Live traceability means that current upstream and downstream relationships are available as the work changes. It is a property of the operating process and connected data, not a branded report or a matrix regenerated at the end.

Prefer live traceability when:

- Requirements or tests change frequently.
- Many teams or suppliers contribute artifacts.
- The system contains hundreds or thousands of requirements.
- Multiple variants or baselines must be maintained.
- Audit-ready history, approvals, and electronic signatures are required.
- Requirements, development, test, risk, PLM, or manufacturing data reside in different tools.

After-the-fact traceability reconstructs links late, often for a review or audit. It can show a plausible final chain but does not reliably show that impact and coverage were controlled during development. Avoid using it as the normal operating model.

## 10. Tooling and integration

### 10.1 When a spreadsheet is sufficient

A spreadsheet RTM may be adequate for a small, stable, low-risk project with few contributors and simple approval needs. If used:

- Store it in one controlled location.
- Define one authoritative owner.
- Apply access control and versioning.
- Protect formulas and structural fields.
- Review changes and links at each relevant event.
- Preserve approved snapshots.
- Validate the actual relationships, not only whether cells are populated.

### 10.2 When to use a dedicated system

Move to a requirements or lifecycle management system when link volume, change rate, compliance obligations, variants, or cross-team coordination make manual maintenance unreliable.

Look for:

- Typed, bidirectional links.
- Configurable traceability rules and coverage reports.
- Automated suspect-link detection.
- Item-level history, baselines, approvals, and audit trails.
- Risk-to-requirement-to-test trace chains.
- Test-result and defect integration.
- Controlled exports and reports.
- Access control and, when required, electronic signatures.
- Reliable two-way integrations with development, test, PLM, and other systems.

Integration must preserve identifiers, relationship meaning, versions, ownership, and error handling. A connector that copies text but loses trace semantics does not provide end-to-end traceability.

## 11. Product and supply-chain traceability

Requirements traceability may need to connect to sourcing, production, distribution, and field records for regulated physical products.

### 11.1 Granularity

- **Batch or lot level:** groups units produced under the same defined conditions.
- **Item level:** assigns a unique serial identifier to each product or critical component.
- **Internal traceability:** follows items within one facility.
- **Chain traceability:** crosses supplier, manufacturer, distributor, and customer boundaries.

Choose granularity according to product risk, regulatory obligations, customer requirements, and recall needs.

### 11.2 Required operating practices

1. Standardize lot, batch, and serial identifiers before integrating systems.
2. Link supplier identifiers to certificates, incoming inspections, and approved-supplier records.
3. Link material identifiers to work orders, process conditions, inspections, operators, and finished goods.
4. Link finished goods to distribution and post-market records.
5. Define data ownership and data-sharing rules across supplier tiers.
6. Train staff on identifier handling, nonconforming material, discrepancies, escalation, and recall procedures.
7. Retain records according to applicable law, standards, contracts, product life, and organizational policy.

### 11.3 Mock recall example

Test both directions:

- **Forward test:** Start with supplier lot MAT-042 and identify every finished unit containing it, its current or last-known disposition, and relevant customers.
- **Backward test:** Start with finished unit SN-00817 and retrieve all material lots, production steps, process settings, inspections, approvals, and configuration records used to build it.

Record retrieval time, missing data, incorrect mappings, and corrective actions. Feed systemic findings into the corrective and preventive action process.

## 12. Roles and governance

Traceability ownership is shared, even when one role administers the RTM.

| Role | Typical responsibility |
|---|---|
| Systems or requirements engineer | Defines the model; maintains requirement hierarchy and source links |
| Design or software engineer | Maintains implementation and dependency links |
| Test engineer | Maintains verification cases, executions, results, and defects |
| Safety or risk engineer | Maintains hazard, control, and residual-risk links |
| Quality or regulatory | Confirms required evidence, approvals, and report formats |
| Configuration manager | Controls versions, baselines, effectivity, and status accounting |
| Change owner | Moves a change from request through verification and closure |
| Product or program leadership | Funds adoption, resolves cross-team barriers, and reviews metrics |

Leadership should define why traceability matters, sponsor a common process, provide training, and make responsibilities part of normal work. Do not frame traceability as administrative cleanup assigned to one person at release time.

## 13. Metrics and operational reviews

Metrics should drive action rather than reward superficial link counts. Useful measures include:

- Percentage of requirements with an approved source.
- Percentage with design or implementation coverage.
- Percentage with planned verification.
- Percentage with passed verification on the current baseline.
- Count and age of suspect links.
- Count and age of traceability exceptions.
- Orphan requirement, design, implementation, and test counts.
- Hazard-to-control and control-to-verification coverage.
- Change-request and change-order cycle time.
- Change effectiveness and first-time implementation accuracy.
- Audit-trail completeness.
- Mock-recall retrieval time and completeness.

Define thresholds, owners, and escalation rules for each metric. Review exceptions and trends, then update the traceability model, training, or workflow when recurring gaps appear.

Do not treat a high percentage as proof of correctness. A wrong or meaningless link can make a dashboard look complete while hiding a real gap.

## 14. Common failure modes and responses

### Links are created only before an audit

**Risk:** The matrix describes a reconstructed story rather than the process actually followed.

**Response:** Create links during authoring and implementation; review them at each change and lifecycle gate.

### Multiple spreadsheet copies circulate

**Risk:** Nobody knows which matrix or requirement version is authoritative.

**Response:** Use one controlled repository, named ownership, baselines, and a documented conflict-resolution process.

### Links have no relationship type

**Risk:** The team cannot distinguish derivation, implementation, verification, validation, or dependency.

**Response:** Define a small, governed relationship vocabulary and validate its use.

### An upstream item changes without downstream review

**Risk:** Passing tests and approved designs may refer to obsolete requirements.

**Response:** Flag impacted links automatically where possible and require owner disposition before closure.

### Teams and suppliers use incompatible tools or IDs

**Risk:** Updates silently diverge across organizational boundaries.

**Response:** Establish shared identifiers, exchange formats, synchronization rules, owners, and reconciliation monitoring.

### The model becomes too complex to maintain

**Risk:** Users avoid tracing or apply links inconsistently.

**Response:** Remove relationship types and fields that do not support a defined decision, obligation, or analysis.

### Coverage is measured by populated cells

**Risk:** A matrix appears complete even though links point to obsolete, irrelevant, or insufficient evidence.

**Response:** Sample and traverse complete chains in both directions; validate artifact content, version, approval, and result.

### Adoption is treated as a tool rollout

**Risk:** The organization buys automation but retains unclear ownership and siloed processes.

**Response:** Define policy, roles, training, metrics, and cross-functional reviews alongside the technology.

## 15. Review checklists

### 15.1 Requirement review

- [ ] The requirement has a stable unique ID.
- [ ] Its source or derivation rationale is recorded.
- [ ] Its owner, state, and version are clear.
- [ ] Parent, child, and interface dependencies are linked.
- [ ] The requirement is testable or has a justified alternative verification method.
- [ ] Design and implementation links are present where applicable.
- [ ] Verification and validation links are appropriate and distinct.
- [ ] Risk and compliance links are present where required.
- [ ] No unresolved suspect links affect approval.

### 15.2 Change review

- [ ] The proposed change and rationale are precise.
- [ ] Upstream, downstream, vertical, and horizontal impacts were inspected.
- [ ] Product variants, configurations, suppliers, and fielded units were considered.
- [ ] Safety, compliance, cost, schedule, training, service, and manufacturing impacts were assessed.
- [ ] Required re-verification and re-validation are defined.
- [ ] Effectivity and rollback criteria are defined where relevant.
- [ ] Required owners approved the change.
- [ ] The baseline, links, evidence, and communications were updated before closure.

### 15.3 Release or audit readiness

- [ ] Every approved requirement has a valid source.
- [ ] Every requirement has required design, implementation, risk, and verification coverage.
- [ ] Every downstream artifact has a justified requirement.
- [ ] Verification results apply to the released versions and configuration.
- [ ] Failed, incomplete, waived, and not-applicable items are explicitly dispositioned.
- [ ] Suspect and broken links are resolved or formally accepted.
- [ ] Change history and approvals are complete.
- [ ] The released baseline is identifiable and reproducible.
- [ ] Required reports can be generated and sampled in both directions.
- [ ] Record retention and signature obligations are satisfied.

## 16. Practical definition of done

Traceability is adequate when an authorized reviewer can select any relevant requirement or product record and, without reconstructing the history from memory or email:

1. Identify its approved source and version.
2. Traverse its valid upstream and downstream relationships.
3. See how it was implemented, verified, and—where applicable—validated.
4. Confirm related risks, controls, changes, approvals, and configurations.
5. Detect missing, failed, stale, or unjustified artifacts.
6. Produce the evidence in the form required for the decision, release, audit, or recall.

The goal is not the largest possible matrix. The goal is a trustworthy, current evidence chain that supports engineering decisions throughout the lifecycle.
