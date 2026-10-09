# RouteMate AI

> **Interpretable Journey Compatibility, Multi-Rider Batch Assignment, and Event-Driven Fleet Dispatch System.**

[![CI Status](https://github.com/Adarshbandaru/routemate-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Adarshbandaru/routemate-ai/actions/workflows/ci.yml)
[![Python Tests](https://img.shields.io/badge/tests-158%20passed-brightgreen.svg)]()
[![Python Version](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12-blue.svg)]()
[![Frontend Build](https://img.shields.io/badge/dashboard-Vite%20%2B%20React%2019-61dafb.svg)]()
[![Docker](https://img.shields.io/badge/docker-ready-2496ed.svg)]()
[![Research Preprint](https://img.shields.io/badge/research-preprint%20available-ff69b4.svg)](research/paper/paper.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RouteMate AI is a modular, transparent matching and fleet dispatch intelligence platform for shared mobility. It integrates two-tier admissible spatial pruning, zero-tolerance hard feasibility & safety filtering, explainable candidate ranking, combinatorial multi-rider pooling heuristics, sub-5ms dynamic incident recourse, and event-driven rolling-horizon fleet dispatch.

---

## 🏗️ System Architecture

```text
[ Passenger Request ] ──────────────► [ Spatial Index & Corridor Gating ]
                                                    │
                                                    ▼
                                  [ Tier-1: Calibrated Lower Bound Pruning ]
                                     (81.8% Network Dijkstra Calls Saved)
                                                    │
                                                    ▼
                                    [ 8-Rule Zero-Tolerance Hard Gates ]
                                     ├── Direction Bearing Alignment (cos θ ≥ 0.5)
                                     ├── Pickup Proximity (≤ 3.0 km)
                                     ├── Dropoff Proximity (≤ 3.0 km)
                                     ├── Departure Window (≤ 15 min)
                                     ├── Detour Tolerance (≤ 4.0 km)
                                     ├── Identity Verification (Mandatory)
                                     ├── Vehicle Verification (Mandatory)
                                     └── Seat Capacity Availability
                                                    │
                                                    ▼
                                   [ Explainable Machine Learning Ranking ]
                                     ├── L2 Logistic Model (Trained Artifact)
                                     └── Route-Time Heuristic + Feature Attribution
                                                    │
                                                    ▼
                                    [ Combinatorial Fleet Batch Pooling ]
                                     ├── Greedy Insertion (<1ms, 9.3% Gap)
                                     ├── Auction-Swap Local Search
                                     └── Exact Branch & Bound Solver
                                                    │
                                                    ▼
                                    [ Dynamic Rolling-Horizon Dispatch ]
                                     ├── Event-Driven Triggers (Arrivals / Stops)
                                     ├── In-Flight Active-Trip Waypoint Insertion
                                     └── Online Sub-5ms Incident Recourse Router
```

---

## 🌟 Key Capabilities

1. **Deterministic Multi-Stage Compatibility Pipeline**
   - **Candidate Retrieval**: Spatial bounding-box & origin-destination corridor filtering.
   - **Two-Tier Admissible Pruning**: Calibrated Euclidean circuity lower-bounds prune **81.8%** of candidate pairs with **0 false negatives** (100% true feasible recall).
   - **8-Rule Feasibility Matrix**: Zero-tolerance checks for route direction, pickup proximity, destination proximity, departure window, detour tolerance, identity verification, vehicle verification, and seat capacity.
   - **Interpretable Ranking**: 0–100 weighted index with feature attribution radar breakdowns and L2 logistic regression ranking.

2. **Multi-Rider Batch Assignment Engine**
   - **Bipartite Compatibility Graph**: Builds scored feasible edges between rider cohorts and driver fleets.
   - **Greedy Assignment**: Priority queue heuristic respecting driver vehicle seat capacities.
   - **Auction-Swap Solver**: Iterative local-search and swap-improvement heuristic seeking objective improvement over greedy initialization.
   - **Optimal Solver**: Exact branch-and-bound optimization with suffix upper-bound pruning to establish theoretical upper bounds and compute optimality gaps.

3. **Fleet-Wide Event-Driven Rolling Dispatch & Online Recourse**
   - **In-Flight Active-Trip Insertions**: Dynamically schedules pickups into partially occupied active vehicles, slashing fleet VKT by **60.5%** (50.5 km vs 127.8 km) and median passenger wait time by **39.1%** (102.6s vs 169.0s).
   - **Online Incident Recourse**: When unexpected arterial road closures degrade static plans (40% feasibility failure), lightweight online recourse restores **100% trip feasibility** in **3.42 ms** with **76.7% objective recovery**.

4. **Interactive Modern Web Dashboard**
   - Built with **React 19 + Vite 6 + Leaflet 1.9 + Vanilla CSS**.
   - **🚀 Guided Demo**: End-to-end interactive 6-step walkthrough linking request creation to verified research evidence.
   - **🗺️ Match Playground**: Spatial corridor mapping, interactive driver inspection, and CSV export.
   - **🚐 Batch Assignment**: Greedy vs. Auction vs. Exact B&B solver benchmark with vehicle seat utilization gauges.
   - **📊 Experiment Explorer**: Filterable multi-scenario benchmark cards covering all 14 experiments.
   - **🔌 Live API Console**: Real-time HTTP connection, latency monitoring, and client-side fallback simulation.
   - **🏗️ Architecture & Theory**: Interactive system diagram and mathematical contract specifications.

---

## 📋 5-Minute Portfolio Demo Script

Follow this step-by-step walkthrough to inspect RouteMate AI:

1. **Step 1: Ingest Ride Request**
   - In the dashboard, click **🚀 Guided Demo**.
   - Select the preset `Financial District to SoMa Commute` (1 seat, peak morning rush hour).
   - Notice the passenger origin pin, destination pin, and direct corridor vector.
   - Click **Next: Filter Compatible Drivers →**.

2. **Step 2: Inspect 8-Gate Feasibility Matrix**
   - Observe how the 10 candidate drivers in the fleet are evaluated.
   - Drivers heading opposite direction or failing identity/vehicle verification are immediately rejected.
   - Click any rejected driver (e.g., `DRV-02` or `DRV-08`) to view explicit rejection reasons.
   - Click **Next: Inspect Explainable Scores →**.

3. **Step 3: Analyze Explainable Score Breakdown**
   - View the top recommended matches ranked by the L2 logistic and route-time scoring function.
   - Inspect the feature attribution bars: positive points awarded for corridor overlap and verified status; penalty points applied for detour burden.
   - Click **Next: Run Fleet Batch Assignment →**.

4. **Step 4: Solve Fleet Multi-Rider Batch Pooling**
   - Scale from a single rider to a 6-rider by 10-driver fleet batch.
   - Review the solver comparison table: Greedy (<1ms) vs Auction-Swap vs Exact Branch-and-Bound.
   - Inspect formed vehicle pools: observe seat capacity utilization (100% on dual-rider pooled cars).
   - Click **Next: Compare Dispatch Strategies →**.

5. **Step 5: Compare Rolling Dispatch Policies**
   - Compare **Static Batching (60s)** vs **Periodic Rolling (30s)** vs **Event-Driven Rolling (Instant)**.
   - Toggle policies to observe the **60.5% fleet mileage reduction** (50.5 km vs 127.8 km) and **39.1% wait time reduction** (102.6s vs 169.0s).
   - Notice the 36 in-flight active-trip insertions executed with **0 passenger cancellations or reassignments**.
   - Click **Next: View Verified Experiment Evidence →** to inspect the research citations.

---

## 📊 Summary of 14 Verified Experiments

All metrics correspond directly to reproducible experimental artifacts stored under `experiments/`:

| Experiment | Title / Focus | Benchmark Scope | Key Metric / Result | Evidence Class |
| :--- | :--- | :--- | :--- | :--- |
| **001** | Baseline Ranking | 1-to-1 synthetic corridor queries | Spatial P@3 = 38.9% → Rule-based P@3 = 42.2% | Controlled synthetic benchmark |
| **002** | Feature Ablation | Leave-one-rule-out ablation | Direction bearing removal causes 35.0% false-positive leakage | Controlled synthetic ablation |
| **003** | Perturbation Robustness | Spatial jitter (100m) & departure delta | Spatial noise <100m causes <1.5% NDCG shift; vehicle loss dominant | Controlled perturbation sweep |
| **004** | Held-Out Generalization | Cross-corridor density held-out | Heuristic generalizability validated across seeds 101, 202, 303 | Held-out validation |
| **005** | Classical ML Ranking | Supervised L2 logistic regression | ML model achieves NDCG = 0.7969 on balanced held-out test cohort | Supervised ML evaluation |
| **006** | Road Circuity Benchmark | 4x4 urban grid graph | Mean circuity 1.341x (max 3.075x); Euclidean underestimates by +0.04km | Graph routing benchmark |
| **007** | Assignment Scaling | Greedy vs Auction vs Exact B&B | Greedy gap 9.30%; heuristic runs in <0.25ms vs >4,800ms exact B&B | Combinatorial optimization |
| **008** | Road Network Validation | OSM Downtown San Francisco (26N, 53E) | Euclidean gating has **75.6% false positive rate**; top-1 inverted in 68% | Realistic road network validation |
| **009** | Hybrid Two-Tier Pruning | Calibrated circuity lower bounds | **81.8% candidate pairs pruned** with **0 false negatives** (5.49x speedup) | Two-tier spatial pruning |
| **010** | Dynamic Congestion | Time-dependent BPR congestion curves | Peak delay +119.5s (2.84x duration); feasible pairs cut by 70.6% | Traffic flow micro-simulation |
| **011** | Multi-Rider Pooling | Dynamic vehicle pooling (C=1 to 4) | C=1→2 surges matched riders by **+70.0%** (40% to 68%); exact timeout on 6x12 | Multi-rider pooling scaling |
| **012** | Dynamic Online Recourse | Incident arterial closures & dwell | Closures drop static feasibility to 60%; recourse restores **100% in 3.42ms** | Dynamic recourse replanning |
| **013** | Rolling-Horizon Dispatch | Static vs Periodic vs Event-driven | Event-driven cuts fleet VKT by **60.5%** and median wait by **39.1%** | Discrete-event fleet dispatch |
| **014** | Research Synthesis | Cross-experiment meta-analysis | Hypotheses H1, H2, H3 confirmed; RQ4, RQ5 trade-off limits established | Empirical synthesis meta-analysis |

*Notice: All experiments are evaluated in controlled synthetic and OpenStreetMap micro-simulations. Real-world validation remains subject to future physical pilot deployments.*

---

## 🚀 Quickstart & Setup Instructions

### Prerequisites
- **Python**: 3.10 or higher (`python --version`)
- **uv** (recommended) or standard `pip`
- **Node.js**: 18+ and `npm` (`node --version`)

---

### Step 1: Backend Setup & Verification

1. Create virtual environment and install package in editable mode:
   ```bash
   uv venv
   uv pip install -e .
   ```

2. Run the complete automated test suite (158 unit tests):
   ```bash
   uv run python -m unittest discover tests
   ```
   *Expected outcome: `Ran 158 tests ... OK`*

3. Launch the local JSON API server:
   ```bash
   uv run routemate-api --port 8000
   ```
   *The server starts listening on `http://127.0.0.1:8000` with CORS support.*

4. Run CLI benchmarks:
   ```bash
   # Empirical San Francisco downtown road network benchmark
   uv run python -m routemate.cli --real-city-benchmark

   # Predictive fleet repositioning & spatial rebalancing
   uv run python -m routemate.cli --repositioning-benchmark
   ```

---

### Step 2: Frontend Dashboard Setup & Launch

1. Open a new terminal and navigate to the dashboard directory:
   ```bash
   cd dashboard
   npm install
   ```

2. Run frontend linter:
   ```bash
   npx oxlint
   ```
   *Expected outcome: `Found 0 warnings and 0 errors`*

3. Start the local development server:
   ```bash
   npm run dev
   ```
   Open **[http://localhost:5173](http://localhost:5173)** in your browser.

4. Validate the production build:
   ```bash
   npm run build
   ```
   *Expected outcome: `✓ built in ~400ms` with optimized assets in `dist/`.*

---

### Step 3: One-Command Docker Setup 🐳

You can spin up both the FastAPI backend and React frontend dashboard in a single command:

```bash
docker compose up --build
```

- API server: `http://localhost:8000` (with `/health` check)
- Interactive Dashboard: `http://localhost:5173`

Continuous Integration is automated via GitHub Actions (`.github/workflows/ci.yml`) on every push and PR across Python 3.10/3.11/3.12 and Node 20.

---

## 🔌 Local API Endpoints

The local prototype API (`src/routemate/api.py`) exposes:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health check and API version status |
| `GET` | `/v1/road-benchmark` | Urban grid road circuity benchmark summary |
| `GET` | `/v1/experiments` | Metadata and metrics summary for all 14 evaluated experiments |
| `GET` | `/v1/experiments/<id>` | Detail metrics for an individual experiment (e.g. `013_rolling_dispatch`) |
| `POST` | `/v1/matches` | 1-to-N journey retrieval, 8-rule feasibility gating, and ranking |
| `POST` | `/v1/assignments` | Combinatorial batch assignment (Greedy, Auction, or Optimal) |
| `POST` | `/v1/routes` | Directed street-network shortest-path route calculation |
| `POST` | `/v1/dispatch-simulation` | Dynamic rolling-horizon dispatch simulation comparison |

---

## 📐 Mathematical Formulation

- **Haversine Great-Circle Distance**:
  $$d(p_1, p_2) = 2 R \arcsin \left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos \phi_1 \cos \phi_2 \sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$
  *(Mean volumetric Earth radius $R = 6371.0088\text{ km}$)*

- **Geometric Insertion Detour**:
  $$\text{Detour}(D, R) = \max\left(0,\, d(D_{\text{start}}, R_{\text{pickup}}) + d(R_{\text{pickup}}, D_{\text{dest}}) - d(D_{\text{start}}, D_{\text{dest}})\right)$$

- **Bureau of Public Roads (BPR) Link Travel Time**:
  $$t_e(V_e) = t_e^0 \left[1 + \alpha \left(\frac{V_e}{C_e}\right)^\beta\right]$$
  *(Standard coefficients: $\alpha = 0.15$, $\beta = 4.0$)*

- **Admissible Lower-Bound Pruning**:
  $$\text{Detour}_{\text{net}}(D, R) \ge \max\left(0,\, \frac{d(D_o, R_p) + d(R_p, R_d) + d(R_d, D_d)}{\mu_{\text{circ}}} - d_{\text{net}}(D_o, D_d)\right)$$
  *Guarantees zero false negatives ($100\%$ true feasible recall) under maximum network circuity.*

---

## 🛡️ Synthetic Benchmark & Safety Disclosure

All trajectories, commuter demands, and vehicle cohorts generated in this repository represent **controlled synthetic simulations and OpenStreetMap road graphs**. Scores indicate mathematical compatibility according to modeled heuristics and do not constitute physical guarantees of commercial driver behavior, insurance coverage, passenger acceptance, or vehicle safety.

---

## 📄 License & Research Citation

This project is released under the **MIT License**.
The complete pre-print manuscript and artifacts are located in [`research/paper/paper.md`](research/paper/paper.md) (standalone academic pre-print: [`research/paper/preprint.html`](research/paper/preprint.html)).

```bibtex
@article{bandaru2026routemate,
  title   = {RouteMate AI: Real-Time Multi-Rider Pooling, Admissible Pruning, and Event-Driven Rolling Dispatch under Road Network Congestion and Recourse},
  author  = {Bandaru, Adarsh},
  journal = {Omnirush AI Research Preprint},
  year    = {2026},
  url     = {https://github.com/Adarshbandaru/routemate-ai}
}
```
