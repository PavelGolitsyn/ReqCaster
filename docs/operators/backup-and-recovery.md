# Backup and recovery

Use `RepositoryBackupManager.create()` to capture the two canonical documents and governed `.engine` state under the repository write lock. The resulting directory is a consistency group with a canonical `backup-manifest.json` containing every copied file checksum and the source repository revision. Store that directory in deployment-owned encrypted storage; retention, legal hold, RPO, and RTO remain deployment policy.

Before recovery, call `RepositoryBackupManager.verify()`. Restore only with `restoreIsolated()` into a new, empty absolute directory. The restore refuses an existing target, verifies the backup before copying, opens and validates the canonical repository, checks the audit and baseline chains, and rebuilds disposable indexes. Compare its returned canonical, baseline, audit, report, and manifest checksums with the recovery record before a controlled routing or filesystem cutover.

Never restore over the live repository or the only recoverable backup. Preserve the failed repository and backup until validation and application smoke tests pass. Rehearse representative recovery regularly and record measured recovery point and recovery time results for the Stage 9 operational objectives.

