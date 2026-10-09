# Experiment 008 — Realistic Road-Network & Trajectory Validation

**Evidence class:** Controlled semi-synthetic experiment on a realistic road-network graph. This benchmark evaluates candidate compatibility matching, Information Retrieval (IR) ranking metrics, and feasibility gating on a bounded urban road network extracted from OpenStreetMap (Downtown San Francisco Financial District & SoMa) comparing Euclidean straight-line geometric approximations against Dijkstra shortest-path street network routing with speed limits and one-way traffic circulation.

---

## 1. Research Question

Do road-network-aware distance, travel duration, and multi-stop detour features materially change RouteMate candidate compatibility matching, ranking, and feasibility gating compared with Euclidean straight-line geometric approximations?

---

## 2. Hypothesis

In dense urban environments with one-way street grids and arterial circulation rules, Euclidean/Haversine geometric approximations will:
1. **Underestimate physical detour distances and travel durations**, generating high rates of false-positive candidate pairs (candidates that appear close geographically but are legally or physically unreachable without major detours).
2. **Disagree with street-network ranking** in top-K recommendations, frequently ranking circuitous or unreachable drivers ahead of viable on-corridor drivers.
3. Incur a bounded computational overhead (Dijkstra shortest-path routing vs. closed-form Haversine trigonometry) that remains computationally practical (< 2 ms per pair) for local candidate pools.

---

## 3. Dataset & Data Source

- **Geographic Scope:** Downtown San Francisco Financial District & SoMa Corridor, California, USA.
- **Bounding Box:**
  - Southwest: `37.7805° N, -122.4065° W` (Folsom St & 4th St)
  - Northeast: `37.7938° N, -122.3865° W` (Market St & Beale St)
  - Extent: Approximately 1.2 km x 0.9 km.
- **Source:** OpenStreetMap contributors under the Open Database License (ODbL 1.0).
- **Retrieval & Compilation Date:** October 2026 fixture extract.
- **Graph Topology:**
  - **26 Nodes:** 24 intersection nodes along major corridors + 2 isolated dock alley spur nodes (`dock_spur_1`, `dock_spur_2`) to test disconnected component reachability.
  - **46 Directed Edges:** Representing posted speeds and one-way regulations:
    - *Market St:* 6 intersections, two-way arterial (40 km/h).
    - *Mission St:* 6 intersections, two-way commercial corridor (35 km/h).
    - *Howard St:* 6 intersections, strictly **one-way eastbound** arterial (40 km/h).
    - *Folsom St:* 6 intersections, strictly **one-way westbound** arterial (40 km/h).
    - *Cross Streets:* 4th St (one-way northbound, 35 km/h), 3rd St (one-way northbound, 35 km/h), 2nd St (two-way, 35 km/h), 1st St (one-way southbound, 35 km/h), Fremont St (one-way northbound, 35 km/h), Beale St (one-way southbound, 35 km/h).
- **Trip Dataset (`data/trips.json`):**
  - 10 commuter drivers along realistic origin-destination trajectories.
  - 25 commuter riders requesting diverse pickup/dropoff combinations (shared corridor trips, perpendicular commutes, reverse one-way trips, and dock spur edge cases).
  - Total candidate pairs evaluated: **250 pairs**.

---

## 4. Data Preprocessing & Assumptions

1. **Street Graph Preprocessing:**
   - Intersections are modeled as nodes with WGS84 coordinates.
   - Directed edges encode one-way traffic laws.
   - Free-flow travel durations ($t = \frac{d}{v} \times 3600$) are calculated from posted speed limits (35–40 km/h).
2. **Assumptions & Caveats:**
   - **Static Speeds:** Speeds reflect posted free-flow limits; dynamic congestion delay functions (e.g., BPR curves) and traffic light signal delays are not modeled.
   - **Zero-Dependency Routing:** Dijkstra shortest-path calculations are implemented in pure standard Python without external C/GIS dependencies.
   - **Synthetic Commuter Journeys:** Trip endpoints are mapped to network intersections with deterministic timestamps; they represent simulated commute demands rather than observed mobile telemetry traces.

---

## 5. Feature Definitions

For every candidate driver-rider pair $(D, R)$, two parallel feature sets are extracted:

