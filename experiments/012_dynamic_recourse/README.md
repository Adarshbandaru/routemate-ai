# Experiment 012: Dynamic Curbside Dwell, Incident Congestion, and Online Rerouting/Recourse

**Evidence Class:** Controlled semi-synthetic algorithmic experiment on an OSM-derived road graph.  
**Network Fixture:** San Francisco Downtown / Financial District & SoMa Corridor (26 nodes, 53 directed edges, multi-lane arterials, one-way cross streets).  
**Congestion Model:** Time-dependent Bureau of Public Roads (BPR) function with diurnal peak curves.

---

## 1. Research Question & Motivation

Does static route planning remain reliable when subjected to **stochastic curbside dwell times** and **unexpected incident-induced link closures**, and can a **lightweight online recourse / rerouting mechanism** restore route feasibility and objective quality without prohibitive recomputation latency?

### Core Hypotheses
1. **Static Plan Fragility (H1):** Static pooled route plans planned under nominal conditions become severely degraded or impassable when unexpected traffic incidents close road links or curbside dwell delays accumulate.
2. **Online Recourse Efficacy (H2):** A lightweight online recourse router can detect downstream link blockages in real time, compute local detour bypasses and stop sequence adaptations, and restore route feasibility to 100% with negligible recomputation latency ($\le 5\text{ ms}$).
3. **Low Regret versus Clairvoyant Oracle (H3):** Online recourse achieves low regret ($\le 6.0$ points) compared to an offline clairvoyant oracle recomputed with full a priori knowledge of incident timings.

---

## 2. Mathematical & Algorithmic Formulation

### 2.1 Four Execution Horizons
To prevent confounding static intentions with actual executions, Experiment 012 explicitly distinguishes four horizons:
1. **Planned Route ($\pi_{\text{static}}$):** The initial multi-rider pooled tour computed at $t=0$ under nominal time-dependent congestion.
2. **Realized Route without Adaptation ($\pi_{\text{realized}}$):** The blind execution of $\pi_{\text{static}}$ under stochastic curbside dwell and unexpected incident closures without adaptation. If an edge on the planned path is closed, the vehicle is physically blocked ($\text{Feasible} = \text{False}, \text{Objective} = 0.0$).
3. **Online Recourse Route ($\pi_{\text{recourse}}$):** The dynamically adapted route where the vehicle monitors the path ahead, detects active incidents, triggers local time-dependent Dijkstra re-evaluations around closed/congested edges, and optionally adapts downstream stop sequences.
4. **Clairvoyant Offline Oracle ($\pi_{\text{oracle}}$):** The theoretical upper bound solved with full global a priori knowledge of incident start times, durations, and network states from $t=0$.

### 2.2 Stochastic Curbside Dwell Model
Curbside boarding and alighting times are modeled using a log-normal distribution with deterministic seeds:
$$\text{Dwell} \sim \text{Lognormal}(\mu, \sigma), \quad \text{clamped to } [5.0\text{ s}, 3\mu]$$
- **Boarding (Pickup):** $\mu = 60.0\text{ s}, \text{CV} = 0.35$ (range: $[5.0\text{ s}, 180.0\text{ s}]$)
- **Alighting (Dropoff):** $\mu = 25.0\text{ s}, \text{CV} = 0.35$ (range: $[5.0\text{ s}, 75.0\text{ s}]$)

### 2.3 Dynamic Link Incident Model
Incidents occur on directed network edges $(u, v)$ over a time window $[t_{\text{start}}, t_{\text{start}} + \Delta t)$:
- **Partial Capacity Degradation:** Edge capacity drops by factor $\gamma \in (0, 1)$, inflating traversal time by $(1 + 8\gamma)$.
- **Full Link Closure:** Edge is strictly impassable ($\text{cost} = \infty$). Vehicles attempting blind traversal get blocked.

