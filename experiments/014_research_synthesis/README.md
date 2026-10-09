# Experiment 014: Research Synthesis & Cross-Experiment Meta-Analysis

## Abstract

**Background:** High-capacity shared mobility and microtransit systems require balancing computational scalability with physical road-network realism, dynamic travel delays, curbside dwell variability, and passenger ride quality.  
**Objective:** This study conducts a rigorous synthesis and meta-analysis across Experiments 001 through 013 of the RouteMate AI project, evaluating 13 controlled investigations into matching heuristics, road-network topology, candidate pruning, multi-rider pooling, dynamic recourse, and fleet-wide rolling-horizon dispatch.  
**Methods:** We audited the empirical artifacts, manifests, test suites, and benchmarks across the entire project lifecycle, cross-referencing pre-registered hypotheses against measured algorithmic outcomes. We evaluate trade-offs across eight core system dimensions: ranking quality, road-network fidelity, routing latency, pruning recall, assignment optimality, pooling capacity, congestion/recourse, and rolling-horizon dispatch.  
**Results:** Empirical results confirm that: (1) expanding vehicle capacity from single-occupancy ($C=1$) to pooled ($C=2$) increases rider matching fulfillment by $+70.0\%$ (from $40.0\%$ to $68.0\%$) with manageable detour ($2.93\text{ km}$ average); (2) Euclidean spatial gating suffers an unacceptable $75.6\%$ false-positive feasibility rate due to urban one-way streets, whereas admissible two-tier Euclidean lower-bounding eliminates $81.8\%$ of network Dijkstra calls with exactly $0$ false negatives ($100\%$ recall, $5.49\times$ speedup); (3) greedy assignment achieves $< 1\text{ ms}$ latency across all tested scales with a modest $10\text{--}17\%$ optimality gap on small cohorts and $26.9\%$ on pooled tours, whereas exact branch-and-bound optimization times out on $5\times 8$ matching graphs; (4) dynamic road closures induce up to $50\%$ schedule infeasibility under static plans, which online multi-hypothesis recourse restores to $100\%$ feasibility in $3.42\text{ ms}$; and (5) event-driven rolling dispatch with active-trip insertions slashes fleet vehicle kilometers traveled (VKT) by $60.5\%$ and median wait times by $39.1\%$ compared to static $60\text{s}$ batching.  
**Conclusion:** Pre-registered hypotheses H1 (pooling gain), H2 (congestion sensitivity), and H3 (computational frontier) are fully supported by empirical data. Research questions RQ4 (spatial disparity) and RQ5 (interpretability) are partially supported, identifying critical frontiers for demographic equity and real-world behavioral trials.

---

## 1. Introduction & Research Trajectory

Modern ride-pooling systems operate under conflicting physical, temporal, and computational constraints. Early carpooling and microtransit platforms relied on Euclidean approximations and static periodic matching to manage combinatorial complexity. However, such simplifications fail in urban street networks where one-way restrictions, traffic signals, recurring peak congestion, stochastic curbside passenger loading, and link disruptions diverge sharply from idealized straight-line distance.

The RouteMate AI project investigated this operational frontier through 13 sequential, reproducible experimental milestones spanning four distinct phases:
1. **Foundational Matching & Retrieval (Exps 001–005):** Formulated deterministic journey compatibility scoring, conducted leave-one-out feature ablations, tested spatial/temporal jitter robustness, evaluated cross-corridor generalization, and compared heuristic scoring with classical supervised machine learning.
2. **Road-Network Realism & Gating Pruning (Exps 006–009):** Modeled directed Manhattan grids and real OpenStreetMap (OSM) downtown networks, quantified street-level circuity asymmetry, benchmarked exact vs. greedy bipartite matching, and devised an admissible two-tier pruning pipeline that accelerates shortest-path routing.
3. **Dynamic Congestion, Capacity Pooling & Recourse (Exps 010–012):** Integrated Bureau of Public Roads (BPR) volume-delay curves, scaled vehicle tour optimization to multi-rider pickup/dropoff sequences ($C=1\dots 4$), and implemented sub-5 ms online recourse to recover from stochastic curbside dwell and unexpected arterial link closures.
4. **Fleet-Wide Rolling Dispatch Simulation (Exp 013):** Formulated an event-driven rolling-horizon fleet simulator evaluating dynamic stochastic passenger demand, in-flight vehicle insertions, and passenger cancellation dynamics against static-batch assignment.

