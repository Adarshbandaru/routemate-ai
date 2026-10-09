"""Runner script for Experiment 010: Dynamic Congestion Curves & Peak-Hour Time-Window Robustness.

Usage:
    uv run python experiments/010_dynamic_congestion/run.py
"""
import json
from pathlib import Path
import sys

# Ensure repository root is in sys.path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "src"))

from routemate.dynamic_congestion import (
    run_experiment_010,
    save_experiment_010_outputs,
)
from routemate.routing import create_osm_sf_downtown_network


def main() -> None:
    exp_dir = Path(__file__).resolve().parent
    output_dir = exp_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 85)
    print("  ROUTEMATE EXPERIMENT 010: DYNAMIC CONGESTION CURVES & TIME-WINDOW ROBUSTNESS")
    print("=" * 85)
    print("Study Area: San Francisco Downtown / Financial District & SoMa Corridor")
    print("Model:      Bureau of Public Roads (BPR) link delay function: t = t0 * (1 + alpha * (v/c)^beta)")
    print("Traffic:    Synthetic diurnal demand with peak-hour directional corridor asymmetry.")
    print("-" * 85)

    network = create_osm_sf_downtown_network()

    print("\n[1/3] Executing dynamic time-dependent routing & congestion scenarios...")
    report = run_experiment_010(network=network, seed=42)

    print("\n[2/3] Saving experiment outputs...")
    results_p, metrics_p, manifest_p = save_experiment_010_outputs(report, output_dir)
    print(f"  -> {results_p}")
    print(f"  -> {metrics_p}")
    print(f"  -> {manifest_p}")

    print("\n" + "=" * 85)
    print("  CONTROLLED CONGESTION SCENARIOS (BPR LINK PERFORMANCE CURVES)")
    print("=" * 85)
    print(f"{'Scenario':<24} | {'Mean Time':<10} | {'Delay':<8} | {'Top-1 Chg':<10} | {'Feasible':<9} | {'NDCG@3':<7} | {'ETA Error':<10}")
    print("-" * 85)
    for name, s in report.congestion_scenarios.items():
        print(f"{name:<24} | {s.mean_travel_time_seconds:<8.1f}s | {s.mean_congestion_delay_seconds:<6.1f}s | {s.top1_recommendation_change_rate * 100:<8.1f}% | {s.feasible_pairs_count:<9} | {s.ndcg_at_3:<7.3f} | {s.mean_static_eta_error_seconds:<8.1f}s")

    print("\n" + "=" * 85)
    print("  TIME-WINDOW ROBUSTNESS: DEPARTURE TIME PERTURBATIONS (+/- MINUTES)")
    print("=" * 85)
    print(f"{'Offset':<10} | {'Feasible Pairs':<15} | {'Feasibility Flips':<18} | {'Top-1 Disagree':<15} | {'ETA Shift':<10}")
    print("-" * 85)
    for w in report.time_window_sensitivities:
        sign_str = f"+{w.offset_minutes}" if w.offset_minutes > 0 else f"{w.offset_minutes}"
        print(f"{sign_str + ' min':<10} | {w.feasible_pairs_count:<15} | {w.feasibility_flip_count:<18} | {w.top1_rank_disagreement_rate * 100:<13.1f}% | {w.mean_travel_time_shift_seconds:<8.1f}s")

    print("\n" + "=" * 85)
    print("  TWO-TIER PRUNING SAFETY UNDER DYNAMIC TIME-DEPENDENT ROUTING")
    print("=" * 85)
    pe = report.pruning_evaluation
    print(f"Total Candidate Pairs:         {pe.total_candidate_pairs}")
    print(f"Candidate Pairs Pruned:        {pe.pruned_pairs_count} ({pe.percentage_pruned:.1f}%)")
    print(f"Pairs Sent to Dynamic Router:  {pe.pairs_sent_to_dynamic_routing}")
    print(f"True Dynamic Feasible Pairs:   {pe.true_dynamic_feasible_pairs}")
    print(f"False Negatives (Dropped):     {pe.false_negatives} (Recall: {pe.feasible_recall * 100:.1f}%)")
    print(f"Top-1 Recommendation Match:    {pe.top1_ranking_agreement_rate * 100:.1f}%")
    print(f"Pipeline Speedup Factor:       {pe.speedup_factor:.2f}x")
    print(f"Provably Admissible:           {'YES (Mathematical distance lower bounds)' if pe.is_provably_admissible else 'NO'}")

    print("\n" + "=" * 85)
    print("  SYNTHETIC STRESS-TEST SCALING (DYNAMIC ROUTING + PRUNING)")
    print("=" * 85)
    print(f"{'Scale Label':<14} | {'Pairs':<6} | {'Base Calls':<11} | {'Pruned Calls':<13} | {'Base ms':<9} | {'Pruned ms':<9} | {'Speedup':<7}")
    print("-" * 85)
    for sc in report.scaling_results:
        print(f"{sc.scale_label:<14} | {sc.total_candidate_pairs:<6} | {sc.baseline_routing_calls:<11} | {sc.pruned_routing_calls:<13} | {sc.baseline_time_ms:<9.1f} | {sc.pruned_time_ms:<9.1f} | {sc.speedup_factor:<6.1f}x")
    print("=" * 85)


if __name__ == "__main__":
    main()
