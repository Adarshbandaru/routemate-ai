"""Experiment 012 runner: Dynamic Curbside Dwell, Incident Congestion, and Online Rerouting/Recourse."""

from __future__ import annotations

from pathlib import Path

from routemate.recourse import (
    DEFAULT_EXPERIMENT_012_OUTPUT_DIR,
    run_experiment_012,
    save_experiment_012_outputs,
)


def print_banner(text: str) -> None:
    line = "=" * 80
    print(f"\n{line}\n{text}\n{line}")


def main() -> None:
    print_banner("EXPERIMENT 012: Dynamic Curbside Dwell, Incident Congestion, and Online Recourse")
    print("Controlled semi-synthetic study on bounded OSM-derived Downtown SF road network.\n")
    print("Evaluating 6 core operating conditions, 3 incident severities, and 3 random seeds...")

    report = run_experiment_012(primary_seed=42)

    print(f"\nStudy Area: {report.study_area}")
    print("-" * 125)
    print("1. CORE OPERATING CONDITIONS COMPARISON (Seed 42, Moderate Incident)")
    print("-" * 125)
    headers = [
        "Condition",
        "Policy",
        "Perturbation",
        "Exec Feas",
        "Exec Obj",
        "Detour(km)",
        "Dur(s)",
        "Reroute%",
        "Recov%",
        "Regret",
        "Lat(ms)",
    ]
    fmt = "{:<25} | {:<8} | {:<14} | {:>9} | {:>8} | {:>10} | {:>6} | {:>8} | {:>7} | {:>6} | {:>7}"
    print(fmt.format(*headers))
    print("-" * 125)

    for cond_name, sm in report.scenario_metrics.items():
        feas_str = f"{sm.executed_feasible_rate_pct:.1f}%"
        obj_str = f"{sm.executed_mean_objective:.2f}"
        detour_str = f"{sm.executed_mean_detour_km:.3f}"
        dur_str = f"{sm.executed_mean_duration_seconds:.0f}"
        reroute_str = f"{sm.rerouting_frequency_pct:.1f}%"
        recov_str = f"{sm.mean_objective_recovery_pct:.1f}%" if sm.mean_objective_recovery_pct is not None else "N/A"
        regret_str = f"{sm.mean_regret_vs_oracle:.2f}" if sm.mean_regret_vs_oracle is not None else "null"
        lat_str = f"{sm.mean_recourse_latency_ms:.2f}" if sm.mean_recourse_latency_ms is not None else "N/A"
        print(
            fmt.format(
                cond_name,
                sm.policy,
                sm.perturbation,
                feas_str,
                obj_str,
                detour_str,
                dur_str,
                reroute_str,
                recov_str,
                regret_str,
                lat_str,
            )
        )
    print("-" * 125)

    print("\n2. SEVERITY COMPARISON SWEEP (Full Dwell + Incident)")
    print("-" * 90)
    s_headers = ["Severity", "Unadapted Feas", "Recourse Feas", "Feas Boost", "Mean Objective Recovery"]
    s_fmt = "{:<12} | {:>14} | {:>14} | {:>11} | {:>24}"
    print(s_fmt.format(*s_headers))
    print("-" * 90)
    for sev_name, sdata in report.severity_comparisons.items():
        r_feas = f"{sdata['realized_feasible_rate_pct']:.1f}%"
        rec_feas = f"{sdata['recourse_feasible_rate_pct']:.1f}%"
        boost = f"+{sdata['feasibility_boost_pct']:.1f}%"
        recov = f"{sdata['mean_objective_recovery_pct']:.1f}%"
        print(s_fmt.format(sev_name, r_feas, rec_feas, boost, recov))
    print("-" * 90)

    print("\n3. SEED STABILITY SWEEP (Seeds 42, 101, 2024 -- Independent Cohorts & Stochastic Realizations)")
    print("-" * 115)
    seed_headers = [
        "Seed",
        "Planned",
        "Static Feas",
        "Recourse Feas",
        "Feas Boost",
        "Static Obj",
        "Recourse Obj",
        "Recovery%",
        "Lat(ms)",
    ]
    seed_fmt = "{:<12} | {:>7} | {:>12} | {:>14} | {:>11} | {:>11} | {:>13} | {:>10} | {:>8}"
    print(seed_fmt.format(*seed_headers))
    print("-" * 115)
    for seed_key, seed_res in report.seed_stability_results.items():
        planned = str(seed_res.get("planned_trips", 10))
        r_feas = f"{seed_res['realized_feasible_rate_pct']:.1f}%"
        rec_feas = f"{seed_res['recourse_feasible_rate_pct']:.1f}%"
        boost = f"+{seed_res['feasibility_boost_pct']:.1f}%"
        r_obj = f"{seed_res.get('realized_mean_objective', 0.0):.2f}"
        rec_obj = f"{seed_res.get('recourse_mean_objective', 0.0):.2f}"
        recov = f"{seed_res.get('mean_objective_recovery_pct', 0.0):.1f}%"
        lat = f"{seed_res.get('mean_recourse_latency_ms', 0.0):.2f}"
        print(seed_fmt.format(seed_key, planned, r_feas, rec_feas, boost, r_obj, rec_obj, recov, lat))
    print("-" * 115)

    # Save artifacts
    results_path, metrics_path, manifest_path = save_experiment_012_outputs(report)
    print("\nSaved Experiment 012 artifacts:")
    print(f"  - results:  {results_path}")
    print(f"  - metrics:  {metrics_path}")
    print(f"  - manifest: {manifest_path}")


if __name__ == "__main__":
    main()
