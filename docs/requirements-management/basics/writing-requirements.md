# Writing Requirements

Requirements turn stakeholder needs into clear, testable obligations for a product or system. Good requirements let stakeholders, designers, implementers, testers, and reviewers reach the same interpretation and follow each obligation from its source through design and verification.

This guide consolidates practical rules, templates, examples, document structures, review practices, and quality measures for writing and managing requirements.

## 1. Start at the Right Level

Different requirements artifacts answer different questions. Names vary among organizations, so define every document's purpose and level explicitly.

| Artifact | Primary question | Typical content |
| --- | --- | --- |
| Business or stakeholder needs | Why is the work needed, and what outcome is expected? | Problem, objectives, value, scope, users, constraints, risks, applicable regulations |
| User Requirements Specification (URS) | What must users be able to accomplish? | Intended use, user-level capabilities, operating needs, user acceptance criteria |
| Product Requirements Document (PRD) | What product should be delivered, for whom, and for what release? | Product purpose, users, features, product requirements, release criteria, priorities, milestones |
| System Requirements Specification (SyRS) | What must the complete system do and how well must it perform? | System behavior, quality attributes, interfaces, operating limits, constraints, verification methods |
| Software Requirements Specification (SRS) | What must the software do and how well must it perform? | Software behavior, data, interfaces, quality attributes, constraints, acceptance criteria |
| Functional Requirements Document (FRD) | What externally observable functions must a system or subsystem provide? | Inputs, outputs, behavior, modes, states, error responses, functional acceptance criteria |
| Software Design Specification (SDS) | How will the software satisfy its requirements? | Architecture, modules, algorithms, data structures, APIs, design rationale |

The distinction between requirements and design is fundamental:

- A requirement defines a need, behavior, quality, interface, or constraint.
- A design specification defines the chosen implementation.
- A well-written requirement limits the range of acceptable designs without unnecessarily selecting one.

For example:

- Design-biased: `The aircraft shall have three engines.`
- Need-focused: `The aircraft shall meet its operating requirements with one engine inoperative.`

Only prescribe a specific technology or design when that choice is itself an authorized constraint, such as a contractual interface or mandatory standard.

## 2. Develop Requirements in a Deliberate Sequence

### 2.1 Define the problem and scope

Before writing detailed requirements, record:

- the problem or opportunity;
- the intended users and other affected stakeholders;
- the desired business and user outcomes;
- what is inside and outside the system boundary;
- the operating environment;
- known assumptions and dependencies;
- budget, schedule, technical, legal, safety, and regulatory constraints;
- the criteria by which the product or release will be judged successful.

Do not treat aspirations as system requirements. A goal such as “be the easiest product to use” may guide decisions, but it is not a testable obligation. Derive measurable requirements from it.

### 2.2 Elicit needs from all relevant stakeholders

Users are not a homogeneous group, and the obvious participants are rarely the only stakeholders. Depending on the product, contributors may include:

- customers, end users, operators, and maintainers;
- product, marketing, sales, and business leaders;
- systems, software, hardware, safety, security, and test engineers;
- quality, regulatory, legal, clinical, manufacturing, and support teams;
- suppliers, external systems, auditors, regulators, and affected members of the public.

Use interviews, workshops, observation, surveys, prototypes, operational scenarios, existing-system analysis, and applicable standards. Ask what stakeholders are trying to accomplish and what prevents them from doing it. A requested feature may be only one possible solution to the underlying need.

### 2.3 Move from goals to verifiable requirements

Work from the abstract to the concrete:

1. Identify the stakeholder goal.
2. Describe the operational scenario or user task.
3. Define the capability needed to support it.
4. Decompose the capability into individually verifiable requirements.
5. Define acceptance criteria and a verification method.
6. Trace each child requirement to its parent need.

Stop decomposing when each child requirement represents one obligation and can be verified coherently. Keep requirements at comparable levels of granularity within a section or baseline.

### 2.4 Validate early

Do not wait for a complete specification before testing its assumptions. Use:

- feasibility prototypes to expose technical obstacles;
- usability prototypes with representative users;
- concept tests to confirm that the proposed product solves a valued problem;
- models, workflows, wireframes, state diagrams, and interface diagrams to expose gaps;
- incremental reviews to find ambiguity, conflicts, omissions, and unnecessary requirements.

