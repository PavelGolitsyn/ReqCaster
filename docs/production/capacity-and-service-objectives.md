# Capacity model and service objectives

## Supported production envelope

The v1 engine serves one repository per process. The byte ceilings are the
binding safety limits: each canonical document is limited to 5 MB, import
payloads to 5 MB, bulk commands to 500 operations and 1 MB, responses to 256
KB, search pages to 100 items, and trace/impact to depth 5 and 1,000 nodes.
Count ceilings remain 100,000 requirements and 200,000 relationships per
document, but they do not override the byte ceilings.

The signed-off planning model assumes representative records average 1.8 KB
and relationships average 0.5 KB:

| Capacity dimension | Year 1 | Year 2 | Year 3 / release ceiling |
| --- | ---: | ---: | ---: |
| Requirements | 1,200 | 2,400 | 4,000 |
| Relationships | 2,400 | 5,000 | 8,000 |
| Maximum traversal depth | 5 | 5 | 5 |
| Item versions retained | 12,000 | 36,000 | 80,000 |
| Audit events retained online | 25,000 | 75,000 | 150,000 |
| Baselines / governed reports | 24 / 240 | 60 / 720 | 120 / 1,500 |
| Evidence references | 6,000 | 18,000 | 40,000 |
| Peak readers / manager writes | 32 / 2 | 32 / 2 | 32 / 2 |
| Largest import / export | 5 MB / 5 MB | 5 MB / 5 MB | 5 MB / 5 MB |
| Governed repository plus history | 0.5 GB | 2 GB | 5 GB |
| Daily backup, 35-day retention | 18 GB | 70 GB | 175 GB |

An operator must open a storage-architecture review before either canonical
file exceeds 4 MB, process heap exceeds 750 MB during a representative rebuild,
commit pause exceeds 5 seconds at p95, or forecast growth reaches 80% of a
ceiling within two review periods. Crossing a hard ceiling fails explicitly;
the engine never accepts an unbounded operation or treats an index as canonical.

## Service objectives

Objectives apply to warm operations at the Year 3 envelope on the reference
class (8 CPU, 16 GB RAM, local SSD), measured at the application boundary.
Cold-start and rebuild objectives are separate.

| Operation | Objective |
| --- | --- |
| Exact current read | p95 <= 50 ms, p99 <= 100 ms |
| Common multi-filter search | p95 <= 500 ms |
| Bounded trace/impact, depth 5 | p95 <= 1 s |
| Ordinary single-item commit | p95 <= 2 s |
| 500-row preview / commit | p95 <= 5 s / 10 s |
| Baseline comparison | p95 <= 5 s |
| RTM or coverage report | p95 <= 10 s |
| Startup validation | <= 30 s |
| Derived-index rebuild | <= 60 s |
| Availability | 99.9% monthly, excluding announced maintenance |
| Recovery point / recovery time | <= 24 hours / <= 60 minutes |

At 32 active requests, another 128 requests may wait in FIFO order. Further
requests receive retryable `SERVICE_UNAVAILABLE`; elapsed requests receive
retryable `TIMEOUT`, and cancelled requests receive `CANCELLED`. Timed-out work
keeps its capacity slot until it actually settles, preventing hidden overload.
No objective applies beyond declared byte, node, page, or queue limits.

## Growth and review

Capacity, latency, heap, backup age, restore time, and storage growth are
reviewed quarterly. Audit and governed history are retained by deployment
policy; pruning requires legal approval and a verifiable exported evidence
package. Search indexes are excluded from backups and are always rebuilt from
canonical data after restore.
