# Stage 9 performance baseline

Run on 2026-09-13 with `npm run benchmark:production -- 100000 15` on arm64
macOS and Node 26.8.2. The synthetic set contains 100,000 current requirements,
50,005 relationships, and 62,126,299 serialized bytes. This is 25 times the
signed-off Year 3 requirement count and exercises the disposable read model;
the canonical 5 MB per-document production ceiling remains authoritative.

| Operation | Observed p95 / maximum | Objective or disposition |
| --- | ---: | --- |
| Exact indexed read | < 0.01 ms / 0.05 ms | p95 <= 50 ms: pass |
| Multi-filter full-text search | 158.37 ms / 158.37 ms | p95 <= 500 ms: pass |
| Coverage-gap scan | 2.13 ms / 2.13 ms | report objective <= 10 s: pass |
| Five-level trace walk | 0.09 ms / 0.09 ms | p95 <= 1 s: pass |
| 500-row bulk preview hash | 2.59 ms / 2.59 ms | preview objective <= 5 s: pass |
| 500-row candidate application | 0.52 ms / 0.52 ms | commit objective includes durable I/O; repository tests cover it |
| 1,000-row baseline comparison | 0.05 ms / 0.05 ms | p95 <= 5 s: pass |
| RTM projection | 1.54 ms / 1.54 ms | p95 <= 10 s: pass |
| Strict parse/startup component | 626.34 ms / 626.34 ms | startup <= 30 s: pass |
| Cold index rebuild | 1,279.35 ms | rebuild <= 60 s: pass |
| 32-reader batch | 5,027.77 ms | bounded batch; requests remain individually within search objective |

Fixture generation took 22.17 ms. Observed heap was 484,470,808 bytes with
478,413,720 bytes growth, below the 750 MB architecture-review trigger. Cold
repository open, durable commit, backup/restore, and report persistence remain
covered by filesystem integration tests because this microbenchmark isolates
operation cost from host filesystem variability.

The earlier relationship lookup in index construction was quadratic. Stage 9
replaced it with one O(requirements + relationships) adjacency pass before
record indexing; the 50,005-link result above is the regression evidence.