Feed the results back into the requirements before implementation makes correction expensive.

## 3. Anatomy of a Well-Formed Requirement

A requirement should identify, as applicable:

1. **Condition or precondition:** the state in which the requirement applies.
2. **Trigger:** the event that initiates the required behavior.
3. **Subject:** the system or component responsible.
4. **Obligation:** a consistently defined modal verb such as `shall`.
5. **Action or quality:** the required response, capability, or characteristic.
6. **Object:** the entity acted upon.
7. **Constraint or threshold:** measurable limits, timing, tolerance, or other bounds.

Example:

> When a user submits valid credentials, the access-control system shall display the account dashboard within 2 seconds under a load of 5,000 concurrent sessions.

This statement has a trigger, responsible subject, mandatory action, observable result, time limit, and test condition.

Not every requirement needs every element. An always-active physical constraint, for example, needs no trigger:

> The handheld unit shall have a mass of no more than 2.3 kg, including its installed battery.

## 4. Core Writing Rules

### 4.1 Express one obligation per requirement

Each requirement must state one capability, quality, interface obligation, or constraint. Separate obligations that have different owners, trace links, priorities, or verification methods.

Poor:

> The system shall validate credentials, display a welcome message, and send a verification email.

Better:

> AUTH-001: The system shall validate submitted login credentials.
>
> AUTH-002: When submitted login credentials are valid, the system shall display the account home page.
>
> REG-003: When a user completes registration, the system shall send a verification email to the registered address.

The word `and`, multiple modal verbs, or a long list of actions often indicates that a statement contains multiple requirements. `And` is still acceptable when it joins inseparable parts of one condition or one result.

### 4.2 Use active voice and name the responsible subject

Active voice makes ownership visible.

- Weak: `The alarm shall be activated when overheating is detected.`
- Better: `When the temperature sensor detects a temperature above 90 °C, the controller shall activate the alarm.`

Avoid pronouns when their referent could be unclear. Repeat the system or component name when necessary.

### 4.3 Use modal verbs consistently

Define modal verbs near the beginning of the specification and apply them consistently. A common convention is:

- `shall`: binding requirement;
- `must`: externally imposed constraint or an alternative binding form, if explicitly defined;
- `will`: statement of fact, declared intent, or expected behavior outside the specified system;
- `should`: recommendation, not a binding requirement;
- `may`: permission or optional possibility.

Do not alternate among `shall`, `must`, `will`, and `should` merely for style. If every requirement is binding, prefer a single modal such as `shall`.

### 4.4 Use precise, standardized language

Write concise sentences using terminology appropriate to the domain. Use one name for each concept throughout the specification, its diagrams, trace links, and tests. Define specialized terms, acronyms, units, modal verbs, and potentially confusing words in a glossary.

Avoid vague or subjective terms such as:

- fast, quick, soon, timely;
- easy, intuitive, user-friendly;
- adequate, appropriate, sufficient;
- normal, robust, resilient, efficient;
- support, optimize, minimize, maximize;
- as needed, where possible, if practical, and similar escape clauses.

Replace them with observable quantities and conditions.

- Vague: `The system shall respond quickly.`
- Measurable: `The system shall return a search-results page within 500 ms for 95% of requests while serving 1,000 concurrent users.`

### 4.5 Quantify limits and conditions

State:

- the measured parameter;
- units;
- lower and upper bounds or tolerance;
- the operating and test conditions;
- the population or percentile, when averages would hide failures;
- the measurement interval and method, when material.

Avoid unbounded comparatives such as “faster,” “improved,” or “more reliable” unless the baseline and required change are explicit.

### 4.6 Prefer positive statements

State what the system must do. Negative requirements can leave an unlimited set of unspecified alternatives.

- Weak: `The system shall not accept an invalid card number.`
- Better: `If a submitted card number fails validation, then the checkout system shall reject the submission and display the validation error.`

Use a negative construction when the prohibited behavior itself is the precise safety, security, or regulatory obligation:

> The infusion pump shall not deliver a bolus greater than the clinician-configured maximum dose.

### 4.7 Keep rationale and examples outside the requirement statement

