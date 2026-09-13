# ADR 0012: Deployment-owned backup and retention boundaries

- Status: Accepted
- Context: The engine can make consistent recovery points but cannot choose organizational legal retention or disaster objectives.
- Decision: Provide quiesced/checksummed backup and verified restore hooks; deployment policy sets encryption, location, schedule, RPO/RTO, retention, legal hold, and destruction.
- Rejected: Automatic indefinite retention; backing up only canonical current files; untested restore claims.
- Consequences: Backups include canonical files, configuration, audit, versions, and baselines; disposable indexes may be rebuilt.
- Security effects: Backup access and keys are separate, least-privilege controls; restore runs integrity and identity checks.
- Migration impact: Restore tests must include migration from every supported data version before release.
