# Representative Migration Pilot Runbook

Use one representative component before approving a full migration.

## Entry conditions

1. Name the source owner, target owner, coexistence window, cutover authority, import mapping version, and rollback point.
2. Freeze or explicitly partition source writes. Record which system owns each field during coexistence.
3. Select data containing hierarchy, relationships, multiple statuses, history, attachment references, reused content, variants, and both valid and invalid records.
4. Back up the canonical repository and verify the backup before previewing.

## Rehearsal

1. Run `imports.preview` against the pinned repository revision.
2. Reconcile source totals against created, updated, unchanged, duplicate, conflicted, rejected, incomplete, transformed, and unmapped totals. Reconcile relationships separately.
3. Review every reported hierarchy, link, attachment, history, status, field, encoding, and format loss. Obtain named approval for each accepted transformation or loss.
4. Sample traces in both directions: source item to canonical requirement to evidence, then evidence to requirement to source alias. Include every confidentiality class and at least one intentional reuse divergence.
5. Resolve all conflicts and incomplete/rejected rows in the source or create a separately approved partition. Generate a fresh preview; never commit a failed preview.
6. Have a requirements manager compare the normalized diff and commit the exact token/hash. Retry only with the same idempotency key when the outcome is uncertain.
7. Export JSON from the committed revision, re-import it into an isolated empty repository, and compare IDs, versions, status, content, governed references, and relationships for all features claimed as preserved.
8. Create variant-specific baseline and coverage reports. Confirm evidence and counts remain isolated by variant/configuration.

## Acceptance and rollback

Record approved thresholds for item, relationship, hierarchy, status, history, attachment-reference, rejection, and trace-sample counts before rehearsal. The pilot passes only when all thresholds are met and every non-zero loss has named approval.

If commit validation fails, no canonical changes are written. If post-commit acceptance fails, stop connectors, retain the audit/import hashes, restore the verified pre-pilot backup through the documented recovery procedure, rebuild derived indexes, and re-run integrity and audit-chain verification before reopening writes.

## Adoption

Train managers on preview/commit, conflict resolution, reuse dispositions, AI acceptance, and baseline creation. Train read-only agents on search, trace, reports, and exports. Publish the ownership matrix, idempotent retry rule, confidentiality policy, dead-letter owner, and cutover support contacts as the working agreement.