This synthesis (Experiment 014) compiles and verifies all empirical evidence from Experiments 001–013 without inventing or retroactively smoothing conflicting data points.

---

## 2. Comprehensive Cross-Experiment Synthesis Matrix

The table below summarizes each audited experiment, its empirical scope, methodology, key verified metrics, and pre-registered hypotheses.

| Experiment | Title | Benchmark Scope | Methodology & Core Algorithms | Primary Verified Metrics | Pre-Registered Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **001** | Baseline Matching & Filtering | 1-to-1 synthetic corridor queries | Unranked baseline vs Spatial-only vs Rule-based filters | P@3: 0.389 (spatial) vs 0.422 (rule); Hard-filter reduction: 1.45x | Supported |
| **002** | Leave-One-Out Rule Ablation | 1-to-N journey retrieval with ablations | Full rules vs ablations (direction, proximity, detour) | Full P@3: 0.422; Direction leakage: 35.0%; Detour leakage: 28.0% | Supported |
| **003** | Spatial/Temporal Robustness | Spatial jitter (100m) and temporal jitter (15 min) | Perturbation sensitivity testing on synthetic trips | Noise $\le$ 100m: 0 rank inversions; Noise 500m: 14.2% rank changes | Supported |
| **004** | Cross-Corridor Generalization | Thin, balanced, and dense synthetic corridors | Out-of-distribution density evaluation | Balanced NDCG@3: 0.824; Dense NDCG@3: 0.812; Stable across regimes | Supported |
| **005** | Supervised Classical ML | Feature engineering on synthetic corridors | Logistic regression vs random forest vs linear heuristic | Logistic NDCG@3: 0.797; Heuristic NDCG@3: 0.824; ML weights align | Partially Supported |
| **006** | Street-Level Circuity | 4x4 Manhattan grid (30 OD pairs) | Grid topological Dijkstra vs Haversine straight-line | Mean circuity: 1.282x; One-way arterial peak circuity: 3.075x | Supported |
| **007** | Batch Assignment Scaling | 5x3 to 40x20 bipartite matching cohorts | Branch-and-bound exact vs greedy priority queue | Small cohort gap: 10.3%; 20x10 exact time: 1,142 ms; Greedy: < 1 ms | Supported |
| **008** | Realistic Road Validation | Downtown San Francisco OSM (26 nodes, 53 edges) | Topological Dijkstra vs Euclidean gating (45 pairs) | Euclidean gating false-positive rate: 75.6% (34/45); Top-1 rank shift: 68.0% | Supported |
| **009** | Hybrid Two-Tier Pruning | Downtown SF OSM network (45 candidate pairs) | Admissible lower-bound pruning vs heuristic bounds | Pruned Dijkstra calls: 81.8%; False negatives: 0 (100% recall); Speedup: 5.49x | Supported |
| **010** | Dynamic Congestion Curves | Downtown SF OSM with BPR congestion curves | Time-dependent travel times across 4 volume regimes | Severe congestion delay: +119.5s; Feasible pool cut by 70.6%; Top-1 shift: 16.7% | Supported |
| **011** | Multi-Rider Capacity Pooling | Capacitated tour optimization ($C=1\dots 4$, 25 pairs) | Exact branch-and-bound vs greedy insertion tours | Capacity C=1 to C=2: +70% matched riders; Proven optimality gap: 26.94%; 5x8 exact timeout | Supported |
| **012** | Dynamic Recourse & Incidents | Dynamic road network under link closures & dwell | Multi-hypothesis branch pruning vs static plan | Link closures: 40-50% static failure; Online recourse: 100% feasibility restored; Latency: 3.42 ms | Supported |
| **013** | Fleet Rolling-Horizon Dispatch | Discrete-event fleet simulator (8 drivers, 10-25 riders) | Event-driven rolling dispatch vs static 60s batching | Rolling dispatch cuts fleet VKT by 60.5% (50.5 vs 127.8 km); Median wait cut by 39.1% | Supported |

---

## 3. Pre-Registered Hypotheses & Research Questions Evaluation

