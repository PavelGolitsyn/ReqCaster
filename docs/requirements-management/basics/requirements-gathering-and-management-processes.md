# Requirements Gathering and Management Processes

## Purpose

Use this guide to discover, analyze, document, approve, and manage requirements throughout a product lifecycle. The goal is not to freeze requirements prematurely. The goal is to establish a shared, testable understanding of what must be built, why it is needed, and how changes will be controlled.

Requirements work should reduce ambiguity, expose missing constraints early, support realistic planning, and connect stakeholder needs to design, verification, validation, risk controls, and compliance evidence.

## Core Terms

### Requirements engineering

Requirements engineering is the overall discipline that translates a real-world problem into a product definition. It includes:

1. Elicitation: discover needs, expectations, constraints, assumptions, and risks.
2. Specification: express functional, non-functional, interface, constraint, and risk-related requirements.
3. Verification and validation: confirm that requirements are well formed and represent the right product.
4. Requirements management: prioritize, trace, review, approve, baseline, and control changes throughout development.

Requirements management is therefore part of requirements engineering, not a synonym for the whole discipline.

### Gathering and elicitation

- **Gathering** collects information that already exists in scattered sources, such as regulations, process models, interfaces, business rules, prior products, and user feedback.
- **Elicitation** actively draws out knowledge from stakeholders through interviews, observation, workshops, surveys, prototypes, and similar techniques.
- **Requirements gathering** is often used as the umbrella term for stakeholder identification, collection, elicitation, analysis, documentation, validation, prioritization, approval, and sign-off.

### Needs and requirements

- A **stakeholder need** explains the outcome a stakeholder needs. Express it in natural language and keep it solution-neutral.
- A **stakeholder requirement** is a binding, top-level statement of what the product must provide to satisfy a need.
- A **product requirement** transforms integrated stakeholder needs into a precise statement against which the product can be designed and verified.

Do not skip directly from one stakeholder's request to a product requirement. First reconcile the needs of all relevant stakeholder groups.

### Product scope and project scope

- **Product scope** defines the features and behavior of the product.
- **Project scope** defines the work required to deliver that product scope.

Requirements describe what should or should not be included in the product. The project scope describes the materials, activities, deliverables, schedule, and resources needed to deliver it.

### Verification and validation

- **Verification** asks whether a requirement is stated and implemented in a way that can be objectively proven.
- **Validation** asks whether the requirement and resulting product address the actual stakeholder need.

Plan both early. A requirement can be implemented exactly as written and still fail validation if it describes the wrong outcome.

## Operating Principles

1. Treat requirements as living, controlled artifacts rather than a one-time document.
2. Identify all relevant stakeholder classes before detailed drafting.
3. Use more than one elicitation technique when uncertainty or risk is significant.
4. Separate the problem and required outcome from the implementation solution.
5. Make every requirement necessary, clear, complete, consistent, feasible, and verifiable.
6. Give every requirement a unique identity, source, rationale, owner, priority, history, and verification method.
7. Establish traceability when a requirement is created, not at the end of the project.
8. Review requirements with the people who will design, build, test, document, operate, maintain, regulate, or approve the product.
9. Baseline requirements only when they are good enough to proceed at an acceptable level of risk.
10. Manage changes against an approved baseline through explicit impact analysis and decision-making.
11. Adapt the timing and level of detail to the delivery model, but do not relax review, traceability, or change control.
12. Reuse only governed, versioned, applicable content; reuse is not permission to copy requirements blindly.

## End-to-End Process

### 1. Establish the problem, objectives, and initial scope

Define the business problem or opportunity before proposing functionality. Record:

- the desired outcomes and success measures;
- the product boundary and external context;
- known business rules, regulations, standards, and contractual constraints;
- assumptions, dependencies, risks, and interfaces;
- what is explicitly in scope and out of scope;
- the expected release or increment;
- known limits on schedule, staff, budget, features, and quality.

Do not treat scope as an informal understanding. Create a scope statement, obtain formal approval, and use it as the reference for later requests.

