# RouteMate AI — Compute Strategy

## Staged approach
1. Develop on small synthetic fixtures with deterministic seeds and a simple reference implementation.
2. Profile candidate generation, feasibility checks, and assignment separately as request count and capacity grow.
3. Use vectorized/indexed operations and caching for repeated route queries; preserve a correctness oracle on small instances.
4. Compare exact/solver approaches with bounded heuristics only after defining an objective and timeout policy.
5. Scale experiments with isolated workers and immutable manifests; keep raw inputs and outputs versioned.

## Resource measurements
Record CPU model/count, RAM, accelerator (if any), software versions, wall-clock and CPU time, peak memory, instance size, routing calls, and cost estimate where applicable. Report distributions over seeds, not a single favorable run.

## Determinism and limits
Pin dependencies and solver versions where possible. Set explicit time, memory, and routing-call limits. A timeout is an outcome (`timeout`), not a zero-quality solution. Randomized algorithms record seeds. Do not use cloud or accelerator scale to conceal an unexamined algorithmic cost.

## Reproducibility tiers
- Tier 1: small fixtures runnable locally from the repository.
- Tier 2: synthetic scaling suite with published manifests and generated-data recipe.
- Tier 3: approved real-data run with restricted access, documented snapshot, and reproducible aggregate artifacts.

All tiers must identify whether outputs are synthetic, simulated demo, real data, or experimental results.
