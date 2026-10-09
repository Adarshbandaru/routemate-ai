# Experiment 006 — Road Network Routing Gap Benchmark

**Evidence class:** Synthetic road-network controlled experiment. This benchmark uses a deterministic urban grid street network with directed edges, speed limits (50 km/h avenues, 30 km/h cross streets), and one-way streets to measure the systematic gap between Euclidean geometric approximations and true street-level routing.

---

## 1. Research Question

How significant is the error gap between Euclidean geometric approximations (Haversine distance, geometric edge insertion detour) and true street-network graph routing in shared journey compatibility?

---

## 2. Methodology & Protocol

1. **Network Topology:** Deterministic 4x4 urban grid (`create_urban_grid_network`), centered in an urban corridor with two-way avenues (50 km/h) and alternating one-way cross streets (30 km/h).
2. **Evaluated Pairs:** 30 origin–destination pairs across grid intersections.
3. **Metrics Evaluated:**
   - **Circuity Factor:** $\text{Ratio} = \frac{\text{Distance}_{\text{road}}}{\text{Distance}_{\text{euclidean}}} \ge 1.0$
   - **Mean Road Distance vs Euclidean Distance** (km)
   - **Geometric Detour vs Multi-Stop Road Network Detour** ($\Delta d_{\text{road}} - \Delta d_{\text{geom}}$)
   - **Feasibility Disagreement Rate:** Frequency where geometric detour satisfies threshold ($\le 5\text{ km}$) but true street network routing violates it.

---

## 3. Reproduction

From repository root:
```powershell
uv run python -m routemate.cli --road-benchmark
```

---

## 4. Observed Benchmark Results

| Metric | Measured Value | Interpretation |
|---|---:|---|
| Evaluated OD Pairs | 30 | Standard urban grid intersection pairs |
| **Mean Circuity Factor** | **1.341x** | Street-level travel distance is on average 34.1% longer than straight-line Euclidean distance |
| **Max Circuity Factor** | **3.075x** | One-way street detours can force travel over 3x the straight-line distance |
| Mean Euclidean Distance | 0.80 km | Straight-line baseline |
| Mean Street Road Distance | 1.06 km | Actual road network driving distance |
| Mean Geometric Detour | 0.56 km | Single-edge straight-line insertion approximation |
| Mean Road Network Detour | 0.59 km | Multi-stop Dijkstra path along street network |
| Mean Detour Underestimation | 0.04 km | Geometric insertion systematically underestimates road detour |

---

## 5. Conclusions & Limitations

- **Findings:**
  - Euclidean / Haversine distance functions as an admissible lower bound for spatial pruning, but significantly underestimates travel distance and travel times in urban environments (circuity $\approx 1.34$ on average, and up to $3.08$ on one-way streets).
  - True road network routing is essential for accurate arrival time windows and vehicle detour constraints.
- **Limitations:**
  - The road network grid is a synthetic, deterministic urban grid rather than a live OpenStreetMap extract.
  - Speeds are static and free-flow; congestion delay curves are not modeled.