### 2. Identify stakeholders

Create a stakeholder map before detailed elicitation. Include more than customers and end users. Depending on the product, consider:

- internal and external customers;
- each distinct user class;
- product, business, and engineering leaders;
- developers, architects, testers, and technical writers;
- human-factors and accessibility specialists;
- quality, safety, risk, security, privacy, and regulatory teams;
- manufacturing, operations, service, support, sales, and maintenance staff;
- suppliers, subsystem owners, integration partners, and regulatory authorities.

Assign representatives for each group and define who contributes, reviews, resolves conflicts, and approves. Search deliberately for hidden stakeholders whose constraints may otherwise appear late.

### 3. Gather existing evidence

Study available material before asking stakeholders to repeat what is already known. Review:

- laws, regulations, standards, and policies;
- contracts, business rules, and process models;
- existing specifications, baselines, test cases, and risk analyses;
- current products and competing or analogous solutions;
- system, hardware, software, user, and communication interfaces;
- support records, maintenance reports, analytics, and user feedback;
- known defects, change requests, and lessons from earlier projects.

Use this evidence to identify gaps, refine the stakeholder list, and select suitable elicitation techniques.

### 4. Plan elicitation

Choose techniques according to the type of uncertainty, stakeholder availability, complexity, and risk. Plan the practical work required, including:

- negotiating access and commitments with stakeholder representatives;
- preparing questions, workshops, and surveys;
- observing existing work;
- creating and evaluating prototypes or models;
- performing feasibility, risk, safety, failure, or hazard analysis;
- capturing findings in the system of record;
- reviewing and revising specifications;
- deriving test cases and walking through them with stakeholders.

Define a facilitator, participants, agenda, expected output, decision method, and follow-up owner for every elicitation activity.

### 5. Elicit needs, constraints, and assumptions

Use a combination of the techniques described later in this guide. During each activity:

- ask about goals, triggers, normal flows, exceptions, failure modes, data, interfaces, environmental conditions, and constraints;
- distinguish stated wants from underlying needs;
- surface tacit knowledge by asking people to demonstrate real work;
- record decisions, unresolved questions, assumptions, and dissent;
- confirm notes with participants;
- avoid leading questions and premature solution design.

### 6. Model and analyze the findings

Turn raw statements into a coherent view of the problem. Model workflows, data, roles, interactions, states, or gaps when a visual representation will expose omissions or conflicts.

Then:

1. Review all gathered evidence and models.
2. Identify drivers, constraints, feasibility concerns, and risks.
3. Detect missing cases, duplicate needs, contradictions, and inconsistent terminology.
4. Resolve conflicts among stakeholder groups explicitly.
5. Form an integrated set of stakeholder needs.
6. Transform those needs into product requirements.
7. Trace every product requirement back to its source and rationale.

Analysis is iterative. Repeat it for features or increments as new evidence appears.

### 7. Document and organize requirements

Use a single controlled system of record. A small, low-risk project may use a structured document or spreadsheet; complex, multi-team, long-lived, or regulated work usually requires stronger support for relationships, versions, reviews, and audit history.

For each requirement, record at least:

- unique identifier;
- requirement statement;
- type and level;
- source and upstream need;
- rationale;
- owner;
- priority and criticality;
- status and target release or baseline;
- assumptions and dependencies;
- related interfaces, risks, and constraints;
- downstream design allocation;
- verification method and acceptance criteria;
- version and change history.

Organize requirements hierarchically from stakeholder need to system, subsystem, and component requirements where appropriate.

### 8. Review, verify, and validate

Review requirements with stakeholder representatives and downstream consumers. Use prototypes, models, walkthroughs, test cases, and structured reviews to answer:

- Does this set describe the right product?
- Is every requirement necessary and within scope?
- Is the meaning unambiguous to different disciplines?
- Is each statement complete, consistent, correct, and feasible?
- Can compliance with it be shown by test, inspection, analysis, or demonstration?
- Are acceptance thresholds objective?
- Does every requirement have an upstream justification?
- Do all important needs, interfaces, constraints, risks, and user classes have coverage?

