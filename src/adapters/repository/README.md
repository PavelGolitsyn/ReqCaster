# Repository adapter boundary

Stage 1 implements the only module allowed to open or mutate the two canonical
requirement files. Application services depend on the `Repository` port and no
transport accepts a filesystem path. Direct filesystem use outside this folder,
operator tooling, migrations, and narrowly scoped build scripts fails CI.

`CanonicalJsonRepository` is that boundary. It serializes reads and writes with
one project lock, validates both documents as a single revision, and commits via
a durable transaction manifest. A prepared manifest is the durable commit point:
startup recovery rolls it forward from the checksummed transaction copies. If a
candidate is corrupt, recovery quarantines it and restores both verified before
images.

The adapter exposes `initialize`, `open`, `read`, `revision`, `getPolicy`, `execute`,
`validate`, `diagnose`, `recover`, `rebuildDerivedState`, and migration methods.
Mutation callbacks receive allocators; callers must never manufacture IDs or
edit the canonical files directly.

## Engine-owned files

`business-requirements.json` and `software-requirements.json` are engine-owned
database files, not hand-authored project documents. The engine stores their
last committed SHA-256 checksums under `.engine/versions/current.json` and
verifies them on every open and locked read. An out-of-band edit therefore puts
the repository into `INTEGRITY_FAILURE`; it is quarantined and is never adopted
as trusted history.

In production, run the service under a dedicated operating-system account. Give
that account write access to the requirements root, give agent processes no
filesystem access to it, and expose data only through authenticated tools. For
a repository that is also versioned in Git, use a pre-commit/CI step such as
`npm run repository -- validate /absolute/requirements-root` and reject commits
whose canonical files were not produced by a committed engine transaction.
Filesystem permissions supplement the checksum and transaction controls; they
do not replace them.

Operator usage:

```sh
npm run repository -- init /absolute/requirements-root
npm run repository -- validate /absolute/requirements-root
npm run repository -- diagnose /absolute/requirements-root
npm run repository -- recover /absolute/requirements-root
npm run repository -- rebuild-derived-state /absolute/requirements-root
npm run repository -- migration-preview /absolute/requirements-root
npm run repository -- migrate /absolute/requirements-root
npm run repository -- restore-migration /absolute/requirements-root MIGRATION_ID
```
