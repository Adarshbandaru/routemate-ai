#!/usr/bin/env python3
"""Runner script for Experiment 011: Multi-Rider Capacity Pooling under Dynamic Congestion."""

from pathlib import Path
import sys

from routemate.multi_rider_pooling import (
    run_experiment_011,
    save_experiment_011_outputs,
)


def main():
    print("=" * 85)
    print("  EXPERIMENT 011: MULTI-RIDER CAPACITY POOLING UNDER DYNAMIC CONGESTION")
    print("=" * 85)
    print("Controlled semi-synthetic study on bounded OSM-derived Downtown SF road network.\n")

    report = run_experiment_011()

    print(f"Study Area: {report.study_area}")
    print("-" * 85)
    print("1. VEHICLE CAPACITY SWEEP (Capacities 1, 2, 3, 4)")
    print("-" * 85)
    print(f"{'Cap':<4} | {'Matched':<8} | {'Match%':<7} | {'Mean Time':<10} | {'Mean Detour':<12} | {'Tot Detour':<11} | {'Util%':<7} | {'Time(ms)':<8}")
    print("-" * 85)
    for cap_name, res in report.capacity_results.items():
        print(
            f"{res.capacity:<4} | "
            f"{res.matched_riders_count:<8} | "
            f"{res.matched_percentage:<6.1f}% | "
            f"{res.mean_rider_travel_time_seconds:<8.1f}s | "
            f"{res.mean_driver_detour_seconds:<10.1f}s | "
            f"{res.total_detour_km:<9.2f}km | "
            f"{res.capacity_utilization_pct:<6.1f}% | "
            f"{res.solve_time_ms:<8.2f}"
        )
    print("-" * 85)

    print("\n2. CONGESTION VS. OPTIMAL STOP SEQUENCE")
    print("-" * 85)
    print(f"Tested Pooled Groups: {len(report.stop_order_shifts)}")
    print(f"Stop-Order Shift Rate: {report.stop_order_shift_rate * 100:.1f}%")
    for shift in report.stop_order_shifts:
        status = "SHIFTED" if shift.stop_order_changed else "IDENTICAL"
        print(f"  Group ({shift.driver_id} + {','.join(shift.rider_ids)}): {status}")
        print(f"    Free-flow order: {' -> '.join(shift.free_flow_stops)}")
        print(f"    Congested order: {' -> '.join(shift.congested_stops)}")
        print(f"    Travel time: {shift.free_flow_duration_s:.1f}s free-flow -> {shift.congested_duration_s:.1f}s congested (delay: +{shift.congestion_delay_s:.1f}s)")

    print("\n3. EXACT BRANCH-AND-BOUND VS. GREEDY INSERTION")
    print("-" * 105)
    print(f"{'Scale Label':<20} | {'Cap':<4} | {'Status':<8} | {'Exact Obj':<10} | {'Greedy Obj':<11} | {'Best Known':<11} | {'Gap %':<8} | {'Exact ms':<9} | {'Greedy ms':<10} | {'Speedup':<8}")
    print("-" * 105)
    for sc in report.solver_comparisons:
        exact_str = f"{sc.exact_objective:.2f}" if sc.exact_objective is not None else "null"
        gap_str = f"{sc.optimality_gap_pct:.2f}%" if sc.optimality_gap_pct is not None else "null"
        bk_str = f"{sc.best_known_exact_objective:.2f}" if sc.best_known_exact_objective is not None else "null"
        print(
            f"{sc.scale_label:<20} | "
            f"{sc.capacity:<4} | "
            f"{sc.status:<8} | "
            f"{exact_str:<10} | "
            f"{sc.greedy_objective:<11.2f} | "
            f"{bk_str:<11} | "
            f"{gap_str:<8} | "
            f"{sc.exact_runtime_ms:<9.2f} | "
            f"{sc.greedy_runtime_ms:<10.2f} | "
            f"{sc.runtime_ratio:<7.1f}x"
        )
    print("-" * 105)

    print("\n4. ADMISSIBLE MULTI-RIDER TWO-TIER PRUNING SAFETY")
    print("-" * 85)
    pm = report.pruning_metrics
    print(f"Evaluated Multi-Rider Subsets: {pm.total_subsets_evaluated}")
    print(f"Pruned Subsets (Admissible LB): {pm.subsets_pruned} ({pm.pruned_percentage:.1f}%)")
    print(f"False Negatives (Safety):      {pm.false_negatives}")
    print(f"Feasible Recall:               {pm.feasible_recall * 100:.1f}%")
    print(f"Routing Calls Saved:           {pm.routing_calls_saved}")
    print(f"Speedup vs Unpruned Search:    {pm.speedup_factor:.2f}x")
    print(f"Provably Admissible:           {pm.is_provably_admissible}")
    print("=" * 85)

    output_dir = Path(__file__).resolve().parent / "outputs"
    res_p, met_p, man_p = save_experiment_011_outputs(report, output_dir)
    print(f"\nArtifacts saved to {output_dir}:")
    print(f"  - {res_p.name}")
    print(f"  - {met_p.name}")
    print(f"  - {man_p.name}")


if __name__ == "__main__":
    main()
