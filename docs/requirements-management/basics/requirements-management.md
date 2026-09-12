# Requirements Management Basics

This guide consolidates the practical instructions, rules, and examples from the source material in `raw/requirements-management/`. It removes promotional content, repeated explanations, calls to action, and vendor-specific claims.

## 1. Purpose

Requirements management keeps the definition of a product or system clear, current, agreed upon, and provable throughout its lifecycle.

Use it to:

- align stakeholders on the problem and intended outcomes;
- translate needs into implementable and testable requirements;
- connect requirements to design, implementation, risk, and tests;
- control additions, modifications, and deletions;
- expose the effect of a proposed change before approving it;
- show whether the product meets its specification and its users' needs;
- provide reliable evidence for milestones, audits, and release decisions; and
- reduce ambiguity, rework, delays, cost overruns, and expectation gaps.

Requirements management defines **what the product must do and how well it must do it**. Project management defines and tracks **the work needed to deliver it on time and within budget**. The two disciplines must remain coordinated, but they are not interchangeable.

## 2. Core Terms

### Need

A need describes the outcome a stakeholder expects or the problem the product must solve. Keep needs solution-independent whenever possible.

### Requirement

A requirement is a documented, testable condition or capability needed to satisfy a user need, business objective, contract, regulation, or other source.

### Requirement artifact

An artifact is a managed item such as a need, requirement, use case, design element, test case, defect, risk control, decision, or change request.

### Baseline

A baseline is an approved snapshot of a requirement set at a defined milestone. It provides a stable reference for development, comparison, and formal change control.

### Traceability

Traceability is the ability to follow an artifact to its origin and to every relevant downstream artifact.

- **Upstream traceability** explains why a requirement exists.
- **Downstream traceability** shows how a requirement is designed, implemented, analyzed, and verified.
- **Bidirectional traceability** supports both directions.

### Verification and validation

- **Verification:** Did we build the product right? Compare the implementation with the approved requirements and technical specifications.
- **Validation:** Did we build the right product? Confirm that the product satisfies stakeholder needs in its intended operating environment.

Verification precedes validation logically, though planning for both begins while needs and requirements are being written.

## 3. Fundamental Rules

1. Maintain one controlled source of truth for requirements and their relationships.
2. Give every managed artifact a stable identifier, owner, type, status, and history.
3. Write requirements so that different readers reach the same interpretation.
4. Define verification criteria and a verification method while authoring each requirement.
5. Trace each requirement to its source and to its downstream realization and evidence.
6. Build traceability during development; do not reconstruct it at the end.
7. Baseline only reviewed, agreed-upon requirements.
8. After baselining, route every addition, modification, and deletion through change control.
9. Assess impact before approving a change.
10. Record decisions, reasons, approvals, and discussions with the affected artifacts.
11. Keep stakeholders involved throughout development, not only at the beginning or final review.
12. Treat requirements work as iterative. Refine requirements when learning exposes a better understanding, while retaining control and history.
13. Use status and coverage data to report progress; do not rely on subjective percentage-complete estimates.
14. Verify against specifications and validate against stakeholder needs before declaring the product complete.

## 4. Requirements Management Lifecycle

Change management, traceability, collaboration, and quality control continue through every stage.

### Stage 1: Plan

Create a requirements management plan before substantial authoring begins. Define:

- objectives, scope, assumptions, and constraints;
- stakeholder roles, responsibilities, and decision authority;
- requirement and artifact types;
- identifiers, attributes, templates, and terminology;
- authoring and quality rules;
- elicitation and analysis methods;
- prioritization rules;
- relationship and traceability rules;
- review, approval, and sign-off workflows;
- baseline creation and comparison rules;
- change-control and impact-analysis workflows;
- status values and allowed transitions;
- verification and validation methods;
- tools, repositories, and integrations;
- reporting, metrics, and audit evidence; and
- the approach for reuse, variants, and product lines, when applicable.

Obtain stakeholder agreement on the plan. The plan is the team's operating contract for requirements work.

### Stage 2: Elicit, Define, and Analyze

1. Gather business objectives, user needs, use cases, hazards, regulatory obligations, interface constraints, and operational scenarios.
2. Involve customers, users, engineering disciplines, quality, regulatory, test, operations, and other affected parties early.
3. Separate the underlying need from a preferred solution.
4. Translate agreed needs into clear requirements.
5. Analyze requirements for completeness, conflicts, feasibility, dependencies, risk, and scope.
6. Negotiate conflicts explicitly and record the resulting decisions.
7. Prioritize requirements using an agreed method.
8. Establish upstream and downstream trace links as artifacts are created.
9. Review and approve the requirement set.
10. Create a baseline when the set is sufficiently mature for the next commitment or milestone.

