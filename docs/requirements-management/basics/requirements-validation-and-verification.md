# Requirements Validation and Verification

Verification and validation (V&V) are complementary quality activities:

- **Verification:** confirm that the product and its work products conform to specified requirements and design inputs — *did we build it right?*
- **Validation:** confirm that the finished product satisfies user needs, intended uses, business objectives, and the real operating context — *did we build the right thing?*

A product can pass verification and still fail validation. Conformance to a specification does not prove that the specification describes what users actually need.

## Core concepts

| Topic | Verification | Validation |
| --- | --- | --- |
| Primary question | Does the output meet its stated inputs and specifications? | Does the product meet the user's actual need and intended use? |
| Reference point | Requirements, design inputs, technical specifications, and interface control documents | User and stakeholder needs, business objectives, intended uses, and the operational environment |
| Focus | Correct implementation and technical conformance | Fitness for purpose and outcome correctness |
| Typical performers | Engineers, reviewers, and test engineers | Intended users, user representatives, stakeholders, and validation teams |
| Typical activities | Reviews, walkthroughs, inspections, analysis, and specification-based testing | Prototyping, use-scenario evaluation, user testing, acceptance testing, and evaluation in a representative environment |
| Typical product state | Design artifacts, code, components, and a design-equivalent system | An integrated, production-equivalent product when required |
| Typical evidence | Review records, test procedures, expected and actual results, and defect records | Acceptance results, intended-use results, stakeholder approval, and proof that business or user outcomes were achieved |

**Independent verification and validation (IV&V)** means that a disinterested third party performs the assessment. Use it when independence, specialized expertise, safety risk, or assurance obligations justify an unbiased review.

## Governing rules

1. **Plan V&V from the start.** Define how each requirement will be verified or validated while requirements and architecture are being developed. Do not wait until implementation is complete to decide how success will be demonstrated.
2. **Establish clear inputs.** Use requirements that are measurable, unambiguous, properly documented, and under version control. Vague inputs create vague tests and unreliable conclusions.
3. **Verify before final validation.** First establish that the implementation conforms to its specifications; then establish that the resulting product is fit for its intended use. Planning for both happens early even though their final execution is ordered.
4. **Use more than one technique.** Reviews, analysis, simulation, prototypes, and testing expose different classes of defects. Select a combination appropriate to the product and its risks.
5. **Scale rigor by risk.** Give the most safety-critical, failure-prone, or high-impact functions and interfaces the strongest coverage, independence, and evidence.
6. **Maintain bidirectional traceability.** Every applicable requirement must lead to verification or validation evidence, and every test must have a legitimate source requirement or user need.
7. **Record actual evidence.** Store approved plans, configurations, procedures, input data, expected and actual results, failures, fixes, retests, approvals, and requirement links.
8. **Control change continuously.** When a requirement, design, interface, or implementation changes, identify affected artifacts and rerun the relevant tests, including regression tests.
9. **Use representative conditions.** A result is credible only when the product configuration, environment, external systems, and data adequately represent the claimed use.
10. **Agree on acceptance criteria before execution.** Cross-functional reviewers should approve scope, responsibilities, entry criteria, expected results, and exit criteria while changes are still inexpensive.

## Preparing requirements for V&V

Well-defined requirements are the baseline for both verification and validation. Engage stakeholders and subject-matter experts during elicitation, then check each requirement before baselining it.

### Requirement quality checks

A requirement should:

- express a genuine user, stakeholder, business, system, or regulatory need;
- have one clear interpretation;
- state measurable or observable acceptance criteria;
- contain enough information for design and test work without developer guesswork;
- be modifiable under controlled change;
- be uniquely identifiable and versioned;
- link upward to its source or purpose;
- link downward to design, implementation, test cases, and results as those artifacts are created; and
- not duplicate, contradict, or leave gaps between related requirements.

Missing or invalid requirements should be corrected as early as possible. An error found during authoring or review is usually much cheaper to correct than the same error after it has propagated into design, code, interfaces, and tests.

### Validation questions for a requirement set

Ask:

- Do these requirements describe what users actually need?
- Do they support the intended uses and business objectives?
- Are all relevant stakeholders represented?
- Is any necessary behavior, interface, constraint, failure response, or quality attribute missing?
- Will developers and testers interpret each requirement the same way?
- Can every requirement be evaluated with objective evidence?
- Are safety and regulatory obligations represented where applicable?
- Can each lower-level requirement be traced to a justified higher-level need?

## End-to-end V&V workflow

### 1. Capture needs and define intended use

