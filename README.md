# RouteMate AI

> **Interpretable Journey Compatibility, Multi-Rider Batch Assignment, and Synthetic Benchmark Evaluation System.**

RouteMate AI is a modular, transparent matching system for shared mobility. It combines geometric spatial indexing, hard safety & feasibility filtering, explainable scoring, greedy and local-search batch assignment heuristics, and an interactive modern web dashboard.

---

## 🌟 Key Capabilities

1. **Deterministic Multi-Stage Compatibility Pipeline**
   - **Candidate Retrieval**: Spatial bounding-box & origin-destination corridor filtering.
   - **Feature Extraction**: Haversine distances, polyline route similarity, directional bearing alignment, geometric detour calculation, and temporal departure delta.
   - **8-Rule Feasibility Matrix**: Zero-tolerance checks for route direction, pickup proximity, destination proximity, departure window, detour tolerance, identity verification, vehicle verification, and seat capacity.
   - **Interpretable Ranking**: 0–100 weighted index with per-feature explanation breakdowns and logistic regression artifacts used for candidate ranking.

2. **Multi-Rider Batch Assignment Engine**
   - **Bipartite Compatibility Graph**: Builds scored feasible edges between rider cohorts and driver fleets.
   - **Greedy Assignment**: Priority queue heuristic respecting driver vehicle seat capacities.
   - **Auction-Swap Solver**: Iterative local-search and swap-improvement heuristic seeking objective improvement over greedy initialization.
   - **Optimal Solver**: Exact branch-and-bound optimization with suffix upper-bound pruning to establish theoretical upper bounds and compute optimality gaps.

3. **14 Controlled Benchmark Experiments**
   - `001_baseline`: Unranked, spatial-only, and rule-based benchmark comparisons.
   - `002_ablation`: Leave-one-rule-out feasibility ablation quantifying false-positive leakage.
   - `003_robustness`: Behavior under correlated spatial and temporal noise.
   - `004_heldout`: Generalization across unseen corridor topologies and densities.
   - `005_classical_ml`: Supervised logistic regression ranking evaluation with NDCG / Precision / Recall tracking.
   - `006_road_network`: Empirical circuity gap benchmark comparing Euclidean straight-line distance against directed street network graph routing (4x4 urban grid, 1.341x mean circuity factor).
   - `007_assignment_scaling`: Multi-rider batch assignment optimality and scaling comparing Greedy, Auction-Swap, and Exact Branch-and-Bound solvers.
   - `008_road_network_validation`: Realistic road-network validation on an OpenStreetMap bounded graph (SF Downtown), quantifying an 80% top-1 recommendation disagreement rate and 34 false positives under Euclidean gating.
   - `009_hybrid_pruning`: Two-tier candidate pruning with provably admissible Euclidean lower bounds, achieving 81.8% routing-call reduction with 0 false negatives and 100% top-1 agreement.
   - `010_dynamic_congestion`: Dynamic road congestion curves (BPR formulation) and peak-hour time-window robustness, evaluating arrival time sensitivity and multi-stop detour viability under asymmetric directional traffic.
   - `011_multi_rider_pooling`: Multi-rider capacity pooling under dynamic congestion, quantifying capacity scaling (utilization 100% at K=1 to 85% at K=2), stop sequence shifts under severe congestion (20.0%), and exact branch-and-bound vs greedy heuristic comparisons.
   - `012_dynamic_recourse`: Dynamic curbside dwell, incident congestion, and online rerouting/recourse, establishing that incident blockages reduce static plan feasibility to 50–60%, while lightweight online recourse restores feasibility to 100% with verified independent seed stability.
   - `013_rolling_dispatch`: Fleet-wide rolling-horizon dispatch comparing static-batch, periodic-rolling, and event-driven policies, establishing that event-driven rolling dispatch with active-trip insertions reduces fleet VKT by 60.5% (50.5 km vs 127.8 km) and cuts median waiting times by 39.1% (103s vs 169s) under balanced demand without increasing cancellations.
   - `014_research_synthesis`: Comprehensive cross-experiment meta-analysis synthesizing Experiments 001–013 across 8 architectural trade-off dimensions, proving H1, H2, and H3, establishing limitations, and providing reproducible audit artifacts.