Send documented findings to participants for confirmation. Revise when they expose errors or new requirements, and repeat the review until the set is good enough to support development at an acceptable risk.

### 9. Prioritize, negotiate, and approve

Prioritize requirements using product value, criticality, risk, compliance obligation, dependency, effort, and implementation impact. Resolve conflicts openly; do not hide them in ambiguous wording.

Obtain approval from the authorized representatives of all relevant stakeholder groups. Record who approved which version and when. Approval establishes a shared commitment, not a promise that the requirements will never change.

### 10. Establish a baseline

A requirements baseline is a named, reconstructable snapshot of the reviewed and approved requirement versions committed to a particular release or increment.

The baseline may be:

- an entire specification containing exactly the committed requirements;
- a defined subset of a larger repository;
- several coordinated software, hardware, and interface specifications;
- a small group of backlog items committed to an iteration.

The baseline must identify exact requirement versions. Future or lower-priority requirements may remain in the repository without belonging to the current baseline.

### 11. Manage change and traceability

After baselining, route proposed additions, modifications, and deletions through change control. For each request:

1. State the proposed change and its reason.
2. Identify the affected baseline and artifacts.
3. Trace upstream to the originating need, rule, or risk.
4. Trace downstream to design, implementation, interfaces, tests, risks, documents, schedules, budgets, and compliance evidence.
5. Assess value, technical feasibility, safety, quality, cost, schedule, staffing, and release impact.
6. Decide to approve, reject, defer, or exchange scope.
7. Record the decision, decision-makers, rationale, and date.
8. Update affected artifacts and links.
9. Review and approve the revised requirement.
10. Create or update the appropriate baseline while preserving prior versions.

Change control exists to support informed change, not to prevent it.

## Elicitation Techniques

No single technique is sufficient for every requirement layer. Combine techniques and select them for the knowledge you need to uncover.

### Document and interface analysis

Use when rules, constraints, current behavior, or prior decisions already exist. Analyze process models, regulations, business rules, system interfaces, feedback, specifications, and test assets. Record contradictions, stale assumptions, and missing ownership instead of copying content uncritically.

### Interviews

Use for in-depth knowledge from a subject-matter expert or stakeholder.

- Prepare open questions that invite explanation.
- Share questions in advance when preparation will improve the answer.
- Ask about exceptions and observed problems, not only the ideal process.
- Take notes and return them to the participant for confirmation.

### Observation and job shadowing

Use when the product changes or supports an existing work process. Observe passively to see natural behavior or actively ask questions while the work occurs. Capture environmental constraints, handoffs, shortcuts, failure points, and tacit assumptions. Confirm your interpretation with the person observed.

### Workshops

Use when the need is unclear, time is limited, or multiple groups must reconcile competing views.

- Set a bounded timeframe, agenda, scope, and expected decisions.
- Include the relevant cross-functional participants.
- Use brainstorming, focus-group discussion, models, or prototypes as needed.
- Facilitate so that one voice does not dominate.
- Record requirements, conflicts, decisions, and action owners in real time.

### Brainstorming

Use when existing solutions do not adequately address the objective and alternative ideas are needed. Assemble a diverse group, maintain focus on the defined problem, defer evaluation while generating options, then evaluate the recorded ideas against needs and constraints.

### Focus groups

Use to gather concentrated feedback from representatives of a stakeholder population. Ask neutral questions about a defined area, encourage interaction among participants, and distinguish broad patterns from individual preferences.

### Surveys and questionnaires

Use for structured input from a large or distributed population. Select participants according to explicit criteria. Write clear, non-leading questions. Choose closed or open responses according to the intended analysis. Use surveys to quantify or broaden insights, usually in combination with interviews or workshops.

### Prototyping and wireframing

Use when written descriptions are too abstract or stakeholders need something concrete to evaluate. Start with the lowest fidelity that can answer the question: storyboard, paper sketch, wireframe, interactive screen, navigation flow, or working prototype.

