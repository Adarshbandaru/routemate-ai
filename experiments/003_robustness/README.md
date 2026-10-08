# Experiment 003 — perturbation robustness

**Evidence class:** synthetic sensitivity experiment. This is not evidence of
real acceptance, safety, routing accuracy, or production performance.

## Question and interpretation

How sensitive is the current full heuristic matcher to small provider-side
perturbations and candidate availability loss? The original synthetic labels
are frozen across conditions. Therefore these are stability measurements, not
counterfactual acceptance labels.

## Conditions

- `control`: original synthetic query.
- `endpoints_100m`: provider start and destination independently shifted by at
  most 100 m; route endpoints are synchronized.
- `route_100m`: provider internal route vertices shifted by at most 100 m.
- `departure_5min`: provider departure shifted uniformly within +/-5 minutes.
- `availability_25pct`: each provider independently removed with probability
  0.25; original labels are retained for measuring availability loss.

The rider, verification state, vehicle state, capacity, and safety flags are
unchanged. Hard gates remain active. The heuristic score is not a hard gate.

## Configuration and reproducibility

- Dataset: `latent-corridor-v1`
- Seeds: `11`, `29`, `47`
- Scenarios: thin, balanced, dense
- 20 queries per seed/scenario; 60 queries per scenario
- `K=3`
- Standard-library CPU implementation

```powershell
$env:PYTHONPATH = "src"
py -m routemate.robustness --output experiments/003_robustness/outputs
```

The command refuses a non-empty output directory and writes `manifest.json`,
`original_dataset.json`, `perturbed_dataset.json`, `metrics.csv`,
`per_query.csv`, `feasibility_matrix.csv`, and `timing.csv`. The manifest
contains only non-sensitive runtime metadata, source hashes, and dataset hashes.

## Actual aggregate results

Values are arithmetic means. Recall and NDCG exclude zero-relevant queries;
those exclusions are recorded in `metrics.csv`. Coverage is eligible candidates
divided by the original candidate pool. `lost hard` counts relevant providers
rejected by hard feasibility among providers still available.

| Scenario | Condition | Precision@3 | Recall@3 | NDCG@3 | Coverage | Lost availability | Lost hard |
|---|---|---:|---:|---:|---:|---:|---:|
| thin | control | 0.2278 | 0.6138 | 0.5306 | 0.5250 | 0.0000 | 0.4333 |
| thin | endpoints_100m | 0.2278 | 0.6138 | 0.5338 | 0.5250 | 0.0000 | 0.4333 |
| thin | route_100m | 0.2333 | 0.6382 | 0.5428 | 0.5250 | 0.0000 | 0.4333 |
| thin | departure_5min | 0.2278 | 0.6138 | 0.5338 | 0.5250 | 0.0000 | 0.4333 |
| thin | availability_25pct | 0.1833 | 0.4959 | 0.4386 | 0.3750 | 0.2500 | 0.3500 |
| balanced | control | 0.4222 | 0.3604 | 0.5258 | 0.5000 | 0.0000 | 1.4500 |
| balanced | endpoints_100m | 0.4222 | 0.3604 | 0.5209 | 0.5000 | 0.0000 | 1.4500 |
| balanced | route_100m | 0.4167 | 0.3557 | 0.5111 | 0.5000 | 0.0000 | 1.4500 |
| balanced | departure_5min | 0.4222 | 0.3619 | 0.5219 | 0.5000 | 0.0000 | 1.4500 |
| balanced | availability_25pct | 0.4056 | 0.3182 | 0.4992 | 0.3875 | 0.7833 | 1.0833 |
| dense | control | 0.5333 | 0.2334 | 0.6155 | 0.5000 | 0.0000 | 2.6167 |
| dense | endpoints_100m | 0.5444 | 0.2405 | 0.6243 | 0.5000 | 0.0000 | 2.6167 |
| dense | route_100m | 0.5222 | 0.2285 | 0.6111 | 0.5000 | 0.0000 | 2.6167 |
| dense | departure_5min | 0.5389 | 0.2353 | 0.6134 | 0.5000 | 0.0000 | 2.6167 |
| dense | availability_25pct | 0.4611 | 0.2050 | 0.5525 | 0.3806 | 1.8000 | 2.1000 |

## Timing observations

Timing is machine-dependent and not a production claim. Mean feature-generation
time was approximately 5.25 ms/query for thin, 18.08 ms/query for balanced,
and 36.75 ms/query for dense control queries. Mean ranking time was below
0.1 ms/query in every scenario and condition. Availability perturbation was
faster because fewer providers remained in the pool.

## Findings and limitations

Small geometric and time perturbations did not change eligibility coverage in
this toy dataset, although NDCG changed modestly. Availability loss reduced
coverage and ranking quality, as expected, but the magnitude is benchmark-
specific. No condition is declared generally superior.

The synthetic label generator uses spatial and temporal concepts related to
the matcher, so quality metrics are not independent evidence. The experiment
has no road network, traffic, human acceptance, cancellations, uncertainty
calibration, fairness labels, or global assignment. Availability labels are
also retained after removal intentionally, so they measure lost opportunity,
not new user behavior.
