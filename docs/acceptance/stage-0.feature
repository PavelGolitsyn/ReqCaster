Feature: Requirements engine architecture contracts

  Scenario: Manager creates a business requirement
    Given an authenticated requirements-manager and valid draft
    When requirements.create commits
    Then the repository allocates the next BR- identifier and records both agent and principal

  Scenario: Manager derives software from business intent
    Given an existing business requirement
    When the manager creates software content and a derives_from relationship
    Then the SR- requirement links to the exact business source version

  Scenario: Any role fetches compact exact context
    Given any configured role and an exact canonical identifier
    When requirements.get is called with a projection
    Then only the allowed requested fields and revision metadata are returned

  Scenario: Implementer searches approved component scope
    When an implementer searches approved software requirements by allocation
    Then bounded compact results contain no unauthorized fields

  Scenario: Tester discovers quality and coverage gaps
    When a tester requests missing acceptance criteria or verification coverage
    Then matching requirements and reproducible filter metadata are returned

  Scenario: Reviewer inspects evidence without mutation
    When a reviewer retrieves a requirement, source, changes, and evidence
    Then the governed repository and audit state remain byte-for-byte unchanged

  Scenario: Manager previews and commits a bulk update atomically
    Given a non-expired revision-bound preview token and matching diff hash
    When requirements.bulkCommit succeeds
    Then every operation commits in one repository revision or none do

  Scenario: Baseline remains immutable
    Given a manager baselines an approved set
    When current items later change
    Then the baseline resolves the exact captured versions and configuration version

  Scenario: Upstream change makes downstream evidence suspect
    When an approved business requirement changes
    Then affected software derivation and verification links become suspect

  Scenario: Unauthorized write is side-effect free
    When a tester, implementer, or reviewer calls a mutation tool
    Then FORBIDDEN is returned and files, history, indexes, and audit are unchanged

  Scenario: Stale update is rejected
    When expectedVersion or expectedRepositoryRevision is stale
    Then VERSION_CONFLICT returns safe current version metadata and commits nothing

  Scenario: Interrupted transaction recovers consistently
    Given a crash after temporary write but before complete commit
    When recovery opens the repository
    Then it restores or advances to one complete valid repository revision