State that the prototype is a learning artifact, not a design commitment. Gather feedback, update the requirements, and increase fidelity only when necessary.

### Story mapping

Arrange user stories along the end-to-end user journey. Use the map to reveal missing paths, dependencies, and release slices and to identify the minimum valuable product along the user's critical path.

### Three Amigos review

Have a product representative, developer, and tester examine a story together before implementation. Confirm business intent, technical interpretation, acceptance criteria, testability, and edge cases.

### Sprint reviews and continuous feedback

Demonstrate working product increments to stakeholders. Observe their reactions, record new learning, and feed it into backlog refinement and the next iteration. Do not treat a sprint review as a substitute for controlled documentation and traceability.

## Analysis and Modeling Techniques

Choose the smallest model that answers the current question. Keep every model synchronized with the requirements it informs.

### Flowcharts

Use to show activity sequence and control logic. They are accessible and can highlight critical process attributes, but complex flows become dense and changes require redraws.

### Data-flow diagrams

Use to show processes, data flows, stores, external entities, and system boundaries. They communicate well to technical and non-technical audiences and can help define scope, but they do not represent physical considerations and may be costly for complex systems.

### Role-activity diagrams

Use to show actions and responsibilities by role in workflows, business processes, use cases, or protocols. They support cross-role discussion but become unwieldy if many workflows share one diagram and do not explain object behavior in depth.

### UML

Use behavioral diagrams for what the product does and structural diagrams for how its parts relate. Select only the relevant UML form, such as use-case, sequence, interaction, or class diagrams. Complex diagrams can obscure meaning, and models must be maintained consistently with the implementation.

### BPMN

Use standardized process notation to describe business activities, participants, flows, and data. It can express complex business processes to mixed audiences, but it is not intended for non-process views.

### IDEF

Use the relevant IDEF technique to examine functions, data, objects, or parent-child system relationships. It is broadly applicable and readable, but mixing IDEF techniques can be difficult and it is not a software development method.

### Gap analysis

Compare the current state with the target state to identify unmet business or data needs and areas requiring attention. Investigate root causes separately; a listed gap does not explain why it exists.

### Journey and stakeholder-experience maps

Map the stakeholder's relationship with the business or product over time to reveal pain points and unmet needs. Prefer a voice-of-the-stakeholders view when focusing only on customers would omit other important classes.

### Gantt charts

Use for planning and coordinating requirements activities, dependencies, timing, and resources—not for defining product behavior. Large plans become expensive to maintain, and elapsed time does not necessarily represent effort.

## Requirement Authoring Rules

### State the required outcome

Write what the product must achieve, not an arbitrary implementation choice. Include a solution constraint only when its source makes it genuinely necessary.

Bad:

> The application shall use a red rectangular SQL-backed modal to warn users.

Better:

> When an unsaved record would be discarded, the application shall require the user to confirm or cancel the navigation.

### Make the requirement measurable

Avoid subjective terms such as *quickly*, *easy*, *user-friendly*, *sufficient*, and *appropriate* unless they are paired with an objective criterion.

Bad:

> The system shall respond quickly.

Better:

> For 95% of valid search requests under the specified nominal load, the system shall display results within 500 milliseconds.

### Keep needs and requirements distinct

Need:

> A carpenter needs to drill holes two inches deep.

Product requirement:

> The drill bit shall create a hole at least two inches deep in the specified material under the stated operating conditions.

The need explains the outcome. The requirement provides a verifiable product obligation without prescribing unnecessary manufacturing details.

### Define verification at authoring time

Assign one or more verification methods—test, inspection, analysis, or demonstration—and objective acceptance criteria when the requirement is written. If no one can describe how to prove compliance, revise the requirement.

### Use complete metadata and consistent language

- Use agreed terms from a shared glossary.
- Write one principal obligation per requirement when practical.
- State triggers, conditions, thresholds, units, and tolerances explicitly.
- Identify assumptions and exceptions.
- Avoid pronouns with unclear referents.
- Avoid combining requirements with rationale or design commentary in the same statement; store those in separate fields.
- Use a shared authoring standard, including structured syntax where useful.

