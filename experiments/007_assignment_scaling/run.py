"""Experiment 007 execution script: Multi-Rider Assignment Optimality and Scaling.

Runs the comparative benchmark across scale points (5x3, 10x5, 20x10, 30x15, 40x20)
comparing Greedy, Auction-Swap, and Exact Branch-and-Bound.
Saves reproducible artifacts in outputs/.
"""
import hashlib
import json
from pathlib import Path
import platform
import sys
from time import perf_counter

from routemate.assignment_scaling import (
    DEFAULT_SCALE_CONFIGS,
    DEFAULT_SEEDS,
    run_assignment_scaling_experiment,
    save_experiment_outputs,
)


def main():
    print("=" * 80)
    print("  EXPERIMENT 007: MULTI-RIDER ASSIGNMENT OPTIMALITY AND SCALING")
    print("=" * 80)
    print(f"  Scales Evaluated:  {', '.join(s[0] for s in DEFAULT_SCALE_CONFIGS)}")
    print(f"  Fixed Seeds:       {DEFAULT_SEEDS}")
    print(f"  Python Version:    {platform.python_version()} on {platform.system()} {platform.machine()}")
    print("-" * 80)
    print("  Executing benchmark across scale cohorts...")

    started = perf_counter()
    report = run_assignment_scaling_experiment()
    elapsed = perf_counter() - started

    print(f"  Benchmark complete in {elapsed:.2f}s ({report.total_evaluations} instances evaluated).\n")

    output_dir = Path(__file__).resolve().parent / "outputs"
    saved = save_experiment_outputs(report, output_dir)

    # Write manifest.json
    manifest = {
        "experiment": "007_assignment_scaling",
        "description": "Multi-Rider Assignment Optimality and Scaling Benchmark",
        "timestamp_utc": report.scale_points[0].greedy.method,
        "platform": {
            "python": platform.python_version(),
            "os": platform.system(),
            "machine": platform.machine(),
        },
        "seeds": list(DEFAULT_SEEDS),
        "scale_configs": [list(c) for c in DEFAULT_SCALE_CONFIGS],
        "total_evaluations": report.total_evaluations,
        "overall_greedy_mean_gap_pct": report.overall_greedy_mean_gap_pct,
        "overall_auction_mean_gap_pct": report.overall_auction_mean_gap_pct,
    }
    with open(output_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    # Print Formatted Results Table
    print("=" * 80)
    print(f"{'Scale':<14} | {'Edges':<7} | {'Greedy Obj (Gap%)':<19} | {'Auction Obj (Gap%)':<19} | {'Optimal Obj':<12} | {'Nodes':<6}")
    print("-" * 80)
    for a in report.aggregates:
        g_str = f"{a.greedy_mean_objective:.1f} ({a.greedy_mean_gap_pct:.1f}%)"
        auc_str = f"{a.auction_mean_objective:.1f} ({a.auction_mean_gap_pct:.1f}%)"
        opt_str = f"{a.optimal_mean_objective:.1f}"
        nodes_str = f"{a.optimal_mean_nodes_explored:.0f}"
        print(f"{a.scale_name:<14} | {a.mean_feasible_edges:<7.1f} | {g_str:<19} | {auc_str:<19} | {opt_str:<12} | {nodes_str:<6}")

    print("=" * 80)
    print("SOLVER RUNTIMES (mean milliseconds):")
    print(f"{'Scale':<14} | {'Greedy (ms)':<14} | {'Auction (ms)':<14} | {'Optimal B&B (ms)':<18}")
    print("-" * 80)
    for a in report.aggregates:
        print(f"{a.scale_name:<14} | {a.greedy_mean_runtime_ms:<14.3f} | {a.auction_mean_runtime_ms:<14.3f} | {a.optimal_mean_runtime_ms:<18.3f}")

    print("-" * 80)
    print(f"Overall Greedy Optimality Gap:   {report.overall_greedy_mean_gap_pct:.2f}%")
    print(f"Overall Auction Optimality Gap:  {report.overall_auction_mean_gap_pct:.2f}%")
    print(f"Outputs written to: {output_dir}")
    print("=" * 80)


if __name__ == "__main__":
    main()