Record the problem, users, operating context, business objectives, stakeholder needs, and applicable regulatory constraints. These are the references used later for validation.

### 2. Develop and baseline requirements

Turn needs into clear requirements and acceptance criteria. Review them with relevant stakeholders and subject-matter experts. Assign identifiers, create trace links, approve a baseline, and use version control for later changes.

### 3. Plan verification and validation

For each requirement or need, define:

- whether verification, validation, or both are required;
- the method: review, inspection, analysis, simulation, demonstration, or test;
- the responsible role and any independence requirement;
- the product configuration and environment;
- required input data and controlled fault cases;
- objective acceptance criteria;
- required trace links and records; and
- entry and exit criteria.

Planning should start during requirements and architecture work. This makes untestable requirements and missing interfaces visible before implementation.

### 4. Perform verification

Review documents, designs, models, code, components, and the assembled system against their specified inputs. Record expected and actual results. Raise a defect for every unexplained mismatch.

Verification may reveal not only implementation defects but also missing, inconsistent, or invalid requirements. Correct the originating artifact and propagate the change through its trace links.

### 5. Perform validation

Evaluate the integrated product against user needs, intended uses, stakeholder expectations, and business outcomes. Use intended users or suitable representatives and a realistic operating context. Where a domain requires it, validate a production-equivalent configuration.

Validation must answer whether the delivered outcome is useful and correct, not merely whether all specified functions execute.

### 6. Resolve failures and retest

For each failure, record:

- the affected requirement, need, and test case;
- severity, risk, and safety impact where applicable;
- expected behavior and actual behavior;
- the environment, configuration, and data used;
- root cause and corrective change; and
- retest and regression-test results.

Repeat the failed test after correction. Also rerun previously passing tests that the change could affect.

### 7. Confirm coverage and retain evidence

Before release, confirm that:

- every in-scope requirement has an approved disposition and evidence;
- every validation objective maps to a user, stakeholder, business, or regulatory need;
- every executed test has a valid basis;
- failures have been resolved or formally accepted through the applicable risk process;
- the tested configuration and environment are identified; and
- review, test, approval, and trace records are complete and audit-ready.

## Selecting V&V techniques

Choose techniques according to the question being answered, the maturity of the product, and the cost and consequence of failure.

### Reviews, walkthroughs, and inspections

Use structured peer review for requirements, designs, models, code, test cases, and other artifacts. Reviews find ambiguity, inconsistency, omissions, and technical errors before execution is possible.

**Rule:** record participants, reviewed version, findings, decisions, and resolution status. An undocumented review is weak evidence.

### Testing

Use testing at the appropriate level:

- **Unit or component testing:** individual components against component requirements.
- **Component integration testing:** interfaces between modules within one system.
- **System testing:** the complete system against its own functional and non-functional requirements.
- **System integration testing (SIT):** the system's interfaces with external systems and services.
- **User acceptance testing (UAT):** the integrated product against user and business needs.

The name of a test level does not by itself determine whether an activity is verification or validation. Classify the activity by its objective and reference: conformance to a technical specification is verification; fitness for user need and intended use is validation.

### Simulation

Use simulation to evaluate behavior across scenarios when physical testing is impractical, unsafe, unavailable, or prohibitively expensive. Define the simulation's assumptions and limits, and do not claim more evidence than the model supports.

### Prototyping

Build prototypes early to expose usability problems, misunderstood needs, and design flaws through realistic interaction. Treat prototype feedback as an input to requirements and design; update and control those artifacts rather than leaving decisions only in discussion notes.

### Model-based design and analysis

Use analyzable models to evaluate behavior before implementation. Keep models linked to their source requirements and identify which implementation properties the model does and does not demonstrate.

### Continuous integration and delivery

Use automated pipelines to run stable checks frequently, detect regressions, and expose integration issues as the product evolves. Automation supports continuous verification, but it does not replace user-centered validation or human review.

### Independent assessment

Use IV&V when internal familiarity may hide assumptions, when specialist expertise is needed, or when the required confidence or standard calls for separation from the development team. Define the assessor's scope, authority, and independence explicitly.

## Traceability and change control

A useful end-to-end trace chain is:

> User or stakeholder need → business requirement → system requirement → lower-level requirement → design or code → test case → test result → defect and resolution

### Traceability rules

- **Forward traceability:** follow a need or requirement to its implementation and evidence. Use it to find missing coverage.
- **Backward traceability:** follow a test, design element, or implementation item to its source requirement or need. Use it to find unjustified work and orphan tests.
- Link interface requirements to integration tests while authoring the requirements, not after failures occur.
- Link test data sets to the interface conditions and scenarios they exercise.
- When an item changes, flag all downstream and upstream impacts for review.
- Keep trace information current in the working source of truth; a stale matrix or spreadsheet cannot demonstrate current coverage.
- Generate coverage and audit reports from controlled, current records.

