# Experiment 001 — CPU baseline ranking

**Evidence class:** synthetic controlled experiment. The journeys and labels are artificial; no real user, acceptance, safety, or production-performance claim follows from this run.

## Question

How do simple request-level ranking rules compare when the same deterministic compatibility gate is applied first?

## Methods

- `seeded_random`: deterministic random order using the query seed.
- `nearest_neighbour`: ascending origin-to-origin distance.
- `distance_destination`: ascending origin distance plus destination distance.
- `route_time`: descending explicit route/time heuristic score.

Every method receives the same candidates and the same eligibility result. The gate requires capacity, verification, route direction, pickup, destination, departure-time, and geometric detour constraints. This is not a global assignment or capacity-decrement simulation.

## Configuration

- Dataset version: `latent-corridor-v1`
- Seeds: `11`, `29`, `47`
- Scenarios: `thin=4`, `balanced=12`, `dense=24` drivers per query
- 20 queries per scenario and seed, 180 queries total
- `K=3`
- Artificial equatorial coordinates, UTC timestamps, standard-library implementation
- Labels are independently sampled latent preferences from spatial/time offsets, with forced zero-relevant queries every tenth query. They are not observed acceptance labels.

## Reproduce

From the repository root:

```powershell
$env:PYTHONPATH = "src"
py -m routemate.experiment --output experiments/001_baseline/outputs
```

The output directory is intentionally not overwritten if non-empty. `manifest.json` records seeds, configuration, environment, dataset hash, and source hashes. `synthetic_dataset.json` contains the complete artificial query inputs and label metadata. Timing is recorded separately because wall-clock measurements are machine-dependent.

## Observed aggregate results

Values below are the arithmetic means emitted by this run. Recall and NDCG exclude queries with zero relevant latent candidates; `zero_relevant_queries` is reported separately. Precision@3 uses a fixed denominator of 3, including short rankings.

| Scenario | Method | Precision@3 | Recall@3 | NDCG@3 | Eligible / candidate | Zero-relevant queries |
|---|---|---:|---:|---:|---:|---:|
| thin | seeded_random | 0.2111 | 0.5772 | 0.4821 | 1.85 / 4 | 19 / 60 |
| thin | nearest_neighbour | 0.2056 | 0.5650 | 0.4667 | 1.85 / 4 | 19 / 60 |
| thin | distance_destination | 0.2056 | 0.5691 | 0.4854 | 1.85 / 4 | 19 / 60 |
| thin | route_time | 0.2000 | 0.5447 | 0.4761 | 1.85 / 4 | 19 / 60 |
| balanced | seeded_random | 0.3889 | 0.3036 | 0.4486 | 5.37 / 12 | 7 / 60 |
| balanced | nearest_neighbour | 0.4000 | 0.3298 | 0.4975 | 5.37 / 12 | 7 / 60 |
| balanced | distance_destination | 0.4333 | 0.3912 | 0.5244 | 5.37 / 12 | 7 / 60 |
| balanced | route_time | 0.4222 | 0.3604 | 0.5258 | 5.37 / 12 | 7 / 60 |
| dense | seeded_random | 0.4167 | 0.1681 | 0.4759 | 10.60 / 24 | 7 / 60 |
| dense | nearest_neighbour | 0.4889 | 0.2048 | 0.5758 | 10.60 / 24 | 7 / 60 |
| dense | distance_destination | 0.4944 | 0.2251 | 0.5845 | 10.60 / 24 | 7 / 60 |
| dense | route_time | 0.5333 | 0.2334 | 0.6155 | 10.60 / 24 | 7 / 60 |

These are descriptive results for this exact synthetic configuration, not evidence that one method is generally superior. In particular, the label generator shares spatial and temporal concepts with the rankers, so ranking quality is partly benchmark-shaped. The compatibility gate also removes candidates before ranking; `relevant_lost_to_filter` in `metrics.csv` records that loss.

## Limitations and next step

The experiment has no road network, traffic, human acceptance, global matching, cancellations, uncertainty calibration, fairness labels, or statistical generalization. The next step is to add a small candidate-generation/feasibility test matrix and an independent ablation of route versus time features before considering classical ML.

Note: this experiment predates the Stage 4 separation between hard feasibility
and ranking. Its shared baseline gate includes the legacy heuristic threshold.
Stage 5 uses the corrected candidate pipeline, where heuristic score is not a
hard gate, and is the authoritative result for feature ablation.
