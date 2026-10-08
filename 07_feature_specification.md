# RouteMate AI — Feature Specification

| Feature | User/research value | Inputs | Output | Milestone status / evidence |
|---|---|---|---|---|
| Request intake | Defines an origin-destination need | trip request schema | validated request or error | Foundation; schema tests |
| Compatibility candidates | Narrows search | requests, time/spatial thresholds | candidate edges/groups | Synthetic fixtures only initially |
| Feasibility checker | Prevents invalid pooling | route/time/capacity constraints | checks with reasons | Unit tests required |
| Assignment optimizer | Selects a feasible set | feasible groups, objective weights | assignments and objective breakdown | Compare baselines |
| Explanation | Makes trade-offs inspectable | assignment and checks | constraint/reason text | Simulated demo; usability later |
| Scenario runner | Reproduces experiments | dataset snapshot, seed, config | run manifest and metrics | Required before claims |
| Evaluation dashboard/report | Shows quality and burden | run outputs | metric tables/plots | No fabricated results |
| Privacy controls | Limits exposure | consent, retention, access roles | policy decisions/audit events | Design and review |
| Cancellation/replanning | Models dynamic demand | events and active assignments | updated feasible plan | Deferred experiment |

## Acceptance principles
Features are accepted when behavior is tested against edge cases and provenance is visible. A simulated demo may show the interaction and pipeline but cannot establish real-world adoption, safety, savings, or fairness.

## Objective configuration
Expose weights/constraints for pooled trips, detour, waiting, unmatched demand, and computation. Persist configuration with every run; never hide a changed weight behind a UI default.