Rationale helps reviewers understand intent, but it is not part of the obligation. Store it in a separate field or paragraph.

```text
ID: AUD-014
Requirement: The system shall retain security-audit records for at least 7 years after creation.
Rationale: The retention period supports the applicable records-management policy.
```

Likewise, label notes, examples, assumptions, diagrams, and explanatory text so readers do not mistake them for requirements.

### 4.8 Assign a stable unique identifier

Every requirement needs a persistent identifier so it can be reviewed, changed, reused, and traced without relying on its position in a document. Do not recycle an identifier after deleting its requirement.

A hierarchical code may communicate type or location, such as `SYS-FUNC-042`, but the identifier should remain stable if the requirement moves. Store hierarchy and classification as attributes rather than encoding too much meaning in the ID.

### 4.9 Write each requirement once

Duplication causes contradictions when one copy changes. Maintain one authoritative statement and cross-reference or reuse it elsewhere. Generated reports are snapshots; the controlled requirements repository or approved baseline remains the source of truth.

### 4.10 Mark unresolved information explicitly

During drafting, use a standard marker such as `TBD` for missing information. Give each TBD an owner, resolution date, and impact. Resolve all TBDs affecting an iteration or release before its requirements are baselined for implementation.

## 5. Use EARS to Structure Natural-Language Requirements

The Easy Approach to Requirements Syntax (EARS) constrains natural language with a small set of patterns. Clauses follow temporal order:

> `Where` optional feature, `While` state, `When` trigger, `If` unwanted condition, `then` system `shall` response.

Use only the clauses the requirement needs.

### 5.1 Ubiquitous: always active

Template:

> The `<system>` shall `<response>`.

Example:

> The engine control system shall prevent engine overspeed.

### 5.2 State-driven: active during a state

Template:

> While `<state>`, the `<system>` shall `<response>`.

Example:

> While no card is present, the ATM shall display “Insert card to begin.”

### 5.3 Event-driven: response to a trigger

Template:

> When `<trigger>`, the `<system>` shall `<response>`.

Example:

> When the user selects Mute, the laptop shall suppress all audio output.

### 5.4 Optional feature: applies only to a configured variant

Template:

> Where `<feature is included>`, the `<system>` shall `<response>`.

Example:

> Where the vehicle includes a sunroof, the vehicle shall provide a sunroof control on the driver's door.

### 5.5 Unwanted behavior: response to a fault or undesired condition

Template:

> If `<unwanted condition>`, then the `<system>` shall `<response>`.

Example:

> If computed airspeed is unavailable, then the flight-control system shall use modeled airspeed.

### 5.6 Complex: combines feature, state, and trigger clauses

Templates:

> Where `<feature>`, while `<state>`, when `<trigger>`, the `<system>` shall `<response>`.
>
> Where `<feature>`, while `<state>`, if `<unwanted condition>`, then the `<system>` shall `<response>`.

Example:

> While the aircraft is on the ground, when reverse thrust is commanded, the engine control system shall enable reverse thrust.

Complex EARS syntax should not become an excuse to combine multiple obligations. Split the result if it requires separate verification.

## 6. Classify the Requirement Correctly

Classification affects design ownership, verification, risk, and traceability.

### 6.1 Functional requirements

Functional requirements define observable behavior: what the system does in response to inputs, events, states, or interactions. They may cover:

- operations, calculations, workflows, and state transitions;
- input validation and output generation;
- data creation, retrieval, transformation, and deletion;
- user-interface behavior;
- authentication and authorization behavior;
- alarms, fault responses, and safety functions;
- interactions with other systems.

Examples:

> When an occlusion occurs in the infusion line, the infusion pump shall stop fluid flow and activate its audible alarm.
>
> When a product is unavailable, the storefront shall label the product “Out of stock” and disable its Add to Cart control.

The second example contains two observable results. Keep them together only if the product treats them as one inseparable response with a single verification and owner; otherwise split them.

### 6.2 Quality requirements

Quality requirements, often called non-functional requirements, define measurable properties of the system. They commonly cover:

- performance and resource efficiency;
- capacity and scalability;
- availability, reliability, fault tolerance, and recoverability;
- safety;
- security, privacy, and data integrity;
- usability and accessibility;
- maintainability, modifiability, serviceability, and supportability;
- portability, compatibility, and interoperability;
- manufacturability and environmental tolerance;
- localization and regulatory compliance.

