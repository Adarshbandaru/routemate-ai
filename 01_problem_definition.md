# RouteMate AI — Problem Definition

## Scope
RouteMate AI is a research prototype for matching people travelling along compatible routes so that a shared trip can be considered before departure. The milestone concerns problem framing and an auditable research foundation, not a production dispatch service.

## Problem statement
Given trip requests (origin, destination, departure-time window, seats, and constraints), identify feasible groups and vehicles that reduce duplicated travel while respecting detour, time, capacity, and privacy constraints. The system must expose trade-offs between mobility utility and operational, safety, and fairness costs.

## Research questions
1. How should route and time compatibility be represented so matches are useful and explainable?
2. What trade-off between pooling rate, passenger delay/detour, vehicle-kilometres, and computation is achieved by candidate algorithms?
3. How robust are recommendations to demand imbalance, noisy locations, cancellations, and uncertain travel time?
4. Which users or areas bear costs, and how can the system avoid systematically disadvantaging them?

## Explicit evidence status
- **Synthetic data:** generated requests and network instances used for controlled tests; no claim about real demand.
- **Simulated demo:** replay or visualization using synthetic/configured scenarios; demonstrates software behavior only.
- **Real data:** data collected or licensed from actual trips or users, with provenance and consent documented before use.
- **Experimental results:** measured outputs from a preregistered protocol and identified dataset/configuration. No results are asserted in this document.

## Non-goals for Milestone 0
No autonomous dispatch, price setting, identity verification, safety certification, or claim of travel-time/emissions savings. The system is not a substitute for public transit, emergency transport, or human judgment.

## Success criteria for the foundation
The project must have: an operational definition of feasibility; versioned schemas; reproducible baselines; metrics with denominators; stated data and ethical controls; and a protocol that separates simulated-demo evidence from real-data evidence.
