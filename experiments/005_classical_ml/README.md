# Experiment 005 — classical ML ranking

**Evidence class:** synthetic benchmark evidence only. Synthetic labels still
depend on mobility features, and the result is not real acceptance evidence.

## Reproduction

```powershell
$env:PYTHONPATH = "src"
py -m routemate.ml --output experiments/005_classical_ml/outputs
```

The command refuses a non-empty output directory and writes `manifest.json`,
`model.json`, `metrics.csv`, `per_query.csv`, `timing.csv`, and
`synthetic_dataset.json`. `model.json` is a versioned synthetic-only artifact;
loading it does not retrain the model.
The training split is seeds 101 and 202; seed 303 is test-only. Each split has
thin, balanced, and dense scenarios with 20 queries per seed/scenario.

## Methodology

Eligible pairs are produced once by `run_candidate_pipeline`; verification,
safety, capacity, distance, time, direction, and detour gates remain
deterministic. The ranker is deterministic L2-regularized logistic regression
with batch gradient descent. Training means and standard deviations are fitted
on eligible training pairs only. Its pre-match features are pickup distance,
destination distance, route similarity, direction similarity, detour,
departure difference, and capacity slack. Verification and safety are not
learned features. Held-out synthetic labels are kept separate from features.

After deterministic hard feasibility filtering, the artifact can be loaded
without retraining:

```python
from routemate.inference import rank_eligible_feature_rows
ranking = rank_eligible_feature_rows("model.json", eligible_feature_rows, ids)
```

The inference boundary does not perform safety, identity, capacity, route,
time, or detour checks. Those checks must happen before inference.

## Actual results

The table below is generated from the checked-in CLI run (means over 20 test
queries per scenario). Values are also in `outputs/metrics.csv`.

| Scenario | Method | Precision@3 | Recall@3 | NDCG@3 | Eligible coverage | Lost to hard filter |
|---|---|---:|---:|---:|---:|---:|
| thin | ml_logistic | 0.1500 | 0.5667 | 0.4091 | 0.5250 | 0.3500 |
| thin | route_time | 0.1667 | 0.6333 | 0.5179 | 0.5250 | 0.3500 |
| thin | distance_destination | 0.1500 | 0.5667 | 0.4266 | 0.5250 | 0.3500 |
| balanced | ml_logistic | 0.7833 | 0.4092 | 0.7969 | 0.5000 | 2.7500 |
| balanced | route_time | 0.7833 | 0.4009 | 0.8235 | 0.5000 | 2.7500 |
| balanced | distance_destination | 0.6833 | 0.3517 | 0.7383 | 0.5000 | 2.7500 |
| dense | ml_logistic | 0.6000 | 0.2613 | 0.6235 | 0.5000 | 3.5500 |
| dense | route_time | 0.5833 | 0.2452 | 0.5623 | 0.5000 | 3.5500 |
| dense | distance_destination | 0.5667 | 0.2396 | 0.5617 | 0.5000 | 3.5500 |

These are descriptive results from one synthetic split; no superiority claim is
made. Candidate-generation and model-ranking latency, plus training time, are
recorded in `outputs/timing.csv`.

## Limitations

The corridor is artificial and has no road ETA, traffic, human acceptance,
cancellation, calibration, fairness, or assignment outcomes. Timing is
machine-dependent. The held-out label generator deliberately depends on
mobility concepts also present in the features, so this is leakage-controlled
with respect to the split but not independent real-world validation.
