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

The adapter exposes `initialize`, `open`, `read`, `revision`, `execute`,
`validate`, `diagnose`, `recover`, `rebuildDerivedState`, and migration methods.
Mutation callbacks receive allocators; callers must never manufacture IDs or
edit the canonical files directly.

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