### 2.4 Objective Score & Recovery Definitions
For any executed trip (static or recourse), detour is evaluated relative to the driver's direct baseline route:
$$\text{Objective} = 40.0 \cdot \frac{K_{\text{matched}}}{C} + 30.0 \cdot \max\left(0, 1 - \frac{\Delta t_{\text{detour}}}{\Delta t_{\max}}\right) + 15.0 \cdot \max\left(0, 1 - \frac{\bar{t}_{\text{rider}}}{1.5 \Delta t_{\max}}\right) + 15.0 \cdot \max\left(0, 1 - \frac{\Delta d_{\text{detour}}}{\Delta d_{\max}}\right)$$

**Objective Recovery Percentage ($\text{Recov\%}$):**
- For trips where unadapted static execution failed ($\text{realized\_feasible} == \text{False}, S_{\text{realized}} = 0.0$):
  $$\text{Recovery} = \min\left(100.0\%, \frac{S_{\text{recourse}}}{S_{\text{nominal}}} \times 100\%\right)$$
- For trips where unadapted static execution was degraded ($S_{\text{nominal}} - S_{\text{realized}} > 1.0$):
  $$\text{Recovery} = \min\left(100.0\%, \max\left(0.0\%, \frac{S_{\text{recourse}} - S_{\text{realized}}}{S_{\text{nominal}} - S_{\text{realized}}} \times 100\%\right)\right)$$
- If $S_{\text{nominal}} - S_{\text{realized}} \le 1.0$ or for unperturbed/static conditions: strictly `null`.

**Regret versus Clairvoyant Oracle ($\text{Regret}$):**
$$\text{Regret} = \max\left(0.0, S_{\text{oracle}} - S_{\text{executed}}\right)$$
*(Reported as `null` when no perturbation or oracle is applicable).*

---

## 3. Experimental Design

### 3.1 Six Core Operating Conditions (Seed 42, Moderate Incident)
1. `1_static_nominal`: Static plan, no perturbations (free-flow/nominal BPR).
2. `2_static_dwell`: Static plan subjected to stochastic curbside dwell times.
3. `3_static_incident`: Static plan encountering unexpected incident link closure without recourse.
4. `4_static_dwell_incident`: Static plan encountering both dwell and incident closure without recourse (unadapted execution).
5. `5_recourse_incident`: Online recourse active after incident closure, no dwell.
6. `6_recourse_dwell_incident`: Online recourse active under both dwell and incident closure.

### 3.2 Severity Sweep
- **Mild:** 65% capacity reduction on Market St eastbound (`market_2nd -> market_1st`).
- **Moderate:** Full closure of Market St eastbound (`market_2nd -> market_1st`) + 45% capacity reduction on Mission St eastbound (`mission_2nd -> mission_1st`).
- **Severe:** Full closure of both Market St eastbound (`market_2nd -> market_1st`) and Mission St eastbound (`mission_2nd -> mission_1st`), forcing vehicles south to Howard St corridor.

---

## 4. Empirical Results

### 4.1 Core Operating Conditions Summary (10 Pooled Trips, 20 Riders)

| Condition | Policy | Perturbation | Exec Feas | Exec Obj | Detour (km) | Duration (s) | Reroute% | Mean Recovery% | Regret vs Oracle | Latency (ms) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `1_static_nominal` | Static | None | 100.0% | 86.60 | 2.259 km | 324 s | 0.0% | N/A | `null`* | N/A |
| `2_static_dwell` | Static | Dwell | 100.0% | 82.61 | 2.259 km | 484 s | 0.0% | N/A | `null`* | N/A |
| `3_static_incident` | Static | Incident | 60.0% | 52.23 | 1.307 km | 218 s | 0.0% | N/A | 33.43 | N/A |
| `4_static_dwell_incident` | Static | Dwell+Incident | 60.0% | 49.80 | 1.307 km | 351 s | 0.0% | N/A | 35.86 | N/A |
| `5_recourse_incident` | Recourse | Incident | 100.0% | 84.61 | 2.569 km | 362 s | 50.0% | 76.7% | 1.06 | 3.51 ms |
| `6_recourse_dwell_incident` | Recourse | Dwell+Incident | 100.0% | 80.24 | 2.569 km | 538 s | 50.0% | 37.6% | 5.42 | 3.42 ms |

*\*Strict zero-sentinel compliance: under non-incident conditions where an incident oracle is inapplicable, regret and oracle objective are explicitly set to `null` (`None`), never `0.0`.*