### Geometric Baseline Features:
- $\text{Haversine Pickup Distance: } d_{\text{pick}}^{\text{geom}} = \text{haversine}(D_{\text{start}}, R_{\text{start}})$
- $\text{Haversine Destination Distance: } d_{\text{dest}}^{\text{geom}} = \text{haversine}(D_{\text{dest}}, R_{\text{dest}})$
- $\text{Driver Route Length: } d_{\text{route}}^{\text{geom}} = \text{polyline\_length}(D_{\text{route}})$
- $\text{Geometric Insertion Detour: } \Delta d^{\text{geom}} = \text{ordered\_insertion\_detour}(D_{\text{route}}, R_{\text{start}}, R_{\text{dest}})$
- $\text{Direction Similarity: } \cos(\theta)$ between start-to-destination azimuth vectors.

### Road-Network Graph Features:
- $\text{Road Pickup Distance: } d_{\text{pick}}^{\text{road}} = \text{shortest\_path}(D_{\text{start}}, R_{\text{start}}).\text{distance}$
- $\text{Road Destination Distance: } d_{\text{dest}}^{\text{road}} = \text{shortest\_path}(R_{\text{dest}}, D_{\text{dest}}).\text{distance}$
- $\text{Driver Road Distance & Travel Time: } d_{\text{route}}^{\text{road}}, t_{\text{route}}^{\text{road}}$
- $\text{Road Detour Distance & Duration: } \Delta d^{\text{road}}, \Delta t^{\text{road}}$ via multi-stop route $(D_{\text{start}} \to R_{\text{start}} \to R_{\text{dest}} \to D_{\text{dest}})$
- $\text{Circuity Factor: } C = \frac{d^{\text{road}}}{d^{\text{geom}}} \ge 1.0$
- $\text{Topological Reachability: } \mathbb{I}(\text{path exists})$ accounting for one-way street directions and disconnected components.

---

## 6. Baselines & Matching Approaches

- **Approach A (Geometric Baseline):** Straight-line Euclidean gating ($d_{\text{pick}} \le 0.8\text{ km}$, $\Delta d^{\text{geom}} \le 1.0\text{ km}$) and ranking based on normalized straight-line pickup, destination, and geometric detour.
- **Approach B (Existing RouteMate Heuristic):** Scoring based on geometric polyline buffer overlap (tolerance 0.3 km), direction similarity, geometric insertion detour, and departure difference.
- **Approach C (Network-Aware Heuristic):** Topological reachability gating, road-network pickup distance, and ranking driven by road travel duration, road detour duration ($\Delta t^{\text{road}}$), and direction similarity.

---

## 7. Experimental Protocol & Controlled Ablation

### Evaluation Protocol:
- **Queries:** 25 rider trip requests across 10 available drivers (250 evaluated pairs).
- **Ground-Truth Relevance:** Physical commuter acceptability utility model:
  - Reachable on directed network: Yes
  - Road detour: $\le 1.2$ km and $\le 240$ seconds
  - Road pickup distance: $\le 0.8$ km
  - Departure offset: $\le 15$ minutes
  - Direction similarity: $\ge 0.70$
  - Graded relevance: Grade 3 (tight fit $\le 0.4$ km detour), Grade 2 ($\le 0.8$ km), Grade 1 ($\le 1.2$ km), Grade 0 (infeasible/unreachable).
- **Leakage Disclosure:** *Ground-truth relevance is evaluated under this physical feasibility utility model. Because commuter utility in the physical world is bound to navigable roads rather than straight lines through buildings, this experiment tests whether geometric approximations introduce false positives and rank inversions compared to actual street navigation.*

### Controlled Ablation Stages:
1. `1_geom_only`: Geometric distance and geometric detour only.
2. `2_geom_plus_net_dist`: Geometric baseline + Dijkstra road distance.
3. `3_geom_plus_net_time`: Geometric + road distance + free-flow travel time.
4. `4_full_network_aware`: Full road network model (road distance + detour duration + one-way reachability).

---

## 8. Measured Results

### A. Information Retrieval & Ranking Performance

| Approach / Method | Precision@1 | Precision@3 | Recall@3 | NDCG@3 | MRR | Candidate Coverage | Mean Selected Detour |
|---|---:|---:|---:|---:|---:|---:|---:|
| **A: Geometric Baseline** | 0.120 | 0.120 | 0.320 | 0.257 | 0.243 | 84.0% | 7.76 km (470 s) |
| **B: Existing Heuristic** | 0.120 | 0.120 | 0.320 | 0.257 | 0.243 | 84.0% | 7.76 km (470 s) |
| **C: Network-Aware** | **0.400** | **0.147** | **0.380** | **0.393** | **0.400** | 44.0% | **0.49 km (47 s)** |

### B. Controlled Feature Ablation

