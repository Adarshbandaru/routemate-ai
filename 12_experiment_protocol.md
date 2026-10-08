# RouteMate AI — Initial Experiment Protocol

## Objective
Estimate how matching strategy, uncertainty, and demand structure affect feasible pooling, rider burden, and computation under controlled conditions. This protocol defines measurements; it reports no results.

## Design
Generate synthetic request sets on a documented network or grid, varying request count, spatial concentration, departure-window width, capacity, detour limit, and cancellation/uncertainty level. Use at least a fixed seed list agreed before runs. Include a no-pooling baseline, deterministic greedy baseline, and candidate optimizer under the same constraints.

## Procedure
1. Validate and snapshot scenario/configuration.
2. Generate or load inputs; label `synthetic` or `real` and preserve provenance.
3. Run each algorithm with identical instances, limits, and seed policy.
4. Validate every assignment independently with the feasibility checker.
5. Emit run manifest, raw aggregate metrics, failures, runtime/memory, and objective decomposition.
6. Repeat across seeds/scenarios; keep exploratory tuning separate from held-out evaluation.

## Primary outcomes
Feasible matched-request rate, added waiting/detour distributions, unmatched rate, vehicle-kilometres (under stated routing assumptions), constraint violations, runtime, and peak memory. Secondary outcomes include robustness degradation and subgroup/area burden where labels are justified.

## Analysis rules
Define denominators and exclusions before execution. Report confidence/uncertainty intervals where warranted, effect sizes, seed variability, and all failed/timeout runs. Do not pool incomparable scenarios. No real-world benefit, safety, fairness, or emissions claim follows from synthetic or simulated-demo results alone.

## Stop and review conditions
Pause before real data if consent scope, retention, routing license, or institutional review is unresolved. Pause if assignments violate hard constraints, location exposure occurs, or metric definitions change after seeing results; document the change and treat the revised analysis as exploratory.

## Deliverables
Scenario generator/version, config files, run manifests, metric definition, environment lock, aggregate tables, limitations, and a dated evidence label for every artifact.