## Traceability Rules

Maintain bidirectional links so that the team can answer both “Why does this requirement exist?” and “What is affected if it changes?”

At minimum, connect requirements to applicable:

- stakeholder needs and source evidence;
- business rules, regulations, and standards;
- parent and child requirements;
- interfaces and assumptions;
- hazards, risks, and controls;
- architecture and design elements;
- implementation units where appropriate;
- verification plans, test cases, and results;
- validation plans and evidence;
- releases, baselines, approvals, and change decisions.

Every requirement should have an upstream justification and at least one planned method of verification. Review traceability regularly for missing links, suspect relationships, and changed artifacts.

## Scope Management

### Create and control the scope

1. Identify stakeholders and set participation expectations.
2. Gather the information needed to define the desired product.
3. Write an unambiguous scope statement with inclusions, exclusions, assumptions, constraints, and deliverables.
4. Obtain formal stakeholder approval.
5. Build a work breakdown structure for project deliverables.
6. Validate scope throughout delivery against requirements and performance information.

### Handle scope additions explicitly

When a requested feature is outside the approved scope, do not absorb it silently. Assess and agree on one or more responses:

- remove or defer lower-priority functionality;
- add staff or specialist capacity;
- outsource suitable work;
- extend the schedule;
- increase the budget;
- defer the addition to a later release;
- reject the request when its value does not justify the impact.

Document the choice through the change process. A small unreviewed addition can affect design, testing, documentation, compliance evidence, and future commitments.

### Avoid scope-management failures

- Do not leave work or exclusions vaguely defined.
- Do not omit apparently small deliverables.
- Do not approve scope without all important stakeholder perspectives.
- Do not proceed without formal approval.
- Do not equate a stakeholder's desire with an automatically approved requirement.
- Do not add unrequested features merely because implementation seems convenient.

## Baselining Rules

### Baseline readiness checklist

Create a baseline when the requirement set is sufficiently understood for realistic commitment—not when it is perfect. Before baselining, confirm:

- **Business rules:** applicable rules are identified and requirements address them.
- **Change control:** the process, authority, tool, and trained participants are ready.
- **Customer perspective:** current needs, priorities, and user classes have been rechecked.
- **Interfaces:** external user, software, hardware, and communication interfaces are covered.
- **Model validation:** stakeholder representatives have walked through models and representative test cases.
- **Prototypes:** the intended participants evaluated them and findings changed the specification where needed.
- **Alignment:** business objectives, stakeholder needs, and product requirements agree.
- **Downstream review:** design, development, test, documentation, human factors, operations, and other consumers have reviewed the set.
- **Scope:** every baselined requirement belongs to the approved scope.
- **Open items:** unresolved TBDs are absent or explicitly accepted with owners and plans.
- **Coverage:** all required specification sections are populated or marked not applicable, including quality attributes, constraints, and assumptions.
- **User classes:** appropriate representatives of every identified class contributed.
- **Verifiability:** each requirement has objective acceptance criteria and a verification approach.

### Timing signals

- A surge of immediate change requests may mean the baseline was created too early or elicitation was incomplete.
- Repeated delay in baselining may indicate analysis paralysis.
- Baseline when requirements have converged enough to support design, estimation, and construction within the project's accepted risk.

After baselining, project managers can make better staffing, budget, and schedule commitments. Include contingency for expected requirements growth.

## Estimating Requirements Work

There is no universal percentage or duration for requirements work. Industry averages may describe projects unlike yours and may not distinguish successful projects from unsuccessful ones.

Estimate using your own historical data:

1. Measure the actual effort spent on elicitation, analysis, specification, review, validation, traceability, and change management.
2. Record project size, complexity, stakeholder count, novelty, regulatory burden, distribution, lifecycle, and outcome.
3. Use comparable past projects as a starting point.
4. Adjust for differences and score material risk factors, for example from 0 (no effect) to 5 (major effect).
5. Include both initial definition and ongoing management effort.
6. Review actuals after delivery and update the estimating model.