Traceability connects verification and validation: it shows not only that a requirement was implemented and tested, but also why the requirement exists and whether its originating need was satisfied.

## System integration testing

System integration testing verifies that an already assembled system exchanges data and interacts correctly with independently developed external systems or services. It focuses on externally visible interfaces defined by interface control documents and external-system specifications.

### Boundaries between test levels

| Test level | Scope | Reference | Example |
| --- | --- | --- | --- |
| Component integration | Interfaces among modules inside one system | Internal interface and component specifications | A flight-management computer's navigation module sends data to its internal display module |
| System testing | Complete system behavior, including performance and security | System requirements | The complete flight-management computer satisfies its own response-time requirement |
| System integration testing | Interfaces between the system and external systems or services | Interface control documents and external-system specifications | The avionics system exchanges correctly formatted data with a separate air-traffic-control system |
| User acceptance testing | Integrated product in business or user workflows | User needs and business processes | A flight operator completes the intended operational workflow successfully |

SIT does not replace system testing or UAT. System testing establishes the product's internal behavior, SIT establishes technical conformance at external boundaries, and UAT establishes fitness for the user's workflow.

### Integration strategies

#### Top-down

Integrate from high-level modules downward and use stubs for unavailable lower-level components.

- **Advantage:** high-level workflows can be checked early.
- **Risk:** simplistic stubs can hide failures that real components would expose.

#### Bottom-up

Integrate foundational layers first and use drivers for unavailable higher-level callers.

- **Advantage:** real low-level components and real data handling are exercised early.
- **Risk:** high-level workflows and a visibly working system appear late.

#### Big bang

Combine all modules at once and test the complete integration.

- **Advantage:** little stub or driver scaffolding is required.
- **Risk:** defect isolation is difficult because many interfaces change state at once. This approach also provides weak step-by-step evidence for regulated programs.

#### Incremental

Integrate in controlled increments, potentially proceeding from both high and low layers toward the middle.

- **Advantage:** failures are easier to isolate, and each increment can produce traceable evidence.
- **Risk:** sequencing, environments, stubs, drivers, and ownership require careful coordination.

Prefer an incremental strategy when traceability, defect isolation, safety, or auditability is important.

### SIT procedure

#### 1. Define scope and criticality

- Identify in-scope subsystems, external systems, services, and interfaces.
- Document exclusions explicitly.
- Assign the applicable safety or integrity classification, such as an avionics Design Assurance Level, medical-device software safety class, or automotive ASIL.
- Let the classification determine review rigor, coverage, independence, and evidence requirements.

#### 2. Establish entry criteria

Confirm that:

- the system has completed the prerequisite internal testing;
- interface requirements and control documents are approved and versioned;
- participating system versions and configurations are known;
- the test environment adequately represents operation;
- controlled test data is available and consistent across systems; and
- roles, schedule, defect handling, and acceptance criteria are approved.

#### 3. Design tests around real data flows

- Derive tests from interface requirements and external-system specifications.
- Cover valid, invalid, boundary, timing, sequencing, and error-handling conditions.
- Include controlled fault scenarios when required for safety-critical behavior.
- Trace each test and data set to the requirement and interface condition it covers.
- State objective expected results before execution.

#### 4. Execute and record

Run tests in the order defined by the integration strategy. For every execution, record the configuration, environment, data, procedure version, expected result, actual result, status, operator, and time.

#### 5. Log defects and analyze impact

Each defect should identify affected tests and requirements, severity and risk, and the difference between expected and actual behavior. Use trace links to identify other systems, artifacts, and tests that may be affected.

#### 6. Retest and regress

After a fix, rerun the failed case and any previously passing cases exposed to the change. Preserve the original failure and link it to the fix and successful retest.

#### 7. Evaluate exit criteria

Confirm required coverage, acceptable defect status, successful regression, approved deviations, correct configurations, and complete evidence before declaring SIT complete.

### Common SIT failure modes and controls

#### Underspecified interfaces

**Failure mode:** independently developed systems interpret data formats, performance thresholds, timing, or error behavior differently.

**Control:** specify boundary behavior during requirements work, review interface documents jointly, and trace every interface requirement to a planned test.

#### Non-representative environments

**Failure mode:** a test passes in a configuration that differs materially from production, so it cannot support the claimed conformance.

**Control:** establish a realistic environment early and record all differences, assumptions, simulators, and limitations.