Write a specific threshold under explicit conditions, not merely the category name.

- Vague: `The service shall be highly available.`
- Measurable: `The service shall provide at least 99.95% monthly availability, excluding approved maintenance windows announced at least 48 hours in advance.`

- Vague: `The device shall be portable.`
- Measurable: `The device shall have a mass of 2.3 kg ± 0.45 kg with its standard battery installed.`

- Vague: `The interface shall be easy to use.`
- Measurable: `At least 90% of first-time representative users shall complete the primary setup task within 5 minutes without assistance during the defined usability test.`

Identify quality requirements early. They often drive architecture and cannot be added late without broad redesign.

### 6.3 Constraints

Constraints restrict the solution space. Sources include contracts, existing environments, mandated platforms, interfaces, laws, standards, manufacturing capabilities, and procurement decisions.

Example:

> The controller shall exchange navigation data with the host vehicle through the specified CAN interface defined in ICD-017.

Do not disguise team preferences as constraints. Record the authority and rationale for every design-limiting requirement.

### 6.4 Interface requirements

Interface requirements define interactions across a system boundary. Specify, as applicable:

- source and destination;
- data content, schema, units, valid ranges, and encoding;
- protocol and physical connection;
- direction, timing, frequency, sequence, and synchronization;
- authentication and authorization;
- error detection, reporting, retry, and recovery behavior;
- versioning and compatibility.

Reference a controlled Interface Control Document when the full interface definition is maintained elsewhere.

### 6.5 Safety and regulatory requirements

Derive safety requirements from hazard and risk analysis. Derive regulatory requirements from a documented list of applicable obligations. Link each obligation to the requirement or control that satisfies it and to the evidence that verifies compliance.

State the required behavior or criterion instead of writing only “comply with `<standard>`.” Cite the precise controlled clause when appropriate, and make the resulting requirement independently verifiable.

## 7. Define Acceptance and Verification with the Requirement

If no one can devise an objective way to determine whether a requirement is satisfied, the requirement is not ready for a baseline.

### 7.1 Acceptance criteria

A complete acceptance criterion identifies:

1. **Parameter:** what is evaluated.
2. **Measurement method:** how it is evaluated.
3. **Pass/fail threshold:** what result is acceptable.
4. **Test conditions:** when and under what environment the result is valid.

Define acceptance criteria before executing the verification. Do not adjust “pass” after seeing the result.

Example:

```text
Requirement: The API shall return a successful account lookup within 300 ms for at least 99% of requests while processing 500 requests per second.
Method: Automated load test.
Measurement: Server-side elapsed time from receipt of a complete request to transmission of the complete response.
Pass criterion: At least 99% of 100,000 valid requests complete within 300 ms.
Conditions: Production-equivalent hardware, defined dataset version, warm caches, and no injected failures.
```

### 7.2 Verification methods

Assign one or more suitable methods to each requirement:

- **Test:** operate the item with controlled inputs and compare measured outputs with expected results.
- **Demonstration:** observe operation without detailed instrumentation or quantitative analysis.
- **Inspection:** examine the item, records, or documentation.
- **Analysis:** use calculations, models, simulation, or accumulated evidence.

The method should match the requirement. A visual label may be inspected, response time must be measured, and a probabilistic reliability target may require analysis supported by tests.

### 7.3 Write with verification in mind

Ask while drafting:

- What evidence would prove this requirement is satisfied?
- Can the result receive an unambiguous pass or fail verdict?
- Are the trigger, expected result, limit, and test conditions explicit?
- Can the requirement be verified independently of unrelated obligations?

## 8. Check the Quality of Each Requirement

An individual requirement should be:

- **Necessary:** it supports an authorized stakeholder need, parent requirement, risk control, contract, or regulation.
- **Correct:** it accurately represents its source and does not contradict a higher-level requirement.
- **Appropriate:** it is stated at the right abstraction level and allocated to the right system element.
- **Feasible:** it can be achieved within known technical, cost, schedule, and operating constraints.
- **Complete:** it contains all information needed to understand and verify the obligation.
- **Singular:** it expresses one obligation.
- **Unambiguous:** intended readers arrive at one interpretation.
- **Concise:** it contains no unnecessary explanation or repetition.
- **Implementation-independent:** it preserves design freedom unless a design constraint is justified.
- **Verifiable:** objective evidence can demonstrate satisfaction.
- **Traceable:** it has a stable identifier and links to its source and downstream evidence.
- **Prioritized:** its importance to the applicable release or baseline is recorded.

