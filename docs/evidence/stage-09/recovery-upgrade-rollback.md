# Backup, restore, upgrade, and rollback rehearsal

The automated rehearsal creates a consistency-group backup while canonical,
audit, and baseline locks are held; verifies every file against
`backup-manifest.json`; restores only into a new empty absolute directory;
opens and validates the restored repository; verifies the audit and baseline
chains; and rebuilds disposable indexes. The returned repository revision and
canonical checksums are compared with the source in
`test/application/history-baselines.test.js`.

Migration tests preview without writes, create a verified pre-migration pair,
apply a deterministic idempotent migration, reject unknown future schemas, and
restore the migration backup. Transaction tests repeat every commit recovery
point. Together these prove v1 current files, versions, relationships,
configuration, audit, and baselines remain governed across upgrade and rollback.

The production command sequence is documented in
`docs/production/operations-and-incident-response.md`. Automated execution time
is not used as the production RTO claim; the deployment must run the same drill
on its encrypted backup store and network path and demonstrate RPO <= 24 hours
and RTO <= 60 minutes before go-live and quarterly thereafter.