### Stage 3: Verify

For every requirement, define:

- **success criteria:** the measurable result that proves satisfaction;
- **method:** test, demonstration, inspection, analysis, or an approved combination;
- **strategy:** environment, configuration, data, equipment, and procedure; and
- **evidence:** result, reviewer, date, configuration, and disposition of failures.

Link the requirement to its verification activity and result. A passing test without a backward link does not prove that the intended requirement was verified.

### Stage 4: Validate

Validate the integrated product against its originating business objectives and stakeholder needs in a representative or real operational environment.

If validation fails, revisit elicitation assumptions, missing needs, prioritization, and the requirement set. Passing every specification test does not guarantee that the product solves the intended problem.

## 5. Requirement Types and Levels

Organize requirements from purpose to implementation constraints without losing the relationships between levels.

### Business requirements

Business requirements describe why the product exists and which outcome it must enable. They should remain design-agnostic.

**Example**

> Reduce pedestrian injuries in urban driving by providing automatic collision avoidance.

### Stakeholder and user needs

Needs describe what a user or stakeholder expects to achieve.

A user story may supply concise context:

> As a passenger, I need the vehicle to unlock the destination-side door after arrival so that I can exit safely.

A user story explains role, goal, and benefit. It does not replace detailed system or product requirements when precision, traceability, or formal verification is required.

### Functional requirements

Functional requirements specify measurable system behavior.

**Example**

> When the vehicle detects a pedestrian in its forward path, the braking system shall initiate full braking force within 200 milliseconds.

### Non-functional requirements

Non-functional requirements specify qualities, performance, constraints, and operating conditions such as safety, reliability, security, usability, maintainability, environmental tolerance, or regulatory compliance.

**Example**

> The braking system shall provide the specified pedestrian-detection performance at vehicle speeds from 10 to 60 km/h in rain, fog, and low-light conditions.

## 6. Authoring High-Quality Requirements

A requirement should be:

- **necessary:** it supports an approved need, objective, obligation, or risk control;
- **correct:** it accurately states the intended behavior or constraint;
- **clear and unambiguous:** it has one reasonable interpretation;
- **complete:** it includes the conditions, behavior, limits, and qualifiers needed to use it;
- **concise:** it contains no irrelevant explanation;
- **consistent:** it does not conflict with other requirements or defined terminology;
- **feasible:** it can be realized within known technical, cost, and schedule constraints;
- **singular:** it states one main obligation;
- **verifiable:** objective evidence can show whether it has been satisfied;
- **traceable:** its source and downstream relationships are recorded; and
- **conforming:** it follows the team's approved syntax, template, and terminology.

### Preferred structure

Use a consistent structure with a subject, an obligation, an active verb, an object, and measurable qualifiers:

> [Condition or trigger,] the [system or component] shall [observable response] [measurable constraint].

Common patterns include:

- **Always active:** The mobile device shall have a mass of less than 180 grams.
- **Event-driven:** When the user selects participant count, the application shall display the number of active participants.
- **State-driven:** While maintenance mode is active, the controller shall inhibit actuator commands.
- **Conditional:** Where biometric authentication is enabled, the application shall lock after five failed attempts within ten minutes.

### Avoid

- vague words such as *quickly*, *easy*, *adequate*, *user-friendly*, or *as appropriate*;
- undefined acronyms and inconsistent terminology;
- hidden assumptions;
- subjective success criteria;
- passive constructions that obscure responsibility;
- several obligations joined into one requirement;
- prescribing a design when the source only defines a need;
- requirements that omit triggers, operating conditions, units, tolerances, or limits; and
- requirements that cannot be verified objectively.

### Poor and improved examples

**Poor**

> The device shall respond quickly and be easy to use.

Problems: *quickly* and *easy* are subjective, two qualities are combined, the triggering condition is absent, and no verification method is evident.

**Improved performance requirement**

> When the operator selects **Save**, the device shall confirm completion within 500 milliseconds.

**Improved usability requirement**

> In a usability test with representative first-time operators, at least 90% of participants shall complete the save workflow without assistance within 30 seconds.

## 7. Review and Approval

Review requirements before implementation and again when relevant information changes.

### Review rules