Correctness must be judged against the requirement's source. Users or legitimate user representatives validate user needs; engineers assess technical feasibility; test specialists assess verifiability; quality and regulatory specialists assess applicable compliance obligations. No single reviewer can reliably judge every attribute.

## 9. Check the Quality of a Requirements Set

A specification or baseline should be:

- **Complete:** all necessary requirements, interfaces, definitions, assumptions, and acceptance information are present for its scope.
- **Consistent:** requirements do not conflict with one another or with higher-level requirements.
- **Feasible as a set:** all requirements can be satisfied together, including competing quality targets.
- **Bounded:** scope and exclusions are explicit.
- **Prioritized:** the team can make informed tradeoffs when time or budget changes.
- **Modifiable:** requirements are uniquely identified, stated once, well organized, and version controlled.
- **Traceable:** every requirement has an authorized source and a planned downstream realization and verification path.
- **Current:** approved changes are incorporated and obsolete versions cannot be mistaken for the baseline.

Focusing on user tasks and operational scenarios helps expose missing requirements. Models and diagrams are useful for complex interactions, but their obligations must still be represented by controlled, traceable requirements where formal verification is required.

## 10. Organize Requirements Documents for Their Audience

### 10.1 Common front matter

Most controlled requirements documents need:

1. Purpose and intended audience
2. Scope, system boundary, and exclusions
3. Referenced documents and applicable standards
4. Definitions, acronyms, and modal-verb conventions
5. System or product context
6. Assumptions, dependencies, and constraints
7. Requirements organized in a meaningful hierarchy
8. Acceptance and verification information
9. Traceability information
10. Revision history and approvals

Possible hierarchies include mission → phase → function, function → subfunction, or feature → use case. Choose the scheme that helps contributors and consumers find, review, and change related requirements.

### 10.2 PRD outline

A practical Product Requirements Document includes:

1. Product purpose, problem, and value proposition
2. Strategic alignment and success measures
3. Primary users, their goals, and key tasks
4. Scope and explicit non-goals
5. Features, each with purpose, supported user task, requirements, constraints, assumptions, and acceptance criteria
6. Product-level quality, safety, security, and compliance requirements
7. Release criteria: functionality, usability, reliability, performance, and supportability
8. Priorities, dependencies, milestones, and target release window
9. Wireframes, workflows, or prototypes where they clarify intent
10. Open issues, decisions, trace links, and revision history

Keep the PRD concise enough to be used. Move detailed subsystem requirements into lower-level specifications rather than turning the PRD into an unreadable master document.

### 10.3 SyRS or SRS outline

A practical system or software requirements specification includes:

1. Purpose, scope, audience, and terminology
2. System context and operating environment
3. Users, modes, states, assumptions, and dependencies
4. Functional requirements
5. Quality requirements
6. External user, hardware, software, and communication interfaces
7. Safety, security, regulatory, and design constraints
8. Acceptance criteria and assigned verification methods
9. Traceability to parent needs and planned design/test evidence
10. Baseline, revision, and approval records

Do not place architecture, algorithms, module designs, project cost, or delivery schedules in the SRS unless they are genuine authorized constraints.

### 10.4 URS considerations for regulated work

Write the URS before selecting a solution or vendor so it can influence the design. Organize it around intended use and user-level functional, operational, quality, safety, data-integrity, and regulatory needs. Give every requirement measurable acceptance criteria and a unique identifier.

After approval, maintain bidirectional traceability from each user requirement through design and qualification or validation evidence. Record intentionally inapplicable requirements with a justification rather than silently omitting them.

### 10.5 Design specification outline

A design specification is downstream from requirements and commonly includes:

1. Purpose, scope, and referenced requirements baseline
2. System architecture and rationale
3. Module responsibilities, algorithms, data structures, and safety boundaries
4. Data models, data flow, and persistence
5. Internal and external interface designs
6. Design responses to performance, reliability, security, and other constraints
7. User-interface design
8. Traceability from requirements to design elements and verification
9. Revision history and approvals