### Hypothesis H1 (Multi-Objective Pooling Gain)
> *Expanding vehicle capacity from single-occupancy ($C=1$) to multi-rider pooling ($C \ge 2$) significantly increases rider fulfillment and fleet vehicle efficiency under bounded passenger detour.*
- **Status:** **SUPPORTED**
- **Supporting Evidence:**
  - In Experiment 011, expanding vehicle capacity from $C=1$ to $C=2$ increased the proportion of matched riders from $40.0\%$ to $68.0\%$ ($+70.0\%$ relative gain), while mean passenger detour increased by only $2.93\text{ km}$ ($5.5\text{ min}$).
  - In Experiment 013, fleet-wide rolling dispatch achieved a pooling rate of $46.2\%$ in balanced demand and $66.7\%$ in high demand, reducing total fleet vehicle kilometers traveled (VKT) by $60.5\%$ ($50.5\text{ km}$ vs $127.8\text{ km}$ under static batching).
- **Caveats:** Expanding capacity beyond $C=2$ to $C=4$ yielded diminishing marginal fulfillment ($68.0\% \rightarrow 72.0\%$) while doubling maximum detour risk and exponentially increasing stop permutation search complexity.

### Hypothesis H2 (Uncertainty & Congestion Sensitivity)
> *Dynamic congestion, stochastic curbside dwell, and unexpected street disruptions degrade static route feasibility, but can be recovered through online multi-hypothesis recourse.*
- **Status:** **SUPPORTED**
- **Supporting Evidence:**
  - In Experiment 010, severe peak congestion expanded travel times by $2.84\times$ and eliminated $70.6\%$ of feasible matches that were viable under free-flow conditions.
  - In Experiment 012, arterial link closures caused static routes to suffer an immediate $40.0\%\text{--}50.0\%$ feasibility failure rate.
  - Sub-5 ms online multi-hypothesis recourse restored feasibility to $100.0\%$, achieving a $76.7\%$ mean objective recovery and reducing regret from $35.86$ to $5.42$ points.
- **Caveats:** Recovery requires at least one alternative topological path in the underlying graph. In single-artery bottleneck segments, link closures force vehicle turnaround delays that degrade on-time performance regardless of recourse.

### Hypothesis H3 (Compute-Quality Pareto Frontier)
> *Greedy insertion heuristics and admissible geometric pruning provide real-time latency ($< 5\text{ ms}$) with bounded, predictable loss relative to exact exponential optimization.*
- **Status:** **SUPPORTED**
- **Supporting Evidence:**
  - In Experiment 007, greedy priority-queue assignment solved $40 \times 20$ bipartite matching in $< 1\text{ ms}$ with a bounded $10\text{--}17\%$ optimality gap on small instances, whereas exact branch-and-bound scaled exponentially ($1,142\text{ ms}$ on $20 \times 10$).
  - In Experiment 009, two-tier admissible Euclidean lower-bounding eliminated $81.8\%$ of candidate pairs before road routing with exactly $0$ false negatives ($100\%$ recall, $5.49\times$ speedup).
  - In Experiment 011, exact multi-rider tour optimization timed out on $5 \times 8$ cohorts, while greedy insertion consistently evaluated multi-rider tours in $< 0.1\text{ ms}$ with a mean proven gap of $26.94\%$.
- **Caveats:** The greedy optimality gap widens under asymmetric network topologies and tight time windows where myopic earliest-deadline choices preclude globally optimal high-capacity tours.

### Research Question RQ4 (Spatial Disparities & Network Equity)
> *Do directional road topology and capacity constraints introduce systemic spatial disparities in wait time and detour across urban sub-regions?*
- **Status:** **PARTIALLY SUPPORTED**
- **Supporting Evidence:**
  - In Experiment 006, one-way street geometry created extreme directional circuity asymmetry: east-west pairs exhibited circuity of $1.15\times$, whereas west-east pairs on the parallel one-way grid reached $3.075\times$.
  - In Experiment 013, high-demand tail wait times diverged sharply: 95th-percentile wait times reached $251\text{ s}$, compared to a median wait time of $103\text{ s}$ ($2.44\times$ disparity).
- **Limitations & Missing Ground Truth:** The synthetic datasets do not carry socioeconomic, income, or demographic attributes. Observed disparities stem strictly from planar network graph topology and one-way link density, rather than institutional or socioeconomic bias.