- Assign reviewers by role and subject-matter responsibility.
- Include engineering, test, quality, affected stakeholders, and regulatory or safety representatives when applicable.
- Review individual items in context rather than forcing every reviewer to reread an entire specification.
- Check quality, feasibility, interfaces, conflicts, risks, trace links, and verification criteria.
- Resolve comments or record an explicit disposition.
- Capture approvals and electronic signatures where governance or regulation requires them.
- Preserve who decided what, when, and why.

Consensus is not always required, but decision authority and the final disposition must be clear.

### Prevent late feedback

- expose evolving requirements, prototypes, and designs early;
- schedule frequent, focused reviews;
- notify people only about changes relevant to their responsibilities;
- keep discussion attached to the affected artifact; and
- use visual material when it improves understanding.

## 8. Traceability and Coverage

For each requirement, maintain links as applicable to:

- its business objective, stakeholder need, regulation, contract clause, hazard, or other source;
- parent and child requirements;
- interfaces and dependencies;
- architecture and design elements;
- implementation work;
- risks and controls;
- verification cases and procedures;
- verification results and defects; and
- validation evidence.

Use a requirements traceability matrix or equivalent relationship view to answer:

- Why does this requirement exist?
- Which artifacts depend on it?
- What implements it?
- How will it be verified?
- Has it passed verification?
- Which needs does it help validate?
- What will be affected if it changes?
- Are there orphaned requirements, designs, or tests?

### Traceability rules

1. Every lower-level requirement must trace to an approved source.
2. Every requirement that needs implementation must trace forward to its realization.
3. Every verifiable requirement must trace to at least one verification activity.
4. Every verification activity must trace back to the requirement or risk control it covers.
5. Missing, suspect, or stale links must be visible and resolved.
6. Update trace links as part of the same workflow as the artifact change.
7. Review coverage continuously and at every baseline, milestone, and release decision.

## 9. Baselines, Versions, and Change Control

### Baseline rules

- Create a baseline only after defined review and approval criteria are met.
- Identify its scope, version, date, owners, approvals, and intended milestone or release.
- Preserve baselines as immutable historical snapshots.
- Compare later versions with the applicable baseline.
- Do not silently edit baselined content.

### Change workflow

After baseline, process each proposed addition, modification, or deletion as follows:

1. **Initiate:** record the requested change, source, reason, urgency, and affected release.
2. **Triage:** check completeness, duplicates, ownership, and whether the request is in scope.
3. **Analyze impact:** identify affected needs, requirements, design, interfaces, risks, suppliers, implementation, tests, evidence, cost, schedule, and commitments.
4. **Decide:** approve, reject, defer, or request more information through the defined authority.
5. **Plan:** assign the approved change to a release or iteration and identify responsible owners.
6. **Implement:** update every affected artifact and relationship, not only the original requirement.
7. **Verify and validate:** repeat the affected activities and capture new evidence.
8. **Close:** confirm completeness, record the disposition, notify affected parties, and preserve the audit trail.

Responding to change and controlling change are complementary. The goal is not to eliminate volatility; it is to make changes deliberate, visible, affordable, and compatible with project commitments.

Teams should normally become more selective about accepting changes as a release approaches completion. Iterative development can route lower-priority changes into later iterations without destabilizing the current commitment.

### Change request example

```text
Change: Reduce maximum stopping distance from 40 m to 35 m.
Reason: Updated safety objective.
Affected items: system requirement, braking design, supplier interface,
hazard analysis, FMEA rating, simulation, and stopping-distance tests.
Decision: Approved for Release 3 by the change authority.
Completion evidence: affected artifacts updated, links reviewed,
verification rerun, and baseline comparison accepted.
```

## 10. Status and Progress

Assign a controlled status to every requirement. A useful default set is:

- **Proposed:** submitted but not approved;
- **Reviewed:** checked for quality and readiness, if the process uses this gate;
- **Approved:** accepted into the project or allocated to a baseline;
- **Implemented:** designed, built, and unit-tested;
- **Verified:** integrated implementation passed its defined verification;
- **Deferred:** accepted for a future release;
- **Rejected:** considered but never approved;
- **Deleted:** removed from the approved scope through change control; and
- **Delivered:** released to the customer, if delivery status is tracked.

Define allowed status transitions and the evidence required for each transition.

Report progress as counts by status and coverage, for example:

> Of 87 requirements allocated to the subsystem, 61 are verified, 9 are implemented but not verified, and 17 are not fully implemented.

