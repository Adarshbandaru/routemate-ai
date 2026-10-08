# RouteMate AI — Research Questions and Hypotheses

## Primary questions

| ID | Question | Planned comparison | Evidence required |
|---|---|---|---|
| RQ1 | How do matching objectives affect pooling and rider cost? | Greedy, bipartite/assignment, and constrained optimization | Reproducible simulation; real-data evaluation only if approved |
| RQ2 | How sensitive is matching to time and route uncertainty? | Perturbation and calibrated uncertainty scenarios | Synthetic/simulated experiments |
| RQ3 | What is the compute/quality frontier? | Exact or high-quality solver vs heuristics | Runtime, memory, quality across instance sizes |
| RQ4 | Are benefits and burdens distributed equitably? | Stratified and subgroup metrics | Non-sensitive proxies or consented data; no unsupported demographic inference |
| RQ5 | Do explanations improve appropriate acceptance? | Explanation variants in a controlled study | Human-subject approval and measured outcomes |

## Testable hypotheses (to be preregistered)
- H1: Under the same constraints, a multi-objective matcher produces a higher feasible pooling rate than a no-pooling baseline, at a measurable detour cost.
- H2: Increasing uncertainty bounds reduces feasible matches unless the matcher explicitly models uncertainty.
- H3: Heuristics reduce latency relative to exact optimization on larger instances, with a quality loss that should be reported rather than assumed.

These are hypotheses, not findings. Effect sizes, thresholds, and statistical tests must be fixed before confirmatory analysis.

## Variables and units
Request-level: waiting time (minutes), in-vehicle time (minutes), detour (minutes or ratio), and acceptance (binary only with consent). System-level: feasible groups, vehicle-kilometres, passenger-kilometres, runtime (seconds), peak memory, and fairness gaps. All metrics require a defined population, time window, and missing-data rule.

## Questions deferred
Pricing, incentives, safety scoring, and emissions accounting require domain-specific validation and are outside the initial claim boundary.