4. **Standard-Library Local HTTP API (Prototype-Only)**
   - Lightweight Python standard-library service (`http.server`) with CORS support for local development.
   - `GET /health` — Service readiness and version status.
   - `GET /v1/road-benchmark` — Street network vs. Euclidean circuity gap metrics.
   - `POST /v1/matches` — 1-to-N journey retrieval, feasibility filtering, and ranking.
   - `POST /v1/assignments` — Multi-rider fleet batch assignment (Greedy, Auction, or Optimal).
   - `POST /v1/routes` — Point-to-point street graph shortest-path routing.
   - *Note: Prototype boundary only; lacks authentication, TLS, and rate limiting.*

5. **Interactive Web Dashboard**
   - Built with **React + Vite + Leaflet**.
   - **Match Playground**: Live spatial corridor mapping, interactive driver inspection, and CSV export.
   - **Batch Assignment**: Side-by-side Greedy vs. Auction simulation with vehicle seat utilization gauges.
   - **Experiments Explorer**: Full metric tables, radar charts, and rule ablation heatmaps.
   - **Live API Integration**: Real-time HTTP connection, latency monitoring, and request audit history.
   - **Architecture & Theory**: Interactive system diagram and mathematical contract specifications.

---

## 🚀 Getting Started

### 1. Python Environment & CLI

Clone and install dependencies (Python 3.9+):
```powershell
uv venv
uv pip install -e .
```

#### Run the 1-on-1 Compatibility Demo
```powershell
uv run routemate-demo
# or
py -m routemate.cli
```

#### Run Multi-Rider Batch Assignment Demo
```powershell
uv run python -m routemate.cli --batch
```

#### Run Road Network Circuity Benchmark
```powershell
uv run python -m routemate.cli --road-benchmark
```

#### Run Road Network Trajectory Validation (Experiment 008)
```powershell
uv run python -m routemate.cli --road-network-validation
```

#### Run Hybrid Two-Tier Pruning Benchmark (Experiment 009)
```powershell
uv run python -m routemate.cli --hybrid-pruning-benchmark
```

#### Run Dynamic Congestion Benchmark (Experiment 010)
```powershell
uv run python -m routemate.cli --dynamic-congestion-benchmark
```

#### Run Multi-Rider Assignment Benchmark (Experiment 007)
```powershell
uv run python -m routemate.cli --assignment-benchmark
```

#### Run Multi-Rider Capacity Pooling Benchmark (Experiment 011)
```powershell
uv run python -m routemate.cli --multi-rider-benchmark
```

#### Run Dynamic Recourse Benchmark (Experiment 012)
```powershell
uv run python -m routemate.cli --recourse-benchmark
```

#### Run Fleet-Wide Rolling Dispatch Benchmark (Experiment 013)
```powershell
uv run python -m routemate.cli --rolling-dispatch-benchmark
```

#### Run Research Synthesis & Cross-Experiment Analysis (Experiment 014)
```powershell
uv run python -m routemate.cli --synthesis-benchmark
```

#### Run the Local API Server
```powershell
uv run routemate-api --port 8000
# or
py -m routemate.api --port 8000 --model experiments/005_classical_ml/outputs/model.json
```

---

### 2. Interactive Web Dashboard

Navigate to the dashboard directory:
```powershell
cd dashboard
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

To create an optimized production build:
```powershell
npm run build
```

---

## 🧪 Testing

Execute the full automated test suite (150 unit tests):
```powershell
uv run python -m unittest discover tests
```

---

## 📐 Mathematical Formulation

- **Haversine Distance**:
  $$d = 2 R \arcsin \left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos \phi_1 \cos \phi_2 \sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  *(Using mean volumetric Earth radius $R = 6371.0088\text{ km}$)*

- **Geometric Insertion Detour**:
  $$\text{Detour}(D, R) = \max\left(0,\, d(D_{\text{start}}, R_{\text{pickup}}) + d(R_{\text{pickup}}, D_{\text{dest}}) - d(D_{\text{start}}, D_{\text{dest}})\right)$$

- **Route Direction Similarity**:
  $$\text{DirectionSim}(D, R) = \frac{1 + \cos(\theta_D - \theta_R)}{2} \in [0, 1]$$

---

## 🛡️ Ethics, Safety & Scope Note

All data generated in this repository represents **strictly synthetic, simulated equatorial corridor trajectories**. Scores indicate mathematical compatibility according to modeled heuristics and do not establish real-world user acceptance, driver behavior, physical safety, or commercial dispatch guarantees.