This is more informative than saying the subsystem is “90% done.” Counts alone do not reflect size, effort, value, or risk, so pair them with priority, complexity, risk, and remaining-effort data when needed.

A release is not complete merely because implementation activity has stopped. Its allocated requirements must have an explicit final disposition, normally verified or formally removed from that release's baseline.

## 11. Prioritization and Scope Control

- Prioritize against business value, safety, risk, dependency, urgency, cost, and release objectives.
- Preserve lower-priority requirements in context rather than allowing them to become invisible.
- When all requested functionality cannot be delivered, select the highest-value coherent scope deliberately.
- Treat new ideas as proposed changes, not automatic commitments.
- Trace scope changes to their source and decision.
- Review the effect of each accepted change on schedule, cost, risk, testing, and existing commitments.
- Reject or assign long-deferred requests to a planned release; do not leave an indefinite backlog of unresolved decisions.

## 12. Agile and Hybrid Development

Agile requirements management is iterative requirements work with maintained discipline. It allows requirements to evolve as the team learns without losing scope, traceability, quality, or control.

### Rules for iterative work

- Begin with the business objective and user need.
- Refine needs progressively into requirements, features, stories, and development tasks.
- Keep those layers connected even when teams use different tools or cadences.
- Gather feedback throughout development.
- Perform reviews, impact analysis, quality checks, and change control continuously.
- Establish traceability while work progresses.
- Retain baselines where commitments, releases, or regulation require them.
- Connect completed work to verification evidence.

Do not use “Agile” to excuse unclear requirements or uncontrolled change. Moving ambiguity downstream faster increases rework.

Choose the mix of iterative and formal practices that fits the product, risk, regulation, and organization. Method labels matter less than maintaining effective feedback, evidence, and control.

## 13. Tooling and Information Management

Documents and spreadsheets can be sufficient for a small, low-risk effort with few requirements and relationships. They become fragile when many teams, versions, interfaces, tests, risks, or regulatory obligations must remain synchronized.

A requirements management solution should support, as needed:

- structured authoring and stable item identifiers;
- configurable artifact types, attributes, and workflows;
- collaborative reviews, approvals, and electronic signatures;
- bidirectional traceability and orphan detection;
- baselines, history, comparison, and version control;
- change requests and impact analysis;
- verification planning, test links, results, and coverage views;
- audit trails and compliance reports;
- reusable and variant requirements;
- role-based views and notifications;
- interchange formats, APIs, and bidirectional development-tool integrations; and
- reports for status, quality, coverage, volatility, and release readiness.

The tool must preserve product context without forcing every discipline into the same day-to-day workflow. Select it with the people who will author, review, implement, verify, govern, and audit the requirements.

A tool cannot turn a poorly written requirement into a testable one. Process, skill, review, and governance remain necessary.

## 14. Reuse and Variants

When requirements are reused across products:

- distinguish the authoritative source from product-specific derivatives;
- choose an explicit reuse method: clone, reference with a maintained link, or modular configuration;
- retain traceability between the source and every derivative;
- make intentional differences visible;
- assess the impact of source changes on all derivatives; and
- prevent an update to one product from silently changing another product's approved baseline.

## 15. Metrics and Continuous Improvement

Collect only metrics that support decisions. At minimum, consider tracking:

### Requirement and coverage metrics

- counts by type, level, priority, owner, release, and status;
- requirements without approved sources;
- requirements without design, implementation, risk, or test links where required;
- verification pass, fail, blocked, and not-run counts;
- review findings and requirement-quality defects; and
- validation findings and unmet needs.

### Change metrics

- change requests submitted, open, closed, approved, rejected, and deferred;
- age and average resolution time of open requests;
- implementation effort per approved change;
- artifacts affected per request;
- changes by origin, such as users, marketing, sales, management, engineering, test, or regulation; and
- volatility by period.

Calculate requirements volatility for a period as:

```text
volatility = number of requirements changed during the period
             -------------------------------------------------
             number of requirements at the start of the period
```

Define what counts as a change before comparing periods. Interpret volatility in context; change may reflect useful learning. Sustained late-stage volatility, however, can signal weak elicitation, long decision delays, unstable scope, or an unrealistic release plan.

### Effort and estimation metrics

- effort spent on elicitation, definition, analysis, review, traceability, change control, verification planning, and other requirements activities;
- product-size measures such as individually testable requirements, use-case points, or function points; and
- historical relationships among product size, requirements effort, implementation effort, defects, rework, and delivery results.

Use the team's own historical data to improve future estimates. If a project suffered from poorly defined requirements, do not repeat the same allocation of requirements effort without adjustment.