Budget for the activities the project will actually need, not merely for writing a specification. More rigorous early work can shorten total delivery by preventing design, code, test, and compliance rework, but excessive analysis without decisions also delays value.

## Lifecycle Guidance

### Sequential delivery

Define more of the requirement set before design and implementation, while still planning for later clarification and controlled change. Do not assume sign-off eliminates change.

### Iterative and incremental delivery

Spread requirements work across the lifecycle:

1. Perform enough initial exploration to define the problem, high-level scope, risks, architecture drivers, and prioritized backlog.
2. Refine an item shortly before the iteration in which it will be built.
3. Clarify acceptance criteria, estimate effort, and split work until the item is small and understood enough to be ready.
4. Commit a small baseline for the iteration or release.
5. Design, build, integrate, and verify the increment.
6. Demonstrate working behavior and gather feedback.
7. Update requirements, priorities, and trace links for the next cycle.

Use user stories to express value, for example:

> As a registered user, I want to reset a forgotten password so that I can regain access without contacting support.

Keep the product backlog as a controlled, dynamic repository rather than an unstructured wish list. Agile changes the timing and granularity of requirements work; it does not remove the need for quality, documentation, approval, traceability, or compliance evidence.

Not every product can be released in very small increments. Replacement systems, tightly coupled systems, hardware-dependent products, and regulated products may require a critical mass of functionality before release. Still define and verify each planned increment well enough to prevent unnecessary rework.

## Reusing Requirements and Tests

Reuse validated content to reduce duplicate work, inconsistency, review effort, and compliance risk across products and variants.

### Build governed libraries

- Store approved reusable requirements and test cases in a centralized repository.
- Organize content into small, coherent modules.
- Use standard names, formats, taxonomy, and tags.
- Record applicability, assumptions, supported contexts, owner, source, version, status, and history.
- Preserve relationships among needs, requirements, risks, and verification assets when copying or instantiating a module.

Good reuse candidates include stable compliance obligations, common platform behavior, shared interfaces, core workflows, requirement templates, and corresponding test cases.

### Control synchronization and variation

For each reused item, define whether it is:

- linked to a master and expected to receive approved updates;
- copied as a fixed version;
- tailored as an intentionally divergent variant.

Before propagating a master change:

1. Compare the source and each consuming variant.
2. Assess applicability and downstream impact in every product context.
3. Review and approve the update.
4. Propagate it through controlled synchronization.
5. Preserve justified deviations and their rationale.
6. Update traceability and affected tests.

Never assume that a previously approved requirement remains correct in a new context. Revalidate its interfaces, operating conditions, regulations, hazards, thresholds, and verification method.

### Reuse test cases responsibly

- Maintain a centralized, curated test repository.
- Standardize test-case structure.
- Map each test to the requirements it verifies.
- Review tests regularly for currency and applicability.
- Assign ownership for reusable test content.
- Version tests with the requirements and product variants they cover.

## Selecting a Requirements Repository or Tool

Select the lightest solution that can reliably support the project's complexity and obligations. Evaluate whether it provides:

- a single authoritative source;
- structured metadata and unique identifiers;
- version and baseline reconstruction;
- bidirectional traceability;
- impact analysis;
- reviews, decisions, approvals, and audit history;
- change-control workflows;
- reuse, comparison, synchronization, and variant management;
- links to risk, test, design, and implementation systems;
- access control and compliance evidence;
- usable collaboration across disciplines and locations.

Documents and spreadsheets may be sufficient for a small, low-risk, lightly regulated effort. They become fragile when teams cannot keep versions, relationships, reviews, and approvals consistent by hand.

## Common Failure Modes

### Missing or late stakeholders

Symptom: new constraints or user classes appear after design has begun.

Response: expand the stakeholder map, revisit source evidence, repeat elicitation, and analyze the impact before changing the baseline.

### Ambiguous requirements

Symptom: different disciplines implement or test different interpretations of the same statement.

