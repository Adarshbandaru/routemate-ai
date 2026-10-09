"""Runner script for Experiment 009: Hybrid Two-Tier Candidate Pruning & Road-Network Gating.

Usage:
    uv run python experiments/009_hybrid_pruning/run.py
"""
import json
from pathlib import Path
import sys

# Ensure repository root is in sys.path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "src"))

from routemate.hybrid_pruning import (
    run_experiment_009,
    save_experiment_009_outputs,
)
from routemate.routing import create_osm_sf_downtown_network


def main() -> None:
    exp_dir = Path(__file__).resolve().parent
    output_dir = exp_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 85)
    print("  ROUTEMATE EXPERIMENT 009: HYBRID TWO-TIER PRUNING & ROAD-NETWORK GATING")
    print("=" * 85)
    print("Study Area: San Francisco Downtown / Financial District & SoMa Corridor")
    print("Objective:  Test if admissible Euclidean lower-bound filtering (Tier 1) safely prunes")
    print("            candidate pairs before expensive Dijkstra road routing (Tier 2).")
    print("-" * 85)

    network = create_osm_sf_downtown_network()

    print("\n[1/3] Executing calibration split & Tier 2 ground-truth evaluations...")
    report = run_experiment_009(network=network, seed_calibration=42, seed_evaluation=101)

    print("\n[2/3] Saving experiment outputs...")
    results_p, metrics_p, manifest_p = save_experiment_009_outputs(report, output_dir)
    print(f"  -> {results_p}")
    print(f"  -> {metrics_p}")
    print(f"  -> {manifest_p}")

    print("\n" + "=" * 85)
    print("  CALIBRATION SPLIT STATISTICS (Zero Leakage: Derived Exclusively from Calib Split)")
    print("=" * 85)
    cs = report.calibration_stats
    print(f"Calibration Samples: {cs.sample_pairs_count} pairs | Mean Circuity: {cs.mean_circuity:.3f}x")
    print(f"P95 Circuity: {cs.p95_circuity:.3f}x | Max Circuity: {cs.max_circuity:.3f}x | Min Circuity: {cs.min_circuity:.3f}x")

    print("\n" + "=" * 85)
    print("  PRUNER COMPARISON: PARETO TRADE-OFF (EVALUATION SET: 450 PAIRS)")
    print("=" * 85)
    print(f"{'Pruning Method':<26} | {'Routed':<6} | {'% Pruned':<8} | {'Recall':<6} | {'FN':<3} | {'Latency':<8} | {'Speedup':<7} | {'Top-1 Agr':<9}")
    print("-" * 85)
    for name, m in report.pruning_comparisons.items():
        admissible_flag = " *" if m.is_provably_admissible else ""
        disp_name = f"{name}{admissible_flag}"
        print(f"{disp_name:<26} | {m.pairs_sent_to_routing:<6} | {m.percentage_pruned:<7.1f}% | {m.feasible_recall:<6.3f} | {m.feasible_pairs_pruned_false_negatives:<3} | {m.total_pipeline_time_ms:<6.1f}ms | {m.speedup_factor:<6.2f}x | {m.top1_agreement_rate * 100:<8.1f}%")
    print("(* = Provably Admissible Lower Bound: mathematically guaranteed False Negatives == 0)")

    print("\n" + "=" * 85)
    print("  AGGRESSIVENESS PROFILE TRADE-OFFS (ADMISSIBLE LOWER-BOUND PRUNER)")
    print("=" * 85)
    print(f"{'Profile':<16} | {'Routed':<6} | {'% Pruned':<8} | {'Feasible':<8} | {'FN':<3} | {'Recall':<6} | {'P@1':<5} | {'NDCG@3':<6}")
    print("-" * 85)
    for prof, m in report.aggressiveness_tradeoffs.items():
        print(f"{prof:<16} | {m.pairs_sent_to_routing:<6} | {m.percentage_pruned:<7.1f}% | {m.true_feasible_pairs:<8} | {m.feasible_pairs_pruned_false_negatives:<3} | {m.feasible_recall:<6.3f} | {m.precision_at_1:<5.3f} | {m.ndcg_at_3:<6.3f}")

    print("\n" + "=" * 85)
    print("  SYNTHETIC STRESS-TEST SCALING ANALYSIS (250 TO 5,000 PAIRS)")
    print("=" * 85)
    print(f"{'Scale Label':<12} | {'Pairs':<6} | {'Base Calls':<10} | {'Pruned Calls':<12} | {'% Pruned':<8} | {'Base ms':<9} | {'Pruned ms':<9} | {'Speedup':<7}")
    print("-" * 85)
    for s in report.stress_scaling_results:
        print(f"{s.scale_label:<12} | {s.total_candidate_pairs:<6} | {s.baseline_routing_calls:<10} | {s.pruned_routing_calls:<12} | {s.pruned_percentage:<7.1f}% | {s.baseline_time_ms:<9.1f} | {s.pruned_time_ms:<9.1f} | {s.speedup_factor:<6.1f}x")
    print("=" * 85)


if __name__ == "__main__":
    main()