## 16. Common Failure Modes and Remedies

### Ambiguous or incomplete requirements

**Symptoms:** conflicting interpretations, repeated clarification, incorrect tests, and late rework.

**Remedies:** standard syntax, defined terminology, objective measures, peer review, early test design, and automated quality checks where useful.

### Missing stakeholder input

**Symptoms:** late executive feedback, rejected product behavior, and reopened decisions.

**Remedies:** map stakeholders, involve them early, show evolving work frequently, assign focused reviews, and record approvals.

### Decision rehashing

**Symptoms:** meetings revisit settled issues and new participants lack context.

**Remedies:** attach discussions, alternatives, reasons, decisions, and approvers to the affected artifacts.

### Uncontrolled scope creep

**Symptoms:** undocumented additions, contradictory versions, and slipping commitments.

**Remedies:** baseline approved scope, require change requests, perform impact analysis, prioritize deliberately, and preserve version history.

### Manual change communication

**Symptoms:** stale documents, missed notifications, and inconsistent downstream artifacts.

**Remedies:** item-level management, relationship-based impact views, targeted notifications, and integrated tools.

### Oversized document reviews

**Symptoms:** reviewers skim, ignore, or repeatedly reread large specifications.

**Remedies:** manage artifacts individually, give reviewers role-relevant views, and generate complete documents only when a milestone, contract, or regulation requires them.

### Broken traceability

**Symptoms:** orphan requirements, tests with no requirement, stale risk controls, and slow audit preparation.

**Remedies:** define a relationship model, link artifacts as they are created, detect gaps continuously, and review traceability at every change and baseline.

### Mismatched expectations

**Symptoms:** the team delivers working functionality that stakeholders do not accept or use.

**Remedies:** maintain the chain from need to requirement to implementation to verification and validation; keep requests, decisions, and approvals visible throughout development.

## 17. Minimal End-to-End Checklist

### Before development

- [ ] Requirements management plan approved.
- [ ] Stakeholders, owners, reviewers, and decision authorities identified.
- [ ] Needs, objectives, constraints, risks, and interfaces elicited.
- [ ] Requirements written using agreed quality rules.
- [ ] Priorities and release scope agreed.
- [ ] Verification criteria and methods defined.
- [ ] Required upstream and downstream links established.
- [ ] Reviews completed and findings resolved.
- [ ] Initial baseline approved.

### During development

- [ ] Discussions and decisions captured with their artifacts.
- [ ] Proposed changes routed through change control.
- [ ] Impact analysis completed before approval.
- [ ] Versions, relationships, and affected evidence updated together.
- [ ] Requirement status and coverage kept current.
- [ ] Verification results linked and failures dispositioned.
- [ ] Stakeholders receive timely, relevant feedback opportunities.

### Before release

- [ ] Every allocated requirement has an explicit disposition.
- [ ] Required requirements are implemented and verified.
- [ ] Traceability gaps and suspect links are resolved.
- [ ] Changed risks, interfaces, tests, and supplier artifacts are reconciled.
- [ ] Validation confirms the product meets stakeholder needs in context.
- [ ] Deviations, deferrals, deletions, and residual risks are approved.
- [ ] Release baseline and audit evidence are complete.

## 18. Compact Worked Example

The following shows how one requirement should remain connected through the lifecycle.

```text
Business objective
  Reduce pedestrian injuries during urban driving.

Stakeholder need
  The vehicle must help the driver avoid a collision with a detected pedestrian.

System requirement SR-042
  When the vehicle detects a pedestrian in its forward path at 10–60 km/h,
  the braking system shall initiate full braking force within 200 ms.

Source links
  Business objective BO-003; hazard HAZ-014; stakeholder need SN-018.

Downstream links
  Brake-controller design DD-077; software item SW-216;
  supplier interface IF-009; test case TC-188.

Verification
  Instrumented test in the approved vehicle configuration.
  Pass when measured initiation time is <= 200 ms for every required condition.

Status
  Verified in Release 3, build 3.8.1.

Change handling
  A proposed limit of 150 ms requires impact analysis of the controller design,
  supplier interface, hazard analysis, timing budget, and all linked test cases
  before approval.

Validation
  Representative operational scenarios confirm that the braking behavior
  supports the originating collision-avoidance need without unacceptable effects.
```

The chain is the essential outcome: the team can explain why the requirement exists, what realizes it, how satisfaction is proven, and what must be reconsidered when it changes.
