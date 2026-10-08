# Experiment 004 — held-out synthetic relevance labels

**Evidence class:** synthetic benchmark evidence only. It is not evidence of
real acceptance, safety, routing accuracy, or production performance.

## Protocol and reproducibility

The experiment regenerates the existing artificial corridor dataset with seeds
`101, 202, 303` (three seeds not used in Experiments 001–003), scenarios
`thin`, `balanced`, and `dense`, 20 queries per seed/scenario, and `K=3`.
Candidate retrieval and all hard feasibility gates are computed once by
`run_candidate_pipeline`; ranking never sees either label set. The compared
methods are `seeded_random`, `nearest_neighbour`, `distance_destination`, and
`route_time` (the existing full heuristic configuration).

```powershell
$env:PYTHONPATH = "src"
py -m routemate.heldout --output experiments/004_heldout/outputs
```

The command refuses a non-empty output directory and writes `manifest.json`,
`synthetic_dataset.json`, `metrics.csv`, `per_query.csv`, and `timing.csv`.
The manifest includes SHA-256 source hashes and the complete label formula.

## Held-out labels

This is a second, separately seeded synthetic label for each original query.
It samples query-level detour and route-shape acceptance tolerances, provider
reliability, and deterministic Bernoulli draws. Utility is non-linear in
normalized geometric detour, destination distance, direction similarity,
departure difference, capacity slack, reliability, and route-shape acceptance.
Original and held-out labels are stored separately and are marked synthetic.

## Actual aggregate results

Values are arithmetic means over 60 queries per scenario/method. Recall and
NDCG exclude zero-heldout-relevant queries; their counts are in `metrics.csv`.
Coverage is eligible/original candidates. `Lost hard` is held-out relevant
providers rejected by hard filtering. Quality is the mean held-out utility of
the returned top three, divided by three.

| Scenario | Method | Precision@3 | Recall@3 | NDCG@3 | Coverage | Lost hard | Quality |
|---|---|---:|---:|---:|---:|---:|---:|
| thin | seeded_random | 0.1722 | 0.5532 | 0.4766 | 0.5250 | 0.4167 | 0.3357 |
| thin | nearest_neighbour | 0.1667 | 0.5426 | 0.4098 | 0.5250 | 0.4167 | 0.3387 |
| thin | distance_destination | 0.1667 | 0.5319 | 0.4250 | 0.5250 | 0.4167 | 0.3423 |
| thin | route_time | 0.1722 | 0.5532 | 0.4617 | 0.5250 | 0.4167 | 0.3404 |
| balanced | seeded_random | 0.3889 | 0.2532 | 0.3890 | 0.5000 | 2.2000 | 0.5503 |
| balanced | nearest_neighbour | 0.4778 | 0.3205 | 0.5253 | 0.5000 | 2.2000 | 0.5815 |
| balanced | distance_destination | 0.5167 | 0.3536 | 0.6022 | 0.5000 | 2.2000 | 0.6107 |
| balanced | route_time | 0.5778 | 0.3825 | 0.6424 | 0.5000 | 2.2000 | 0.6042 |
| dense | seeded_random | 0.4000 | 0.1392 | 0.3821 | 0.5000 | 3.7667 | 0.5735 |
| dense | nearest_neighbour | 0.4444 | 0.1577 | 0.4469 | 0.5000 | 3.7667 | 0.5999 |
| dense | distance_destination | 0.6000 | 0.2240 | 0.5871 | 0.5000 | 3.7667 | 0.6689 |
| dense | route_time | 0.6111 | 0.2296 | 0.6099 | 0.5000 | 3.7667 | 0.6669 |

Route-time has the strongest precision/recall in each scenario in this run,
while distance-destination has slightly higher deterministic quality in dense;
this single synthetic run is not sufficient to claim general superiority.
Candidate-generation latency is in `timing.csv` alongside ranking latency and
is machine-dependent.

## Limitations

The held-out labels are still synthetic and deliberately use mobility features
also used by the rankers, so dependence remains and the benchmark can favor
feature-aligned methods. Geometry is an artificial corridor, not a road or ETA
model. There are no human acceptance outcomes, traffic, cancellations,
uncertainty calibration, fairness labels, or global assignment effects.
