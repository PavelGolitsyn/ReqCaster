# Operations, recovery, and incident response

## Health, metrics, logs, and alerts

`EngineHealthService.check()` reports process health, repository validity,
derived-index freshness and revision lag, audit integrity, baseline integrity,
queue state, backup status, storage growth, and named integrations separately.
Repository or audit failure makes the service unhealthy; a stale index, queue,
backup, storage, or integration issue makes it degraded. HTTP and MCP adapters
expose the same health object.

`OperationalTelemetry` records latency and outcome by operation plus bounded
safe structured events. Export these gauges and counters to the deployment's
monitoring system.

| Alert | Threshold / anti-noise | Owner | First response |
| --- | --- | --- | --- |
| Repository or audit unhealthy | one observation; page immediately | Operations + security | Quiesce writes, preserve evidence, run integrity check |
| Index revision lag | > 1 revision for 5 minutes | Operations | Rebuild index; canonical reads remain correct |
| Queue saturation | >= 80% for 10 minutes | Service owner | Find slow operation, shed load, preserve limits |
| Error rate | > 2% for 10 minutes and >= 20 calls | Service owner | Group by operation/error category |
| Authorization denials | 5x 30-day baseline for 10 minutes | Security | Verify issuer, policy change, and source identity |
| Backup age | > 24 hours | Operations | Run and verify backup; escalate at 36 hours |
| Storage | > 80% volume or canonical file > 4 MB | Operations | Add capacity and open architecture review |
| Integration failures | 5 consecutive attempts; one alert per integration | Integration owner | Disable connector, retain ordered outbox |

Alerts close only after two healthy observations. Planned maintenance suppresses
availability pages but never integrity, authorization, or backup alerts.

## Operational commands

Run commands as the dedicated operator; all paths must be absolute.

```sh
npm run repository -- validate /srv/requirements/project
npm run repository -- diagnose /srv/requirements/project
npm run repository -- integrity-check /srv/requirements/project
npm run repository -- rebuild-index /srv/requirements/project
npm run repository -- rotate-audit /srv/requirements/project
npm run repository -- backup /srv/requirements/project /srv/backups/project-2026-09-13
npm run repository -- verify-backup /srv/backups/project-2026-09-13
npm run repository -- restore /srv/backups/project-2026-09-13 /srv/restore/project
npm run repository -- migration-preview /srv/requirements/project
npm run repository -- migrate /srv/requirements/project
npm run repository -- restore-migration /srv/requirements/project MIGRATION_ID
npm run repository -- support-bundle /srv/requirements/project /srv/support/bundle.json
```

Audit segments roll automatically at their configured event bound;
`rotate-audit` verifies the chain and records an attributable checkpoint.
Support bundles are created exclusively outside the repository with mode 0600
and contain metadata only.

## Incident sequence

1. Declare an incident, name commander and scribe, and stop adapters from
   accepting writes. Do not edit governed files.
2. Capture health, an integrity check, safe support bundle, deployment logs,
   release checksum, and volume state. Restrict this evidence.
3. Classify integrity, confidentiality, availability, authorization, backup, or
   integration impact. Revoke suspected credentials immediately.
4. For stale/corrupt derived state, rebuild the index. For canonical/audit
   integrity failure, stay fail closed and follow break-glass recovery.
5. Verify a backup, restore to a new isolated directory, validate repository,
   audit, baselines and indexes, then run smoke and checksum comparisons.
6. A separate approver authorizes traffic cutover. Preserve the failed copy and
   evidence under legal/incident retention.
7. Record timeline, affected revisions, RPO/RTO, corrective actions, owners and
   due dates. Exercise the governed change path for engine policy changes.

Upgrade requires a verified backup, migration preview, CI evidence, and a
canary repository. Rollback restores the pre-upgrade consistency group into a
new directory; it never overwrites live state. Compatibility is Node >= 22,
schema/API 1.0.0, and canonical schema 1.0.0. No downgrade may silently
reinterpret a newer schema.
