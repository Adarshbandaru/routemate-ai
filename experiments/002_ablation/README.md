# Experiment 002 — feature-contribution ablation

This is a deterministic synthetic controlled experiment, not evidence of real
acceptance, safety, or production performance. It compares `full`,
`route_removed`, `temporal_removed`, and `context_removed` on the exact same
queries (seeds 11, 29, 47; thin/balanced/dense = 4/12/24 drivers; 20 queries
per seed/scenario; K=3).

## Method

Retrieval, feature generation, and feasibility are run once per query. Every
configuration ranks the same hard-eligible IDs with explicit weighted feature
contributions and stable journey-ID tie breaks. Hard gates are never ablated:
identity verification, vehicle verification, safety flags, capacity, direction
compatibility, pickup <=2 km, destination <=3 km, departure <=30 minutes, and
detour <=5 km. The heuristic score is not a gate; it is used only for ranking.
`relevant_lost_to_filter` counts relevant IDs rejected by these
shared gates, rather than IDs merely absent from top-K. Timing is recorded
separately with `perf_counter` and is machine-dependent.

`route_removed` removes route and direction ranking terms and renormalizes the
remaining terms. `temporal_removed` removes departure difference and
renormalizes. The current heuristic has no context/verification ranking term,
so `context_removed` is explicitly a gate-only ablation and is mathematically
identical to `full`; this is a methodological limitation, not a result to
interpret as superiority.

## Reproduce

```powershell
$env:PYTHONPATH = "src"
py -m routemate.ablation --output experiments/002_ablation/outputs
```

The command refuses a non-empty output directory and writes `manifest.json`,
`metrics.csv`, `per_query.csv`, `timing.csv`, and the complete synthetic input
snapshot in `synthetic_dataset.json`. The generated `metrics.csv` is the
authoritative actual result table for this run (arithmetic means; recall/NDCG
exclude zero-relevant queries, whose counts are reported separately). No
superiority claim is made.

## Actual observed aggregates

These values are from `outputs/metrics.csv`. Coverage is eligible/candidate;
`lost` is the mean number of relevant IDs rejected by the shared hard filter.

| Scenario | Configuration | Precision@3 | Recall@3 | NDCG@3 | Coverage | Lost | Zero-relevant |
|---|---|---:|---:|---:|---:|---:|---:|
| thin | full | 0.2278 | 0.6138 | 0.5306 | 0.5250 | 0.4333 | 19 |
| thin | route_removed | 0.2278 | 0.6138 | 0.5544 | 0.5250 | 0.4333 | 19 |
| thin | temporal_removed | 0.2333 | 0.6382 | 0.5299 | 0.5250 | 0.4333 | 19 |
| thin | context_removed | 0.2278 | 0.6138 | 0.5306 | 0.5250 | 0.4333 | 19 |
| balanced | full | 0.4222 | 0.3604 | 0.5258 | 0.5000 | 1.4500 | 7 |
| balanced | route_removed | 0.4278 | 0.3579 | 0.5497 | 0.5000 | 1.4500 | 7 |
| balanced | temporal_removed | 0.4222 | 0.3770 | 0.5026 | 0.5000 | 1.4500 | 7 |
| balanced | context_removed | 0.4222 | 0.3604 | 0.5258 | 0.5000 | 1.4500 | 7 |
| dense | full | 0.5333 | 0.2334 | 0.6155 | 0.5000 | 2.6167 | 7 |
| dense | route_removed | 0.5444 | 0.2364 | 0.6402 | 0.5000 | 2.6167 | 7 |
| dense | temporal_removed | 0.5111 | 0.2262 | 0.5889 | 0.5000 | 2.6167 | 7 |
| dense | context_removed | 0.5333 | 0.2334 | 0.6155 | 0.5000 | 2.6167 | 7 |

### Timing means from the same run

Candidate-generation timing is shared across configurations within a query;
ranking timing is configuration-specific. Values are milliseconds per query.

| Scenario | Candidate generation | Full ranking | Route removed | Temporal removed | Context removed |
|---|---:|---:|---:|---:|---:|
| thin | 6.706 | 0.0268 | 0.0230 | 0.0163 | 0.0167 |
| balanced | 18.003 | 0.0471 | 0.0300 | 0.0246 | 0.0272 |
| dense | 38.460 | 0.0692 | 0.0575 | 0.0503 | 0.0585 |

Timing is descriptive only and should not be treated as a performance claim.