### Research Question RQ5 (Explainability & Rule Attribution)
> *Do transparent compatibility rules and feature attribution preserve ranking fidelity relative to opaque supervised models?*
- **Status:** **PARTIALLY SUPPORTED**
- **Supporting Evidence:**
  - In Experiment 001 and 002, linear compatibility scoring allowed exact mathematical attribution of penalties (pickup distance, detour ratio, bearing mismatch).
  - In Experiment 005, logistic regression trained on synthetic corridors produced feature weights that aligned with heuristic weights, but heuristic scoring achieved slightly higher ranking fidelity ($0.824$ vs $0.797$ NDCG@3) without overfitting.
- **Limitations & Missing Ground Truth:** While mathematical interpretability is demonstrated, human-factors research (e.g., driver trust, passenger willingness to accept pooled detours) requires real-world user studies that were beyond the computational scope of these benchmarks.

---

## 4. Eight-Dimensional Architectural Trade-off Deep Dive

```mermaid
graph TD
    A[Passenger / Driver Query Pool] --> B{Two-Tier Admissible Pruner<br/>(Exp 009)}
    B -- "81.8% Rejected (Euclidean Lower Bound)" --> C[Discarded: 0 False Negatives]
    B -- "18.2% Candidate Pairs" --> D[Network Graph Router<br/>(Exps 006, 008, 010)]
    D --> E{Dynamic Congestion & Dwell<br/>(Exps 010, 012)}
    E --> F[Multi-Rider Insertion Tours C=2<br/>(Exp 011)]
    F --> G[Event-Driven Rolling Dispatcher<br/>(Exp 013)]
    G --> H[Online Recourse Router<br/>(Exp 012)]
    H --> I[Active Fleet Execution]
```

### 1. Ranking Quality vs. Heuristic Simplicity
- **Trade-off:** Complex non-linear supervised classifiers vs. deterministic linear compatibility functions.
- **Empirical Evidence:** In Experiment 005, supervised logistic regression attained $0.797$ NDCG@3, while the handcrafted linear compatibility index in Experiment 004 attained $0.824$ NDCG@3 on the same features.
- **Architectural Decision:** Deploy transparent, parameterized linear compatibility scoring for candidate retrieval and filtering. Reserve complex ML for personalized passenger conversion scoring where labeled historical acceptance logs exist.

### 2. Road-Network Geometric Accuracy vs. Euclidean Approximation
- **Trade-off:** Sub-microsecond straight-line geometric formulas vs. network-topology Dijkstra shortest paths.
- **Empirical Evidence:** Experiment 008 proved that straight-line Euclidean distance incurs a catastrophic $75.6\%$ false-positive rate ($34/45$ candidate pairs declared feasible by Euclidean gating were actually infeasible on the road network due to one-way streets and turn restrictions). Top-1 rank recommendations disagreed in $68.0\%$ of cases.
- **Architectural Decision:** Never dispatch vehicles based on Euclidean proximity. All final feasibility checks and driver-rider assignments must be grounded in street network shortest-path distances.

### 3. Routing Latency vs. Dijkstra Path Expansion
- **Trade-off:** Maintaining sub-millisecond assignment cycle times vs. evaluating multi-stop shortest paths on road graphs.
- **Empirical Evidence:** Euclidean distance requires $\sim 45\ \mu\text{s}$ per pair, whereas road Dijkstra routing requires $\sim 974\ \mu\text{s}$ per pair ($21.5\times$ slower). In multi-rider pooling (Exp 011), evaluating all valid stop permutations across a 4-stop tour on the street graph can require $4\text{--}15\text{ ms}$ per vehicle.
- **Architectural Decision:** Decouple candidate generation from exact path synthesis. Use precomputed node-to-node distance matrices or Contraction Hierarchies to query travel times in microseconds, synthesizing full polyline geometries only for committed assignments.

### 4. Pruning Recall vs. Search Speedup
- **Trade-off:** Aggressive heuristic spatial pruning vs. provably admissible geometric bounding.
- **Empirical Evidence:** In Experiment 009, aggressive circuity-aware heuristic pruning discarded $97.8\%$ of pairs but suffered an intolerable $85.7\%$ false-negative rate (discarding $6$ out of $7$ truly feasible matches). Conversely, admissible Euclidean lower-bounding pruned $81.8\%$ of candidate pairs with exactly $0$ false negatives ($100.0\%$ recall, $5.49\times$ computational speedup).
- **Architectural Decision:** Mandate admissible lower-bound pruning as Tier-1 filtering before invoking network routing engines. Under no circumstances deploy non-admissible heuristic cuts that discard valid ride matches.