#### Inconsistent cross-system data

**Failure mode:** System B's test state does not match the output produced by System A, producing misleading failures or false passes.

**Control:** manage shared data sets under governance, preserve data lineage, and verify preconditions across all participating systems.

#### Brittle automation

**Failure mode:** frequently changing interfaces cause automated tests to require constant repair.

**Control:** automate stable, repeatable, high-criticality interfaces first. Use a risk-based automation strategy instead of treating full automation as the goal.

#### Late reviewer involvement

**Failure mode:** stakeholders discover disagreements about scope or acceptance criteria during execution.

**Control:** involve cross-functional reviewers in test planning and obtain approval before execution. In regulated work, treat the signed test plan as an audit artifact.

## Examples

### Navigation example

- **Verification:** directions say to take exit 10. Passing exit 1 confirms that the current route can be checked against the specified directions and that nine exits remain.
- **Validation:** on arrival, confirm that the destination is the intended hiking trail, has the expected trailhead and markings, and meets the traveler's purpose.

Following every direction correctly does not help if the directions point to the wrong destination.

### Spreadsheet example

Suppose a spreadsheet is intended to reduce the time required for a task and reduce data-entry errors.

- **Verification:** confirm that each formula and function produces the result stated in the requirements.
- **Validation:** confirm with the users that the complete spreadsheet actually reduces task time and errors in their real workflow.

The spreadsheet may calculate every formula correctly and still fail validation if it is too cumbersome, omits a needed workflow, or does not improve the intended outcomes.

### External-interface example

Suppose System A sends a transaction to System B.

- **Component integration test:** check data exchange between modules inside System A.
- **System test:** check that System A creates a transaction that conforms to its own requirements.
- **SIT:** check that System B receives, interprets, acknowledges, rejects, and recovers from System A's transactions exactly as the external-interface specifications require.
- **UAT:** check that a user can complete the end-to-end business process using both systems.

## Regulated and safety-critical work

Regulated V&V must produce auditable evidence, not only a working product. Determine the current obligations for the applicable domain and product classification, then reflect them in plans, independence, configurations, approvals, and retained records.

The source material gives these examples:

- medical-device design verification confirms that design outputs meet design-input requirements;
- medical-device design validation confirms conformance to defined user needs and intended uses, commonly using a production-equivalent product when required;
- aerospace programs may apply assurance obligations such as DO-178C;
- medical-device software programs may apply IEC 62304 and quality-system obligations such as ISO 13485; and
- automotive functional-safety programs may apply ISO 26262 and ASIL classifications.

Treat these as domain examples, not a complete compliance checklist. Confirm the current, applicable regulations and standards for the specific product and jurisdiction.

## Practical review checklist

### Before execution

- [ ] User needs, intended uses, business objectives, and operating context are documented.
- [ ] Requirements are clear, measurable, approved, and versioned.
- [ ] Interfaces and boundary behavior are explicitly specified.
- [ ] Each requirement has a planned verification or validation method and acceptance criteria.
- [ ] Safety and integrity classifications have been assigned where applicable.
- [ ] Scope, exclusions, roles, configurations, environments, data, and independence are defined.
- [ ] Forward and backward trace links are in place.
- [ ] Cross-functional reviewers have approved the plan.

### During execution

- [ ] The approved procedure and correct configuration are being used.
- [ ] Expected and actual results are recorded.
- [ ] Deviations and defects are linked to affected requirements and risks.
- [ ] Environment and test-data provenance are preserved.
- [ ] Changes trigger impact analysis, retesting, and appropriate regression testing.

### Before completion

- [ ] Every in-scope requirement and user need has objective evidence or an approved disposition.
- [ ] Every test traces back to a legitimate requirement or need.
- [ ] Required retests and regressions have passed.
- [ ] Open defects and deviations meet the approved release and risk criteria.
- [ ] Results demonstrate both specification conformance and fitness for intended use.
- [ ] Records are complete, controlled, and ready for review or audit.

## Source material

This guide consolidates and reorganizes the following source files:

- [Best Practices for Verification and Validation in Product Development](../raw/requirements-validation-and-verification/best-practices-for-verification-and-validation-in-product-development.md)
- [Requirement Validation and Traceability Explained](../raw/requirements-validation-and-verification/requirements-validation-and-traceability-explained.md)
- [Requirements Verification and Validation for Product Teams](../raw/requirements-validation-and-verification/requirements-verification-and-validation-for-product-teams.md)
- [What Is System Integration Testing (SIT)? A Complete Guide](../raw/requirements-validation-and-verification/system-integration-testing.md)