Prepare it early enough to guide implementation and review; do not reconstruct it after the product is built.

## 11. Review, Baseline, and Control Change

### 11.1 Conduct cross-functional reviews

Review requirements early, iteratively, and with the people who can judge different qualities. A review should confirm:

- every requirement has an authorized source;
- the requirement is necessary, clear, singular, feasible, and verifiable;
- acceptance criteria and a verification method exist;
- interfaces and operational scenarios are covered;
- conflicts and tradeoffs have been resolved;
- terminology is consistent;
- safety, security, quality, and compliance concerns are addressed;
- every requirement is allocated and prioritized;
- the set contains no unexplained TBDs for the work being approved.

Capture decisions and revise the authoritative requirements, rather than leaving clarifications only in meeting notes or conversations.

### 11.2 Establish a baseline

A baseline is an approved requirements set for a defined release or iteration. Iterative development does not require the entire future product to be completely specified, but the requirements committed to an iteration must be sufficiently complete and stable for that work.

Record the baseline version, contents, date, approvers, and unresolved exceptions. Ensure every participant can identify the current version.

### 11.3 Apply formal change control

For each proposed addition, modification, or deletion:

1. Record the request, source, rationale, and urgency.
2. Identify affected parent and child requirements, design elements, interfaces, risks, tests, procedures, documentation, training, schedule, and cost.
3. Evaluate benefits, feasibility, safety, compliance, and residual risk.
4. Approve, reject, or defer the request through the defined authority.
5. Update the requirement and every affected downstream artifact.
6. Reverify or revalidate where required.
7. Update trace links, the baseline version, and the change history.

A requirement change is incomplete while any affected trace link or downstream artifact remains unresolved.

## 12. Maintain Bidirectional Traceability

Each requirement should trace backward to its justification and forward to its realization and evidence.

```text
Business objective / regulation / hazard
                  ↓
        Stakeholder or user need
                  ↓
        System or product requirement
                  ↓
       Subsystem/software requirement
                  ↓
        Design element / risk control
                  ↓
        Verification or validation evidence
```

Backward traceability helps confirm that every requirement and test is justified. Forward traceability helps confirm that every requirement is designed, implemented, and verified. Orphan design elements may indicate unapproved scope; orphan tests may indicate missing requirements; requirements without tests indicate verification gaps.

Useful requirement attributes include:

- unique identifier and title;
- statement and separate rationale;
- type and abstraction level;
- source and parent links;
- owner and allocated component;
- priority and release;
- risk or criticality classification;
- status and baseline version;
- verification method and acceptance criteria;
- design, test, risk-control, and evidence links;
- change history.

## 13. Measure Requirements Work

Use a small, purposeful set of metrics to improve the process rather than to reward raw volume.

### 13.1 Size and progress

Count requirements only at a consistent granularity, preferably individually verifiable leaf requirements. Consider story points, use-case points, or another relative sizing method when raw counts do not represent effort. Include the architectural and implementation impact of demanding quality requirements in estimates.

Track status with a defined workflow such as:

- proposed;
- reviewed;
- approved or baselined;
- implemented;
- verified;
- deferred;
- rejected;
- deleted;
- delivered.

Define each status so different contributors apply it consistently.

### 13.2 Quality

During inspections, classify defects such as:

- missing or unnecessary requirement;
- incorrect requirement;
- incomplete condition or response;
- ambiguity;
- conflict;
- infeasibility;
- non-atomic statement;
- unverifiable threshold;
- missing trace or acceptance criterion.

Useful measures include:

- defect density: defects found per requirement or inspected page;
- inspection efficiency: defects found per review labor-hour;
- inspection effectiveness: percentage of estimated total defects found during requirements review;
- requirements escape rate: requirements defects first found during design, implementation, test, or operation;
- verification coverage: percentage of approved requirements linked to adequate verification evidence.

Use trends and root-cause analysis to improve elicitation, writing, and review practices. Sampling can estimate quality, but only when the sample is representative and the limitations are acknowledged.

### 13.3 Change

Track change-request volume, source, age, status, decision, implementation effort, and affected artifacts. A simple volatility measure for a period is:

