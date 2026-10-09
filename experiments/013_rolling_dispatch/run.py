"""Experiment 013 runner: Fleet-Wide Rolling-Horizon Dispatch."""

from __future__ import annotations

from pathlib import Path

from routemate.rolling_dispatch import (
    DEFAULT_EXPERIMENT_013_OUTPUT_DIR,
    run_experiment_013,
    save_experiment_013_outputs,
)


def print_banner(text: str) -> None:
    line = "=" * 90
    print(f"\n{line}\n{text}\n{line}")


def main() -> None:
    print_banner("EXPERIMENT 013: Fleet-Wide Rolling-Horizon Dispatch Simulation")
    print("Controlled semi-synthetic study on bounded OSM-derived Downtown SF road network.\n")
    print("Evaluating Static Batch, Periodic Rolling, and Event-Driven Rolling policies...")

    report = run_experiment_013(primary_seed=42, horizon_minutes=60.0)

    print(f"\nStudy Area: {report.study_area}")
    print(f"Simulation Horizon: {report.horizon_minutes:.0f} minutes")

    print("-" * 125)
    print("1. DISPATCH POLICY COMPARISON ACROSS DEMAND REGIMES (Seed 42, 1-hr Peak Commute)")
    print("-" * 125)
    headers = [
        "Regime",
        "Policy",
        "Fulfill%",
        "Cancel%",
        "Pool%",
        "Wait(s) [p50/p95]",
        "Journey(s)",
        "Fleet VKT",
        "Insertions",
        "Lat(ms) [mean/p95]",
    ]
    fmt = "{:<9} | {:<20} | {:>8} | {:>7} | {:>6} | {:>17} | {:>10} | {:>10} | {:>10} | {:>18}"
    print(fmt.format(*headers))
    print("-" * 125)

    for reg_name, reg_data in report.regime_comparisons.items():
        for pol_name, m in reg_data.policy_results.items():
            ful_str = f"{m.fulfillment_rate_pct:.1f}%"
            can_str = f"{m.cancellation_rate_pct:.1f}%"
            pool_str = f"{m.pooling_rate_pct:.1f}%"
            wait_str = f"{m.p50_wait_time_seconds:.0f}s / {m.p95_wait_time_seconds:.0f}s"
            jrn_str = f"{m.mean_journey_time_seconds:.0f}s"
            vkt_str = f"{m.total_fleet_vkt_km:.1f} km"
            ins_str = str(m.active_trip_insertions)
            lat_str = f"{m.mean_solver_latency_ms:.2f} / {m.p95_solver_latency_ms:.2f}"
            print(
                fmt.format(
                    reg_name,
                    pol_name,
                    ful_str,
                    can_str,
                    pool_str,
                    wait_str,
                    jrn_str,
                    vkt_str,
                    ins_str,
                    lat_str,
                )
            )
        print("-" * 125)

    print("\n2. ROAD INCIDENT DISRUPTION & RECOVERY COMPARISON (Market St Arterial Closure)")
    print("-" * 95)
    d_headers = ["Policy", "Fulfillment Rate", "Cancellation Rate", "Mean Wait Time", "Reassignments", "Fleet VKT"]
    d_fmt = "{:<22} | {:>16} | {:>17} | {:>14} | {:>13} | {:>10}"
    print(d_fmt.format(*d_headers))
    print("-" * 95)
    for pol_name, ddata in report.disruption_comparisons.items():
        ful_str = f"{ddata['fulfillment_rate_pct']:.1f}%"
        can_str = f"{ddata['cancellation_rate_pct']:.1f}%"
        wait_str = f"{ddata['mean_wait_time_seconds']:.1f}s"
        reassign_str = str(ddata["reassignments"])
        vkt_str = f"{ddata['fleet_vkt_km']:.1f} km"
        print(d_fmt.format(pol_name, ful_str, can_str, wait_str, reassign_str, vkt_str))
    print("-" * 95)

    print("\n3. SEED STABILITY SWEEP (Seeds 42, 101, 2024 -- Event-Driven Rolling Policy)")
    print("-" * 105)
    s_headers = ["Seed", "Requests", "Completed", "Fulfill%", "Pool%", "Mean Wait", "p95 Wait", "Fleet VKT", "Lat(ms)"]
    s_fmt = "{:<10} | {:>8} | {:>9} | {:>8} | {:>6} | {:>9} | {:>9} | {:>10} | {:>8}"
    print(s_fmt.format(*s_headers))
    print("-" * 105)
    for s_key, sdata in report.seed_stability_results.items():
        reqs = str(sdata["requests_generated"])
        comp = str(sdata["completed"])
        ful = f"{sdata['fulfillment_rate_pct']:.1f}%"
        pool = f"{sdata['pooling_rate_pct']:.1f}%"
        wait = f"{sdata['mean_wait_time_seconds']:.1f}s"
        p95w = f"{sdata['p95_wait_time_seconds']:.1f}s"
        vkt = f"{sdata['fleet_vkt_km']:.1f} km"
        lat = f"{sdata['mean_latency_ms']:.2f}"
        print(s_fmt.format(s_key, reqs, comp, ful, pool, wait, p95w, vkt, lat))
    print("-" * 105)

    # Save outputs
    results_path, metrics_path, manifest_path = save_experiment_013_outputs(report)
    print("\nSaved Experiment 013 artifacts:")
    print(f"  - results:  {results_path}")
    print(f"  - metrics:  {metrics_path}")
    print(f"  - manifest: {manifest_path}")


if __name__ == "__main__":
    main()
