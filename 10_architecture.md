# RouteMate AI — Reference Architecture

```text
Input/API -> validation & minimization -> request store
                              -> routing adapter/cache
                       candidate generator
                              -> feasibility checker
                              -> assignment engine
                              -> explanation + audit manifest
                       evaluation runner -> metrics/report artifacts
```

## Components
- **Ingestion:** validates schema, units, consent/evidence class, and rejects unsafe input.
- **Routing adapter:** isolates provider/network versions and records route provenance and uncertainty; supports synthetic fixture routing.
- **Candidate generator:** spatial-temporal index and shareability candidates; must preserve configurable recall checks.
- **Feasibility checker:** deterministic capacity, stop-order, time-window, detour, and accessibility checks with reason codes.
- **Assignment engine:** pluggable greedy and optimization algorithms; emits objective components and configuration.
- **Experiment runner:** immutable run manifest, seed, data snapshot, environment, metrics, and failure artifacts.
- **Presentation/API:** clearly labels simulated demo and does not imply live dispatch or safety verification.

## Data boundaries
Separate identifiable inputs from pseudonymous experiment tables. Do not send raw locations to analytics or logs. Use versioned interfaces so routing and optimizer changes are attributable.

## Failure behavior
Timeout, stale route, missing consent, or constraint uncertainty yields an explicit `unknown`/`rejected` status; it must not silently produce a match. Degraded-mode behavior is a research parameter and is measured.