> requirements volatility = number of requirements changed during the period ÷ number of requirements at the start of the period

Volatility is not inherently bad. Monitor whether the team can absorb it and whether accepted changes trend downward as a release approaches. Persistent late change may expose weak elicitation, unresolved decisions, or an unstable business context.

### 13.4 Effort

Track time spent on elicitation, analysis, authoring, review, traceability, and change management. Compare that investment with product size, escaped defects, and rework. Use the organization's own historical data to estimate future requirements work.

## 14. Common Failure Patterns and Corrections

| Failure | Poor example | Correction |
| --- | --- | --- |
| Vague performance | `The application shall load quickly.` | `The application shall display the dashboard within 2 seconds for 95% of requests under the defined peak load.` |
| Subjective usability | `The interface shall be intuitive.` | `At least 90% of representative first-time users shall complete Task A within 4 minutes without assistance.` |
| Multiple obligations | `The system shall authenticate the user and display the dashboard and send an alert.` | Create separate requirements for authentication, navigation, and notification. |
| Passive ownership | `An alert shall be issued when pressure is high.` | `When pressure exceeds 250 kPa, the monitor shall issue the high-pressure alert.` |
| Design masquerading as need | `The service shall use database X.` | State the required capacity, latency, durability, and compatibility; retain database X only if it is an authorized constraint. |
| Negative-only behavior | `The form shall not accept bad input.` | `If an entry violates rule V-12, then the form shall reject the entry and identify the violated field.` |
| Unverifiable compliance | `The device shall follow security best practices.` | Identify the applicable control or standard clause and state the observable criterion. |
| Missing conditions | `The system shall support 5,000 users.` | Define what those users are doing, for how long, on which environment, and with what performance threshold. |
| Ambiguous reference | `It shall store it after processing.` | Name the responsible component and the data object. |
| Embedded rationale | `The system shall log all actions so auditors can investigate incidents.` | Keep the retention and content obligation in the requirement; store the audit rationale separately. |
| Obsolete duplicate | The same obligation appears in several sections. | Maintain one authoritative requirement and reference it. |
| Premature baseline | A committed requirement still contains `TBD`. | Resolve the gap or remove the affected work from the approved scope. |

## 15. Reusable Requirement Record

Use a structured record instead of relying on prose alone:

```text
ID: <stable unique identifier>
Title: <short descriptive name>
Type: <functional | quality | interface | constraint | safety | regulatory>
Level: <user | product | system | subsystem | software>
Requirement: <condition/trigger + subject + shall + response + threshold>
Rationale: <why this obligation exists>
Source: <stakeholder need, parent requirement, hazard, contract, or regulation>
Priority / Release: <defined scheme>
Owner / Allocation: <responsible team or system element>
Acceptance criteria: <parameter, method, threshold, conditions>
Verification method: <test | demonstration | inspection | analysis>
Trace links: <parents, children, design, risk controls, tests, evidence>
Status / Baseline: <defined lifecycle state and version>
```

## 16. Final Authoring Checklist

Before submitting a requirement for review, ask:

- Does it have a stable unique ID?
- Does it trace to an authorized source?
- Is it necessary and allocated at the correct level?
- Does it name the responsible system or component?
- Does it use the agreed mandatory modal verb?
- Does it express exactly one obligation?
- Are state, trigger, response, limits, units, and conditions explicit where needed?
- Will all intended readers interpret it the same way?
- Is it concise, active, and free of vague adjectives, adverbs, pronouns, and escape clauses?
- Does it describe the need without unnecessarily prescribing the solution?
- Can it be satisfied within known constraints?
- Can objective evidence produce a clear pass or fail result?
- Are rationale, notes, examples, and assumptions stored separately?
- Are priority, owner, status, verification method, and acceptance criteria recorded?
- Are forward and backward trace links complete?

Before approving a requirements set, also ask:

- Does it cover every in-scope user task, operating mode, interface, fault response, quality attribute, risk control, and regulatory obligation?
- Have conflicts, tradeoffs, duplicates, missing links, and applicable TBDs been resolved?
- Have representative stakeholders, implementers, testers, and assurance specialists reviewed it?
- Is the approved baseline identifiable, current, and under change control?
