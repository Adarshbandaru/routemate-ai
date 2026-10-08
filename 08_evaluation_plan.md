# RouteMate AI — Evaluation Plan

## Evaluation layers
1. **Unit/integration:** schema, routing adapter, feasibility, assignment, explanations, and failure handling.
2. **Synthetic controlled experiments:** vary request density, spatial distribution, time windows, capacity, uncertainty, and cancellations with fixed seeds.
3. **Simulated demo:** demonstrate end-to-end behavior on configured scenarios; label every screen/output accordingly.
4. **Real-data study:** only after data governance approval, provenance review, and leakage checks.
5. **Human study:** only with appropriate ethics review/consent; measure comprehension and perceived control, not only clicks.

## Metrics
- Match rate = matched eligible requests / eligible requests (define eligibility and exclusions).
- Vehicle utilization and vehicle-kilometres, with denominator and routing assumptions.
- Added waiting and detour distributions (median, quantiles, tail, not mean alone).
- Unmatched rate and constraint-violation rate (target zero for accepted assignments).
- Runtime, peak memory, candidate count, and scaling curve.
- Robustness under perturbation: feasibility and metric degradation.
- Fairness: subgroup/area gaps in match rate, delay, detour, and rejection; only with justified, consented labels or transparent proxies.

## Baselines and ablations
Compare no-pooling, deterministic greedy, and an optimization baseline under identical inputs. Ablate uncertainty handling, explanation, and constraint classes. Report seeds, confidence intervals or uncertainty intervals where appropriate, and all failed runs.

## Reproducibility
Archive code revision, environment, network snapshot, data class, seed, configuration, metric definitions, and run manifest. Separate exploratory from confirmatory analysis. No experimental results are claimed in this plan.
