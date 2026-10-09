# RouteMate AI: Research Paper & Artifacts Directory

This directory contains the complete academic research paper draft, publication-grade figures, LaTeX/Markdown tables, and reproducible artifact generation scripts for **RouteMate AI**.

## Directory Structure

```
research/paper/
├── README.md                          <- Directory index and replication instructions
├── paper.md                           <- Complete publication-ready research paper draft
├── generate_paper_artifacts.py        <- Fully reproducible script generating tables & figures
├── figures/                           <- Publication-quality vector SVG figures
│   ├── fig1_system_architecture.svg   <- End-to-end multi-stage dispatch pipeline
│   ├── fig2_pruning_frontier.svg      <- Candidate pruning Pareto frontier (% pruned vs recall)
│   ├── fig3_pooling_capacity.svg      <- Multi-rider capacity scaling (fulfillment vs detour)
│   ├── fig4_recourse_recovery.svg     <- Dynamic recourse & incident recovery across 6 conditions
│   ├── fig5_dispatch_tradeoffs.svg    <- Rolling dispatch vs static batching (VKT & wait times)
│   └── fig6_circuity_asymmetry.svg    <- Street network circuity & Euclidean gating failure
└── tables/                            <- Publication tables in Markdown and LaTeX format
    ├── table1_cross_experiment_matrix.md / .tex   <- Synthesis matrix across Experiments 001-013
    ├── table2_pruning_methods.md / .tex           <- Two-tier candidate pruning metrics (Exp 009)
    ├── table3_capacity_scaling.md / .tex          <- Vehicle capacity scaling C=1..4 (Exp 011)
    ├── table4_recourse_outcomes.md / .tex         <- Dynamic recourse outcomes under incidents (Exp 012)
    ├── table5_rolling_dispatch.md / .tex          <- Fleet-wide rolling dispatch performance (Exp 013)
    └── table6_architectural_tradeoffs.md / .tex   <- Eight-dimensional trade-off synthesis (Exp 014)
```

---

## Reproducing Figures and Tables

All figures and tables are deterministically generated directly from the verified experiment outputs in `experiments/*/outputs/`:

```powershell
uv run python research/paper/generate_paper_artifacts.py
```

This script parses `results.json` and `manifest.json` from Experiments 001–014 to synthesize all tables and vector SVG diagrams without external visualization dependencies.

---

## Paper Outline & Key Findings

1. **Abstract:** Multi-objective dispatch framework balancing computational scalability with physical road-network realism, dynamic travel delays, curbside dwell variability, and passenger ride quality.
2. **Introduction & Motivation:** The failure modes of traditional straight-line Euclidean distance approximations and periodic batching epochs in dense urban grids.
3. **Research Questions & Pre-Registered Hypotheses:** Formalization and verification of H1 (pooling gain), H2 (congestion sensitivity), H3 (compute-quality Pareto frontier), RQ4 (spatial disparity), and RQ5 (explainability).
4. **Related Work:** DARP formulations, shareability graphs, Contraction Hierarchies, admissible A* search, and stochastic recourse.
5. **System Architecture & Methodology:** Mathematical definitions of the 8-rule feasibility matrix, two-tier admissible lower-bound pruning, BPR volume-delay curves, greedy insertion tours, online recourse, and the discrete-event rolling simulator.
6. **Experimental Setup & Benchmark Environments:** Grounding in synthetic corridors, directed Manhattan grids, OpenStreetMap Downtown San Francisco graphs, and discrete-event simulation scenarios. Clearly distinguishes synthetic evaluation from real-world operations.
7. **Empirical Results:**
   - *Euclidean Gating Failure (Exp 008):* 75.6% false-positive rate and 68.0% top-1 rank disagreement on real OSM graphs.
   - *Admissible Pruning (Exp 009):* 81.8% of Dijkstra calls pruned with 0 false negatives (100% recall) and 5.49x speedup.
   - *Capacity Pooling (Exp 011):* Expanding capacity from C=1 to C=2 yields a +70.0% surge in matched riders with an average detour of 2.93 km (5.5 min).
   - *Online Recourse (Exp 012):* Restores feasibility from 50–60% back to 100% under arterial link closures in 3.42 ms.
   - *Rolling Dispatch (Exp 013):* Event-driven rolling dispatch with active-trip waypoint insertions slashes fleet VKT by 60.5% (50.5 km vs 127.8 km) and median passenger wait times by 39.1% (103s vs 169s) relative to static batching.
8. **Cross-Experiment Synthesis & Trade-Off Analysis:** Deep dive into the 8 core architectural decision dimensions.
9. **Threats to Validity & Limitations:** Explicit documentation of construct, internal, and external validity, synthetic assumptions, and reproducibility guarantees.
10. **Discussion & Production Blueprint:** Recommended guidelines for engineering production microtransit dispatchers.
11. **Conclusion & Future Directions:** Scaling to metropolitan micro-simulation (SUMO), anticipatory vehicle relocation via reinforcement learning, and econometric passenger choice modeling.
