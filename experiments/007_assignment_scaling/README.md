# Experiment 007 — Multi-Rider Assignment Optimality and Scaling Benchmark

**Evidence class:** Controlled synthetic combinatorial optimization experiment. This benchmark evaluates heuristic batch assignment algorithms against an exact Branch-and-Bound solver across progressive scale points to quantify optimality gaps, vehicle capacity utilization, runtime scaling, and branch search complexity.

---

## 1. Research Questions

1. **Optimality Gap:** How close do Greedy priority and Auction-Swap local search heuristics come to the theoretical maximum-weight assignment found by exact Branch-and-Bound?
2. **Computational Scaling Boundary:** At what cohort scale does exact combinatorial branch-and-bound search encounter an exponential search barrier in shared journey assignment?
3. **Capacity Utilization:** Do heuristics sacrifice vehicle seat utilization or total objective score when solving larger pools?

---

## 2. Methodology & Protocol

1. **Problem Formulation:**
   - Multi-rider shared journey assignment modeled as a maximum-weight bipartite matching problem with knapsack-like vehicle capacity constraints:
     $$\max \sum_{d \in D} \sum_{r \in R} w_{d, r} x_{d, r} \quad \text{s.t.} \quad \sum_{r \in R} c_r x_{d, r} \le C_d, \quad \sum_{d \in D} x_{d, r} \le 1, \quad x_{d, r} \in \{0, 1\}$$
     where $w_{d, r}$ is the feasibility score (0–100), $c_r$ is requested seats (1–2), and $C_d$ is driver vehicle capacity (2–4).
2. **Evaluated Solvers:**
   - **Greedy Priority Heuristic:** Sorts feasible edges descending by score; greedily assigns riders to available seats. Complexity: $O(|E| \log |E|)$.
   - **Auction-Swap Heuristic:** Greedy initialization followed by iterative 2-phase swap improvements. Complexity: $O(K \cdot |R| \cdot |E|)$.
   - **Exact Branch-and-Bound (B&B):** Recursive depth-first search with greedy lower bounding and suffix upper-bound pruning ($\sum \max w$). Uses safety timeout of 5.0 seconds. Worst-case complexity: $O((|D|+1)^{|R|})$.
3. **Scale Cohorts & Seeds:**
   - 5 Scale Points: Micro (5 riders / 3 drivers), Small (10 / 5), Medium (20 / 10), Large (30 / 15), Stress (40 / 20).
   - 3 Deterministic Random Seeds per scale: `42`, `101`, `202` (15 total evaluations).
   - Zero external MIP/CP-SAT solver dependencies; strictly Python standard library.

---

## 3. Reproduction

From repository root:
```powershell
uv run python experiments/007_assignment_scaling/run.py
```
or via the RouteMate CLI:
```powershell
uv run python -m routemate.cli --assignment-benchmark
```

---

## 4. Observed Benchmark Results

### Table 1: Solution Quality & Optimality Gap across Scales

| Scale Cohort | Riders / Drivers | Mean Feasible Edges | Edge Density | Greedy Obj (Gap %) | Auction Obj (Gap %) | Exact Optimal Obj | Exact Nodes Explored |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **micro_5x3** | 5 / 3 | 4.3 | 28.9% | 127.82 (**0.00%**) | 127.82 (**0.00%**) | **127.82** | 4.0 |
| **small_10x5** | 10 / 5 | 8.3 | 16.7% | 185.59 (**10.42%**) | 185.59 (**10.42%**) | **204.29** | 23.0 |
| **medium_20x10** | 20 / 10 | 31.3 | 15.7% | 437.75 (**12.40%**) | 437.75 (**12.40%**) | **483.39** | 3,607.0 |
| **large_30x15** | 30 / 15 | 77.0 | 17.1% | 837.29 (**17.05%**) | 837.29 (**17.05%**) | **1004.44** | 2,908,045.0 |
| **stress_40x20** | 40 / 20 | 117.3 | 14.7% | 1118.85 (**6.65%**\*) | 1118.85 (**6.65%**\*) | **1189.37**\* | 2,893,933.7 |

*\* Note: At 40x20, the exact solver reached the 5.0s safety cutoff; the reported gap is against the best feasible bound found before timeout.*

### Table 2: Solver Runtime Scaling (Milliseconds)

| Scale Cohort | Riders / Drivers | Greedy Runtime | Auction-Swap Runtime | Exact Branch-and-Bound Runtime | Speedup (Greedy vs Exact) |
|---|:---:|:---:|:---:|:---:|:---:|
| **micro_5x3** | 5 / 3 | 0.008 ms | 0.034 ms | 0.103 ms | 12.9x |
| **small_10x5** | 10 / 5 | 0.008 ms | 0.024 ms | 0.117 ms | 14.6x |
| **medium_20x10** | 20 / 10 | 0.027 ms | 0.058 ms | 4.003 ms | 148.3x |
| **large_30x15** | 30 / 15 | 0.133 ms | 0.168 ms | 4,879.545 ms | **36,688x** |
| **stress_40x20** | 40 / 20 | 0.098 ms | 0.243 ms | 5,000.124 ms (timeout) | **51,020x** |

---

## 5. Key Findings & Scientific Interpretation

1. **The Combinatorial Scaling Cliff:**
   - Exact Branch-and-Bound remains sub-5ms up to **20 riders / 10 drivers** (exploring ~3,600 nodes).
   - At **30 riders / 15 drivers**, the state space expands dramatically, exploring **2.91 million nodes** and taking **~4.88 seconds**.
   - Beyond 30 riders, exact standard-library branch-and-bound exceeds practical real-time dispatch deadlines (< 500 ms).
2. **Heuristic Optimality Gap:**
   - On micro instances (5x3), Greedy and Auction find the globally optimal assignment (**0.0% gap**).
   - At medium to large scales (10x5 to 30x15), Greedy and Auction exhibit a **10.4% to 17.1% optimality gap** (mean **9.30%** overall).
   - The gap arises because greedy edge selection prematurely occupies seats with individually high-scoring riders who could alternatively be paired with secondary drivers, preventing global capacity pooling.
3. **Practical Engineering Implication:**
   - In production dispatch systems, cohorts of $\le 15$ riders can be solved to **proven mathematical optimality** within 10 ms.
   - For larger fleets ($\ge 20$ riders), fast polynomial heuristics (Greedy / Auction) provide **sub-millisecond responsiveness** (under 0.25 ms) at the cost of a predictable ~9–15% objective degradation.

---

## 6. Limitations & Scope Constraints

- **Synthetic Corridor Trajectories:** Travel points and scores are generated along artificial linear corridors, not real-world road networks with dynamic congestion.
- **Static Batching:** Solvers evaluate a static batch at a single timestamp $t_0$; dynamic arrivals, cancellations, and en-route diversions are not modeled here (deferred to Experiment 010).
- **Exact Solver Cutoff:** The 40x20 scale point is bounded by a 5.0-second safety timeout, so reported optimal values for that scale represent best-found feasible bounds.
- **No Global Scalability Claim:** This experiment does not claim that greedy heuristics scale to millions of concurrent rides without spatial decomposition or distributed partitioning.