### 4.2 Severity Sweep Analysis (Full Dwell + Incident)

| Severity Tier | Blocked Corridors | Unadapted Feasibility | Recourse Feasibility | Feasibility Boost | Mean Recovery% |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Mild** | 0 full closures (speed drops only) | 100.0% | 100.0% | +0.0% | 19.3% |
| **Moderate** | Market St closed (bypasses via Mission) | 60.0% | 100.0% | **+40.0%** | **37.6%** |
| **Severe** | Market & Mission closed (bypasses via Howard) | 50.0% | 100.0% | **+50.0%** | **46.8%** |

### 4.3 Seed Stability Sweep (Moderate Severity — Independent Cohorts & Stochastic Realizations)

| Seed | Planned Trips | Unadapted Feas | Recourse Feas | Feasibility Boost | Static Obj | Recourse Obj | Objective Recovery% | Mean Latency |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `seed_42` | 10 | 60.0% | 100.0% | **+40.0%** | 49.80 | 80.24 | 37.6% | 3.43 ms |
| `seed_101` | 10 | 70.0% | 100.0% | **+30.0%** | 56.72 | 81.31 | 37.6% | 3.39 ms |
| `seed_2024` | 10 | 70.0% | 100.0% | **+30.0%** | 57.12 | 80.18 | 28.8% | 3.28 ms |

*Scientific Interpretation of Seed Variation:*
1. **Independent Cohort Generation:** Varying the random seed parameter produces completely distinct commuter demand realizations across the road network (verified via distinct driver and rider origin/destination coordinate hashes).
2. **Topological Exposure:** In `seed_42`, 4 out of 10 planned trips traverse the congested Market St corridor, resulting in a 40% unadapted failure rate (60% static feasibility). In `seed_101` and `seed_2024`, 3 out of 10 planned trips traverse the closed arterial link, resulting in a 30% failure rate (70% static feasibility).
3. **Consistently Robust Recourse:** Across all 3 independent cohorts and distinct stochastic dwell samples, online recourse reliably restores feasibility to **100.0%** with low sub-4ms computational overhead.

---

## 5. Key Findings & Supported Hypotheses

1. **Hypothesis H1 Confirmed:** Static plans are fragile under link closures. In moderate incidents, 40.0% of pooled trips fail because vehicles blindly attempt to traverse closed links (feasibility drops to 60.0%, mean score falls to 49.80). In severe incidents, unadapted feasibility drops to 50.0%.
2. **Hypothesis H2 Confirmed:** Online recourse completely restores feasibility to **100.0%** across all tested incident severities and random seeds. Mean recourse latency is **3.42 ms – 3.51 ms**, evaluating detour bypasses and sequence swaps in real time.
3. **Hypothesis H3 Confirmed:** Relative to the clairvoyant offline oracle with full incident foresight:
   - The unadapted static plan suffers massive regret (**33.43 – 35.86 points**) due to catastrophic link blockages.
   - Online recourse limits regret to **1.06 points** under incidents alone, and **5.42 points** under cumulative dwell and incident perturbations.
4. **Curbside Dwell Impact:** Stochastic dwell increases trip duration by an average of 49.4% (from 324s to 484s for pooled trips with 4 stops), reducing objective scores from 86.60 to 82.61 without inducing feasibility failures under calibrated detour thresholds.

---

## 6. Scientific Integrity & Limitations

- **Semi-Synthetic Bounded Fixture:** Results are derived from a 26-node, 53-edge Downtown SF network fixture. While topology, one-way rules, and BPR parameters mirror real urban roads, these results demonstrate algorithmic capability, not live real-world traffic guarantees.
- **Oracle Independence & Bounded Scope:** The offline oracle here recomputes greedy insertions with perfect incident foresight on the assigned driver-rider cohort. A global fleet-level clairvoyant oracle that re-assigns the entire rider pool may achieve different fleet-wide trade-offs.
- **Zero-Sentinel Enforcement:** `0.0` is strictly avoided as an indicator of missing or inapplicable values. When an optimum or metric is indeterminate (e.g. oracle under nominal conditions), `null` is explicitly reported.
