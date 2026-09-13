# ADR 0006: Project lock and recoverable atomic replacement

- Status: Accepted
- Context: Two canonical files must never expose a mixed revision after concurrency or failure.
- Decision: Use one exclusive project lock, same-filesystem temporary files, fsync, a checksummed transaction manifest, atomic renames, and deterministic startup recovery.
- Rejected: Last-write-wins; independent file locks; in-place writes; relying on a two-file atomic filesystem primitive.
- Consequences: Writes serialize per repository; readers use a revision-consistent strategy.
- Security effects: Lock metadata is bounded and untrusted; stale-lock recovery verifies process/lease facts.
- Migration impact: Stage 1 must fault-inject every commit boundary on supported platforms.