### 5. Assignment Optimality vs. Solver Runtime
- **Trade-off:** Global branch-and-bound integer programming vs. greedy priority-queue insertion.
- **Empirical Evidence:** In Experiment 007 and 011, greedy heuristics executed in $< 1\text{ ms}$ across all problem sizes ($5\times 3$ to $40\times 20$), incurring a modest $10.3\%\text{--}16.9\%$ optimality gap on small bipartite graphs and $26.94\%$ on multi-rider pooled tours. The exact branch-and-bound solver scaled exponentially ($1,142\text{ ms}$ at $20\times 10$) and timed out entirely on $5\times 8$ pooled instances.
- **Architectural Decision:** Use greedy priority-queue insertion for real-time dispatch pipelines where response latency must remain below $10\text{ ms}$. Reserve exact solvers for offline benchmarking and policy calibration.

### 6. Vehicle Pooling Capacity vs. Passenger Detour Burden
- **Trade-off:** Maximizing vehicle seat utilization ($C \ge 2$) vs. minimizing in-vehicle travel delay for initial riders.
- **Empirical Evidence:** In Experiment 011, moving from $C=1$ to $C=2$ yielded a massive $+70.0\%$ surge in matched riders ($40.0\% \rightarrow 68.0\%$) with an average detour increase of only $2.93\text{ km}$ ($5.5\text{ min}$). Increasing capacity further to $C=3$ and $C=4$ produced negligible fulfillment gains ($68.0\% \rightarrow 72.0\%$) while doubling maximum detour risk and inflating stop search permutations.
- **Architectural Decision:** Standardize the pooling engine on a maximum vehicle capacity of $C=2$ for passenger cars, enforced by an absolute detour ceiling ($3.5\text{ km}$ or $25\%$ of direct trip time).

### 7. Congestion Delay & Online Recourse vs. Static Plan Fragility
- **Trade-off:** Fixed static route execution vs. real-time dynamic rerouting under unexpected incidents.
- **Empirical Evidence:** In Experiment 012, unadapted static routes failed completely ($40\%\text{--}50\%$ infeasible) when an arterial link was blocked. Online multi-hypothesis recourse evaluated alternate pickup/dropoff sequences in $3.42\text{ ms}$, successfully recovering $100\%$ trip feasibility and restoring $76.7\%$ of lost objective score.
- **Architectural Decision:** Equip all active vehicle dispatch controllers with event-driven online recourse that triggers immediately upon detecting road incidents or excessive curbside dwell delays.

### 8. Rolling-Horizon Dispatch vs. Batch Quantization Delay
- **Trade-off:** Periodic batching (e.g., $60\text{s}$ windows) vs. immediate event-driven rolling replanning.
- **Empirical Evidence:** In Experiment 013, static $60\text{s}$ batching prevented in-flight pickups and suffered from quantization delay, resulting in $127.8\text{ km}$ total fleet VKT and a median wait time of $169\text{ s}$. Event-driven rolling dispatch with active-trip waypoint insertions cut fleet VKT by $60.5\%$ ($50.5\text{ km}$) and slashed median wait time by $39.1\%$ ($103\text{ s}$).
- **Architectural Decision:** Abandon rigid periodic batch windows. Implement an event-driven rolling-horizon dispatch architecture where rider arrivals, vehicle dropoffs, and passenger cancellations trigger localized sub-millisecond insertion updates.

---

## 5. Threats to Validity & Limitations

To maintain scientific integrity, we explicitly document threats to validity and data limitations across the experimental suite:

### 1. Construct Validity
- **Detour Metric Formulation:** Detour is computed as directed street network distance. In actual metropolitan environments, curbside passenger boarding involves double-parking search, illegal stopping avoidance, and passenger walking access time, which are omitted from macro-network path costs.
- **Objective Score Aggregation:** The composite compatibility score ($0\text{--}100$) uses handcrafted linear weights rather than parameters estimated from discrete choice models of passenger willingness-to-pay.

### 2. Internal Validity
- **Macroscopic Congestion vs. Microscopic Flow:** Dynamic congestion was simulated via BPR volume-delay link functions. While standard in transportation planning, BPR curves represent static macroscopic equilibrium rather than microscopic shockwave propagation, queue spillback, or traffic signal synchronization (e.g., as modeled in SUMO or Aimsun).
- **Static Dwell Distributions:** Curbside dwell times were sampled from log-normal distributions parameterized by urban field averages. Real curbside dwell exhibits spatial heterogeneity dependent on lane parking regulations and luggage loading requirements.

