# Stage 9 chaos and fault-injection matrix

| Fault | Expected repository state | Observed automated evidence |
| --- | --- | --- |
| Failure before/after candidate files | Old complete pair | Recovery tests pass |
| Failure after prepared marker | Old or new complete pair after deterministic recovery | Recovery tests pass |
| Failure between canonical renames | Restored old pair or completed new pair; never mixed | Recovery tests pass |
| Failure after integrity write / commit marker | New complete pair and idempotent recovery | Recovery tests pass |
| Corrupt prepared candidate | Quarantine candidate and restore both before-images | Recovery test passes |
| Out-of-band canonical edit | `INTEGRITY_FAILURE`, unchanged committed checksum, fail closed | Authoring integrity test passes |
| Corrupt derived index | Mark stale, serve bounded canonical fallback, rebuild from canonical | Read/index tests pass |
| Audit or baseline modification | Integrity verification fails; mutation unavailable | History/baseline tests pass |
| Lock contention / timeout | Retryable `REPOSITORY_BUSY`; no partial mutation | Concurrent repository tests pass |
| Disk/permission/partial I/O error | Exception before a valid commit marker; recovery selects a complete pair | Commit fault points plus immutable-file permission tests pass |
| Queue full | Retryable `SERVICE_UNAVAILABLE`; admitted work unaffected | Production hardening test passes |
| Queued/running cancellation | `CANCELLED`; running slot retained until settlement | Production hardening test passes |
| Deadline | `TIMEOUT`; running slot retained until settlement | Production hardening test passes |
| Downstream integration failure | Canonical commit remains; stable outbox key retries then dead-letters | Workflow outbox test passes |
| Clock skew / expired credential | Future/invalid expiry fails closed; negative cursor age rejected | Authorization and read tests pass |

True filesystem exhaustion and process `SIGKILL` are exercised in the quarterly
deployment recovery drill on the production filesystem, because portable unit
tests cannot faithfully reproduce filesystem durability semantics. The drill
must attach volume telemetry, exact fault time, recovered revision, checksum,
RPO and RTO to the deployment change record.