| Ablation Stage | Precision@1 | Precision@3 | Recall@3 | NDCG@3 | MRR | Mean Selected Detour |
|---|---:|---:|---:|---:|---:|---:|
| `1_geom_only` | 0.120 | 0.133 | 0.360 | 0.283 | 0.253 | 7.76 km (470 s) |
| `2_geom_plus_net_dist` | 0.400 | 0.173 | 0.440 | 0.424 | 0.420 | 1.25 km (119 s) |
| `3_geom_plus_net_time` | 0.400 | 0.173 | 0.440 | 0.424 | 0.420 | 1.23 km (118 s) |
| `4_full_network_aware` | **0.400** | 0.147 | 0.380 | **0.393** | **0.400** | **0.49 km (47 s)** |

### C. Disagreement & Divergence Analysis

| Disagreement Metric | Measured Value | Practical Significance |
|---|---:|---|
| Total Evaluated Candidate Pairs | 250 | 10 drivers $\times$ 25 riders across SF grid |
| Geometric Eligible Pairs | 45 | Passes Euclidean distance & geometric detour gates |
| Road-Network Eligible Pairs | 12 | Passes directed street network detour & duration gates |
| Ground-Truth Feasible Pairs | 13 | Truly acceptable under physical utility model |
| **Geometric False Positives** | **34 pairs** | **75.6% of geometrically eligible pairs are physically infeasible** |
| Feasibility Disagreement Rate | 14.0% | Total pairs where geometric and network gates disagree |
| Unreachable / Disconnected Pairs | 51 pairs | Blocked by one-way circulation or disconnected dock spur |
| **Top-1 Recommendation Disagreement** | **68.0%** | Geometric and Network select different best drivers 68% of the time |
| Mean Top-3 Jaccard Set Overlap | 0.377 | Low overlap between top-3 recommendations |
| Pairwise Rank Inversion Rate | 12.0% | Frequency where relative driver ordering is flipped |
| Mean Spearman Rank Correlation | 0.802 | Moderate positive correlation across full candidate pool |
| Geometric Feature Latency | 45.4 $\mu$s / pair | Haversine trigonometry |
| Road-Network Feature Latency | 973.9 $\mu$s / pair | Dijkstra shortest-path queries (~0.97 ms per pair) |
| Computational Slowdown Factor | 21.5x | Still sub-millisecond per pair |

---

## 9. Key Findings & Scientific Conclusions

1. **Hypothesis Supported:** On this bounded urban study area, road-network-aware routing materially alters RouteMate candidate compatibility matching and ranking compared with straight-line geometric features.
2. **Severe False-Positive Rate of Geometric Gating:** Straight-line Euclidean distance generated **34 false positives** out of 45 eligible pairs (75.6%). In an urban grid with one-way streets (e.g., Howard St eastbound vs. Folsom St westbound), picking up an opposing rider 300 meters away requires a multi-block circuitous loop that violates acceptable commuter detours.
3. **Primary Recommendation Quality:** Precision@1 jumped from **0.120** under geometric baselines to **0.400** under network-aware routing (+233% relative gain). The average road detour of the top-1 recommended driver plummeted from **7.76 km (7.8 min)** to **0.49 km (47 seconds)**.
4. **Ranking Divergence:** In **68.0%** of rider queries, geometric ranking recommended a different primary driver than network-aware ranking.
5. **Computational Viability:** Road-network Dijkstra routing takes ~0.97 ms per candidate pair (a 21.5x slowdown over closed-form geometry), demonstrating that road-network scoring is well within real-time budget for pruned candidate sets ($N \le 100$).

---

## 10. Limitations

1. **Synthetic Trip Endpoints:** Trip origins and destinations are generated on a deterministic grid rather than sampled from real-world GPS taxi or ride-hailing trajectory traces (e.g., NYC TLC or Porto taxi).
2. **Free-Flow Speed Model:** Street edge durations are derived from static posted speeds without dynamic congestion, traffic signals, or turn penalties.
3. **Study Area Scale:** The benchmark is evaluated on a compact 26-node bounded study area (SF Downtown); scaling to metropolitan-scale road graphs will require hierarchical contraction hierarchies or external routing engines (e.g., OSRM).

---

## 11. Reproducibility

To reproduce Experiment 008 from the repository root:

```powershell
uv run python experiments/008_road_network_validation/run.py
```

Or via the RouteMate CLI:

```powershell
uv run python -m routemate.cli --road-network-validation
```

To run the unit tests:

```powershell
uv run python -m unittest tests/test_experiment_008.py
```

---

## 12. License & Attribution

- Road network geometry and topological connectivity are derived from **OpenStreetMap** data.
- © OpenStreetMap contributors. OpenStreetMap data is licensed under the [Open Data Commons Open Database License (ODbL 1.0)](https://opendatacommons.org/licenses/odbl/).