### 3. External Validity
- **Road Network Scale:** Topological road validation was conducted on a Downtown San Francisco corridor ($26$ nodes, $53$ directed edges). While representative of high-density one-way grid networks, it does not capture the topological characteristics of sprawling suburban networks or multi-ring beltways.
- **Synthetic Passenger Cohorts:** Passenger demand was synthesized via Poisson arrival processes over parameterized corridors. Real-world mobility displays non-stationary bursts, severe spatial imbalances (e.g., airport-to-downtown morning commutes), and correlated weather disruptions.
- **Fleet Scale:** Benchmarked fleet sizes ($8\text{--}20$ drivers, $10\text{--}40$ riders) represent local zone-level microtransit dispatch rather than city-wide operations with tens of thousands of concurrent vehicles.

### 4. Reproducibility & Leakage Prevention
- **Deterministic Pseudo-Random Seeds:** All stochastic generators (demand arrivals, incident locations, dwell samples) use fixed seeds ($42, 101, 2024$) and discrete event queues.
- **Train/Test Independence:** In Experiment 004 and 005, training cohorts and test evaluation instances were isolated across independent seed streams, preventing data leakage.
- **Zero Wall-Clock Algorithmic Coupling:** All dispatch decisions and simulations depend solely on discrete event timestamps, ensuring $100\%$ reproducible bit-for-bit trajectory execution across hardware architectures.

---

## 6. Discussion: Recommended Architecture for Production Dispatch

Based on the evidence from Experiments 001–013, we present the recommended production dispatch architecture:

```
[Incoming Rider Requests] 
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ Tier 1: Two-Stage Admissible Bounding (Exp 009)        │
│ • Euclidean lower-bound filter (eliminates > 80% calls)│
│ • Guaranteed 100% recall (0 false negatives)           │
└────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ Tier 2: Dynamic Network Shortest Path (Exps 008, 010)   │
│ • OSM directed street graph with turn constraints      │
│ • Time-dependent BPR congestion estimates              │
└────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ Tier 3: Capacitated Tour Insertion (C=2) (Exp 011)     │
│ • Multi-rider sequence construction with hard detour   │
│ • Fast greedy insertion (< 1 ms latency)               │
└────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ Tier 4: Event-Driven Rolling Dispatcher (Exp 013)       │
│ • Continuous state transitions with active-trip hooks  │
│ • Sub-5 ms online incident recourse (Exp 012)          │
└────────────────────────────────────────────────────────┘
```

---

## 7. Future Work

1. **Large-Scale Metropolitan Micro-Simulation:** Scale the event-driven dispatch simulator to regional networks with $\ge 5,000$ active vehicles and $\ge 50,000$ daily trips using SUMO co-simulation for microscopic queue dynamics.
2. **Reinforcement Learning for Anticipatory Vehicle Relocation:** Combine the fast greedy insertion dispatcher with a macro-level RL agent that positions idle vehicles toward forecasted spatial demand hotspots before requests materialize.
3. **Econometric Willingness-to-Pay Integration:** Replace handcrafted heuristic scoring weights with utility functions calibrated against empirical passenger choice data, optimizing pricing dynamically alongside detour matching.
4. **Demographic Equity Constraints in Fleet Routing:** Explicitly incorporate demographic and geographic fairness constraints into the rolling dispatch objective to bound maximum waiting time disparities across underserved urban zones.

---

## 8. Artifact & Verification Index

All claims in this report are backed by audited artifacts in the repository:

- **Synthesis Runner:** `experiments/014_research_synthesis/run.py`
- **Output Results:** `experiments/014_research_synthesis/outputs/results.json`
- **Output Metrics:** `experiments/014_research_synthesis/outputs/metrics.csv`
- **Manifest:** `experiments/014_research_synthesis/outputs/manifest.json`
- **Cross-Experiment Comparison Table:** `experiments/014_research_synthesis/outputs/synthesis_table.csv`
- **Unit Test Suite:** `tests/test_experiment_014.py` (6 unit tests passing)

### CLI Command to Reproduce
```bash
uv run python experiments/014_research_synthesis/run.py
# or via CLI flag
uv run python -m routemate.cli --synthesis-benchmark
```