Response: add explicit triggers, conditions, units, thresholds, and acceptance criteria; review the revision cross-functionally.

### Multiple sources of truth

Symptom: documents, spreadsheets, and messages disagree about the current requirement.

Response: designate one controlled system of record and treat other views as generated or referenced representations.

### Premature solution design

Symptom: requirements prescribe technology or interface details without a traceable constraint.

Response: restate the stakeholder outcome and move optional design choices into design artifacts.

### Uncontrolled scope creep

Symptom: seemingly small additions accumulate without changes to cost, schedule, tests, or approval.

Response: compare the request with approved scope and baseline, perform impact analysis, and negotiate an explicit change.

### Over-engineering

Symptom: the team adds behavior that no approved requirement or need justifies.

Response: remove it or submit it as a proposed requirement with rationale and impact.

### Insufficient feedback

Symptom: misunderstandings surface during integration or acceptance.

Response: increase early reviews, model walkthroughs, prototypes, test-case reviews, and demonstrations.

### Stakeholder resistance

Symptom: required participants withhold input, reject late decisions, or avoid approval.

Response: identify resistance early, understand its cause, clarify decision rights and consequences, and work through disagreements before baselining.

### Baseline extremes

Symptom: either constant changes immediately after approval or endless refusal to approve.

Response: assess whether elicitation was incomplete or analysis has become perfectionism; apply the readiness checklist and accepted-risk standard.

### Blind reuse

Symptom: copied requirements conflict with a product variant, regulation, interface, or test environment.

Response: define applicability, compare versions, validate in context, and govern synchronization.

## Practical Examples

### Discovering a missed user path

A team maps the registration journey with user stories. The map exposes that password recovery is absent. The team adds a need, derives a verifiable requirement and acceptance criteria, links it to the registration goal, and schedules it in the appropriate release.

### Clarifying a dashboard need

A stakeholder asks for an “easy-to-read dashboard.” The team creates a low-fidelity wireframe, observes which decisions the stakeholder tries to make, and replaces the subjective request with requirements for the required data, refresh interval, labels, filters, and measurable accessibility criteria.

### Reviewing a story before development

A product owner, developer, and tester review a transaction-cancellation story. They discover that the business intent covers pending transactions only, the API cannot cancel settled transactions, and the original acceptance criteria omit the failure message. They revise the story and tests before implementation.

### Responding to a scope addition

A customer requests six extra data conversions after approving the migration scope. The team identifies the request as outside the baseline, traces affected interfaces and tests, estimates cost and schedule impact, and offers choices: exchange lower-priority conversions, extend the release, fund more capacity, or defer the additions.

### Creating an incremental baseline

For a three-week iteration, the team selects only the refined stories it expects to design, implement, integrate, and verify. It records the exact versions as the iteration baseline. Other backlog items remain planned but uncommitted. New learning becomes a controlled change or is prioritized for a later iteration.

### Reusing a compliance module

A product family maintains a library of approved compliance requirements with linked verification cases. A new variant instantiates the module, checks each item's regulatory and operating-context applicability, preserves the links, records justified deviations, and reviews master updates before synchronizing them.

## Compact Review Checklist

Before approving a requirement or set, ask:

- Is the originating problem or need clear?
- Are all affected stakeholder groups represented?
- Is the item within approved product and project scope?
- Does it state a necessary outcome rather than an unjustified solution?
- Is it unambiguous, complete, consistent, feasible, and verifiable?
- Are conditions, thresholds, units, tolerances, and exceptions explicit?
- Are source, rationale, owner, priority, version, and target release recorded?
- Is it linked upstream to its justification and downstream to design, risk, and verification work?
- Have relevant downstream consumers reviewed it?
- Is the approval or change decision recorded?
- Can the exact approved baseline be reconstructed later?

## Source Material

This guide consolidates and reorganizes the substantive instructions, rules, and examples from the nine articles in `docs/requirements-management/raw/requirements-gathering-and-management-processes/`. Promotional calls to action, vendor-specific claims, and repeated introductory material have been omitted.
