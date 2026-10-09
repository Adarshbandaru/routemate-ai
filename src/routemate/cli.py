"""Command-line interface for the RouteMate matching and batch assignment prototype."""
import argparse
import sys
from .assignment import compute_optimality_gap, run_assignment
from .road_benchmark import run_road_network_benchmark
from .sample import simulated_journeys
from .scoring import compatibility_score
from .synthetic import generate_dataset


def run_demo():
    driver, rider = simulated_journeys()
    result = compatibility_score(driver, rider)
    print("SIMULATED DATA ONLY (not real users; score is not a probability)")
    print(f"journeys: {driver.journey_id} + {rider.journey_id}")
    print(f"heuristic compatibility score: {result.score}/100")
    print(f"compatible: {result.compatible}")
    for key, value in result.features.items():
        print(f"  {key}: {value:.3f}")
    print("explanations:")
    for item in result.explanations:
        print(f"  - {item}")


def run_batch_demo():
    ds = generate_dataset(seeds=(42,), requests_per_scenario=1, scenarios={"balanced": 8})
    query = ds[0]
    riders = [query.rider]
    for idx, d in enumerate(query.drivers[:3], 1):
        riders.append(
            query.rider.__class__(
                f"RIDER-{idx}",
                d.start,
                d.destination,
                d.departure,
                d.route,
                d.vehicle,
                d.verification,
                1,
            )
        )
    drivers = query.drivers
    print(f"\nRouteMate Batch Assignment Simulation ({len(riders)} riders, {len(drivers)} drivers):")
    results = {}
    for method in ("greedy", "auction", "optimal"):
        res = run_assignment(riders, drivers, method=method)
        results[method] = res
        gap_str = ""
        if method != "optimal" and "optimal" in results:
            gap = compute_optimality_gap(results["optimal"], res)
            gap_str = f" (Optimality Gap: {gap:.1f}%)"
        print(f"\n--- Method: {method.upper()}{gap_str} ---")
        print(f"  Matched Riders:  {res.matched_rider_count}/{len(riders)}")
        print(f"  Drivers Used:    {res.matched_driver_count}/{len(drivers)}")
        print(f"  Objective Score: {res.objective_value:.2f}")
        print(f"  Feasible Edges:  {res.feasible_edges}/{res.total_pairs}")
        print(f"  Solve Time:      {res.solve_seconds * 1000:.2f}ms")
        for g in res.groups:
            print(f"    Driver {g.driver_id}: riders={list(g.rider_ids)} (seats={g.seats_used}, rem={g.remaining_capacity}, score={g.group_score:.1f})")


def run_assignment_benchmark_demo():
    from .assignment_scaling import run_assignment_scaling_experiment
    print("\nRunning RouteMate Assignment Optimality & Scaling Benchmark (Experiment 007)...")
    report = run_assignment_scaling_experiment(
        scale_configs=(("micro_5x3", 5, 3), ("small_10x5", 10, 5), ("medium_20x10", 20, 10)),
        seeds=(42, 101),
        timeout_seconds=2.0,
    )
    print("=" * 75)
    print("  MULTI-RIDER ASSIGNMENT OPTIMALITY & SCALING BENCHMARK")
    print("=" * 75)
    print(f"{'Scale':<14} | {'Edges':<7} | {'Greedy Gap':<12} | {'Auction Gap':<12} | {'B&B Nodes':<10}")
    print("-" * 75)
    for a in report.aggregates:
        print(f"{a.scale_name:<14} | {a.mean_feasible_edges:<7.1f} | {a.greedy_mean_gap_pct:<11.1f}% | {a.auction_mean_gap_pct:<11.1f}% | {a.optimal_mean_nodes_explored:<10.0f}")
    print("=" * 75)
    print(f"Mean Greedy Optimality Gap:  {report.overall_greedy_mean_gap_pct:.2f}%")
    print(f"Mean Auction Optimality Gap: {report.overall_auction_mean_gap_pct:.2f}%")


def run_road_benchmark_demo():
    print("\nRunning RouteMate Road Network Benchmark (Euclidean vs. Urban Grid Graph)...")
    rep = run_road_network_benchmark(max_pairs=30)
    print("=" * 65)
    print("  ROAD NETWORK BENCHMARK: EUCLIDEAN APPROXIMATION GAP")
    print("=" * 65)
    print(f"  Evaluated OD Pairs:              {rep.total_pairs_evaluated}")
    print(f"  Mean Circuity Factor:            {rep.mean_circuity_factor:.3f}x (Road / Euclidean distance)")
    print(f"  Max Circuity Factor:             {rep.max_circuity_factor:.3f}x")
    print(f"  Mean Euclidean Distance:         {rep.mean_euclidean_distance_km:.2f} km")
    print(f"  Mean Street Road Distance:       {rep.mean_road_distance_km:.2f} km")
    print("-" * 65)
    print(f"  Mean Geometric Detour:           {rep.mean_geometric_detour_km:.2f} km")
    print(f"  Mean Road Network Detour:        {rep.mean_road_detour_km:.2f} km")
    print(f"  Mean Detour Underestimation:     {rep.mean_detour_underestimation_km:.2f} km")
    print(f"  Feasibility Disagreement Rate:   {rep.feasibility_disagreement_rate * 100:.1f}%")
    print("=" * 65)
    print("Interpretation:")
    print("  Geometric straight-line approximations systematically underestimate")
    print("  actual road network detours due to street grid geometry, turn penalties,")
    print("  and one-way constraints. Real road routing is essential for accurate matching.")


def run_road_validation_demo():
    from .road_network_validation import run_road_network_validation_experiment
    print("\nRunning RouteMate Road Network Validation (Experiment 008)...")
    rep = run_road_network_validation_experiment()
    print("=" * 75)
    print("  EXPERIMENT 008: REALISTIC ROAD-NETWORK VALIDATION BENCHMARK")
    print("=" * 75)
    print(f"Study Area: {rep.study_area}")
    print(f"Evaluated Pairs: {rep.total_pairs} ({rep.driver_count} drivers x {rep.rider_count} riders)")
    print("-" * 75)
    print(f"{'Approach':<24} | {'P@1':<5} | {'P@3':<5} | {'NDCG@3':<6} | {'MRR':<5} | {'Detour':<7}")
    print("-" * 75)
    for name, m in rep.approach_metrics.items():
        print(f"{name:<24} | {m.precision_at_1:<5.3f} | {m.precision_at_3:<5.3f} | {m.ndcg_at_3:<6.3f} | {m.mrr:<5.3f} | {m.mean_selected_detour_km:<5.2f}km")
    print("-" * 75)
    da = rep.disagreement_analysis
    print(f"Feasibility Disagreement Rate:     {da.feasibility_disagreement_rate * 100:.1f}%")
    print(f"Top-1 Recommendation Disagreement: {da.top1_rank_disagreement_rate * 100:.1f}%")
    print(f"Geometric False Positives:         {da.geometric_false_positives} / {da.geometric_eligible_count}")
    print(f"Latency: Geometric {da.geometric_feature_latency_us:.1f}us vs Road {da.network_feature_latency_us:.1f}us ({da.latency_slowdown_factor:.1f}x)")
    print("=" * 75)


def run_hybrid_pruning_demo():
    from .hybrid_pruning import run_experiment_009
    print("\nRunning RouteMate Hybrid Two-Tier Pruning Benchmark (Experiment 009)...")
    rep = run_experiment_009()
    print("=" * 80)
    print("  EXPERIMENT 009: HYBRID TWO-TIER PRUNING & ROAD-NETWORK GATING")
    print("=" * 80)
    print(f"{'Method':<25} | {'Routed':<6} | {'% Pruned':<8} | {'Recall':<6} | {'FN':<3} | {'Speedup':<7}")
    print("-" * 80)
    for name, m in rep.pruning_comparisons.items():
        print(f"{name:<25} | {m.pairs_sent_to_routing:<6} | {m.percentage_pruned:<7.1f}% | {m.feasible_recall:<6.3f} | {m.feasible_pairs_pruned_false_negatives:<3} | {m.speedup_factor:<6.2f}x")
    print("-" * 80)
    adm = rep.pruning_comparisons["E_admissible_lower_bound"]
    print(f"Admissible Lower-Bound Pruned: {adm.percentage_pruned:.1f}%")
    print(f"Admissible False Negatives:   {adm.feasible_pairs_pruned_false_negatives} (Recall: {adm.feasible_recall * 100:.1f}%)")
    print(f"Top-1 Recommendation Match:    {adm.top1_agreement_rate * 100:.1f}%")
    print("=" * 80)


def run_dynamic_congestion_demo():
    from .dynamic_congestion import run_experiment_010
    print("\nRunning RouteMate Dynamic Congestion Benchmark (Experiment 010)...")
    rep = run_experiment_010()
    print("=" * 80)
    print("  EXPERIMENT 010: DYNAMIC CONGESTION CURVES & TIME-WINDOW ROBUSTNESS")
    print("=" * 80)
    print(f"{'Scenario':<24} | {'Mean Time':<10} | {'Delay':<8} | {'Top-1 Chg':<10} | {'Feasible':<9}")
    print("-" * 80)
    for name, s in rep.congestion_scenarios.items():
        print(f"{name:<24} | {s.mean_travel_time_seconds:<8.1f}s | {s.mean_congestion_delay_seconds:<6.1f}s | {s.top1_recommendation_change_rate * 100:<8.1f}% | {s.feasible_pairs_count:<9}")
    print("-" * 80)
    pe = rep.pruning_evaluation
    print(f"Two-Tier Dynamic Pruned:       {pe.percentage_pruned:.1f}% ({pe.pruned_pairs_count}/{pe.total_candidate_pairs})")
    print(f"Pruning False Negatives:       {pe.false_negatives} (Recall: {pe.feasible_recall * 100:.1f}%)")
    print(f"Top-1 Recommendation Match:    {pe.top1_ranking_agreement_rate * 100:.1f}%")
    print(f"Dynamic Pipeline Speedup:      {pe.speedup_factor:.2f}x")
    print("=" * 80)


def run_multi_rider_benchmark_demo():
    from .multi_rider_pooling import run_experiment_011
    print("\nRunning RouteMate Multi-Rider Capacity Pooling Benchmark (Experiment 011)...")
    rep = run_experiment_011()
    print("=" * 85)
    print("  EXPERIMENT 011: MULTI-RIDER CAPACITY POOLING UNDER DYNAMIC CONGESTION")
    print("=" * 85)
    print(f"Study Area: {rep.study_area}")
    print("-" * 85)
    print(f"{'Cap':<4} | {'Matched':<8} | {'Match%':<7} | {'Mean Time':<10} | {'Mean Detour':<12} | {'Tot Detour':<11} | {'Util%':<7} | {'Time(ms)':<8}")
    print("-" * 85)
    for cap_name, res in rep.capacity_results.items():
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
    print(f"Congestion Stop-Order Shifts:  {len(rep.stop_order_shifts)} groups tested ({rep.stop_order_shift_rate * 100:.1f}% shifted)")
    pm = rep.pruning_metrics
    print(f"Admissible Multi-Rider Pruned: {pm.subsets_pruned}/{pm.total_subsets_evaluated} ({pm.pruned_percentage:.1f}%)")
    print(f"Pruning False Negatives:       {pm.false_negatives} (Recall: {pm.feasible_recall * 100:.1f}%)")
    print(f"Provably Admissible:           {pm.is_provably_admissible}")
    print("=" * 85)


def run_recourse_benchmark_demo():
    from .recourse import run_experiment_012
    print("\nRunning RouteMate Dynamic Curbside Dwell & Recourse Benchmark (Experiment 012)...")
    rep = run_experiment_012()
    print("=" * 105)
    print("  EXPERIMENT 012: DYNAMIC CURBSIDE DWELL, INCIDENT CONGESTION & ONLINE RECOURSE")
    print("=" * 105)
    print(f"Study Area: {rep.study_area}")
    print("-" * 105)
    print(f"{'Condition':<25} | {'Policy':<8} | {'Feas%':<7} | {'Mean Obj':<9} | {'Reroute%':<8} | {'Recov%':<7} | {'Regret':<7}")
    print("-" * 105)
    for name, sm in rep.scenario_metrics.items():
        recov_str = f"{sm.mean_objective_recovery_pct:.1f}%" if sm.mean_objective_recovery_pct is not None else "N/A"
        regret_str = f"{sm.mean_regret_vs_oracle:.2f}" if sm.mean_regret_vs_oracle is not None else "null"
        print(
            f"{name:<25} | "
            f"{sm.policy:<8} | "
            f"{sm.executed_feasible_rate_pct:<6.1f}% | "
            f"{sm.executed_mean_objective:<9.2f} | "
            f"{sm.rerouting_frequency_pct:<7.1f}% | "
            f"{recov_str:<7} | "
            f"{regret_str:<7}"
        )
    print("-" * 105)
    s_mod = rep.severity_comparisons["moderate"]
    print(f"Moderate Incident Feasibility Boost: +{s_mod['feasibility_boost_pct']:.1f}% ({s_mod['realized_feasible_rate_pct']:.1f}% -> {s_mod['recourse_feasible_rate_pct']:.1f}%)")
    print("=" * 105)


def run_rolling_dispatch_benchmark_demo():
    from .rolling_dispatch import run_experiment_013
    print("\nRunning RouteMate Fleet-Wide Rolling-Horizon Dispatch Benchmark (Experiment 013)...")
    rep = run_experiment_013(horizon_minutes=60.0)
    print("=" * 115)
    print("  EXPERIMENT 013: FLEET-WIDE ROLLING-HORIZON DISPATCH BENCHMARK")
    print("=" * 115)
    print(f"Study Area: {rep.study_area}")
    print(f"Simulation Horizon: {rep.horizon_minutes:.0f} minutes")
    print("-" * 115)
    headers = ["Regime", "Policy", "Fulfill%", "Cancel%", "Pool%", "Wait(s) [p50/p95]", "Journey(s)", "Fleet VKT", "Lat(ms)"]
    fmt = "{:<9} | {:<21} | {:>8} | {:>7} | {:>6} | {:>17} | {:>10} | {:>10} | {:>7}"
    print(fmt.format(*headers))
    print("-" * 115)
    for reg_name, reg_data in rep.regime_comparisons.items():
        for pol_name, m in reg_data.policy_results.items():
            print(
                fmt.format(
                    reg_name,
                    pol_name,
                    f"{m.fulfillment_rate_pct:.1f}%",
                    f"{m.cancellation_rate_pct:.1f}%",
                    f"{m.pooling_rate_pct:.1f}%",
                    f"{m.p50_wait_time_seconds:.0f}s / {m.p95_wait_time_seconds:.0f}s",
                    f"{m.mean_journey_time_seconds:.0f}s",
                    f"{m.total_fleet_vkt_km:.1f} km",
                    f"{m.mean_solver_latency_ms:.2f}",
                )
            )
        print("-" * 115)


def run_synthesis_demo():
    from .synthesis import run_experiment_014
    print("\nRunning RouteMate Research Synthesis & Cross-Experiment Analysis (Experiment 014)...")
    rep = run_experiment_014()
    print("=" * 110)
    print("  EXPERIMENT 014: RESEARCH SYNTHESIS & CROSS-EXPERIMENT META-ANALYSIS")
    print("=" * 110)
    print(f"Audited Experiments: {rep.experiments_audited_count} (001 - 013)")
    print(f"Total Hypotheses & RQs Evaluated: {len(rep.hypotheses_evaluations)}")
    print(f"Trade-off Dimensions Evaluated:   {len(rep.tradeoff_analyses)}")
    print("-" * 110)
    print(f"{'ID':<6} | {'Status':<20} | {'Supporting Experiments':<30} | {'Summary'}")
    print("-" * 110)
    for h in rep.hypotheses_evaluations.values():
        print(f"{h.hypothesis_id:<6} | {h.status:<20} | {', '.join(h.supporting_experiments):<30} | {h.empirical_evidence[:45]}...")
    print("=" * 110)


def run_real_benchmark_demo():
    from .real_benchmark import run_real_city_benchmark
    print("=" * 80)
    print("RouteMate Real-World Urban Road Network Benchmark")
    print("Evaluating Downtown San Francisco Transit Topology vs Geometric Baseline")
    print("=" * 80)
    rep = run_real_city_benchmark()
    print(f"Trips Evaluated:             {rep.total_trips_evaluated}")
    print(f"Mean Circuity Factor:        {rep.mean_circuity_factor:.2f}x (Range: {rep.min_circuity_factor:.2f}x - {rep.max_circuity_factor:.2f}x)")
    print(f"Mean Travel Speed:           {rep.mean_speed_kmh:.1f} km/h")
    print(f"Mean Trip Duration:          {rep.mean_travel_time_seconds / 60.0:.1f} min")
    print(f"Euclidean False-Positives:   {rep.euclidean_false_positive_rate_pct:.1f}%")
    print(f"Detour Underestimation:      {rep.detour_underestimation_mean_km:.2f} km")
    print("-" * 80)
    print(f"{'Trip ID':<20} | {'Origin':<20} | {'Destination':<20} | {'Circuity'}")
    print("-" * 80)
    for s in rep.sample_evaluations:
        print(f"{s['trip_id']:<20} | {s['origin']:<20} | {s['destination']:<20} | {s['circuity']}x")
    print("=" * 80)


def run_repositioning_demo():
    from .repositioning import PredictiveFleetRebalancer, SF_TRANSIT_ZONES
    from .synthetic import generate_dataset
    print("=" * 80)
    print("RouteMate Predictive Fleet Repositioning & Spatial Rebalancing")
    print("Pre-Dispatch Vehicle Staging across San Francisco Transit Hubs")
    print("=" * 80)
    ds = generate_dataset(seeds=(42,), requests_per_scenario=1, scenarios={"dense": 20})
    idle_drivers = ds[0].drivers
    rebalancer = PredictiveFleetRebalancer(zones=SF_TRANSIT_ZONES)
    demand_mults = {"Z3_caltrain": 1.8, "Z2_soma": 1.4, "Z1_fidi": 0.6}
    rep = rebalancer.compute_rebalancing(idle_drivers, demand_multipliers=demand_mults)
    print(f"Total Idle Fleet:            {rep.total_idle_vehicles} vehicles")
    print(f"Repositioning Directives:    {rep.vehicles_repositioned} relocations issued")
    print(f"Unmet Demand Deficit:        {rep.unmet_demand_before_rebalance} -> {rep.unmet_demand_after_rebalance} ({rep.demand_fulfillment_gain_pct:.1f}% gain)")
    print(f"Mean Deadhead Mileage:       {rep.mean_relocation_distance_km:.2f} km (P95: {rep.p95_relocation_distance_km:.2f} km)")
    print(f"Total Fleet Staging VKT:     {rep.total_rebalance_vkt_km:.2f} km")
    print(f"Solver Compute Latency:      {rep.solver_latency_ms:.2f} ms")
    print("-" * 80)
    print(f"{'Driver ID':<22} | {'Origin Zone':<16} | {'Target Zone':<16} | {'Deadhead'}")
    print("-" * 80)
    for d in rep.directives[:8]:
        print(f"{d.driver_id:<22} | {d.origin_zone:<16} | {d.target_zone:<16} | {d.relocation_distance_km:.2f} km")
    print("=" * 80)


def main(argv=None):
    parser = argparse.ArgumentParser(description="RouteMate CLI — Matching and Batch Assignment Prototype")
    parser.add_argument("--demo", action="store_true", help="Run 1-on-1 heuristic journey comparison (default)")
    parser.add_argument("--batch", action="store_true", help="Run multi-rider batch assignment simulation")
    parser.add_argument("--assignment-benchmark", action="store_true", help="Run multi-rider assignment optimality & scaling benchmark")
    parser.add_argument("--road-benchmark", action="store_true", help="Run Euclidean vs. Street-Network routing benchmark")
    parser.add_argument("--road-network-validation", "--road-validation", action="store_true", help="Run Experiment 008 road-network trajectory validation")
    parser.add_argument("--hybrid-pruning-benchmark", "--hybrid-pruning", action="store_true", help="Run Experiment 009 hybrid two-tier pruning benchmark")
    parser.add_argument("--dynamic-congestion-benchmark", "--dynamic-congestion", action="store_true", help="Run Experiment 010 dynamic congestion benchmark")
    parser.add_argument("--multi-rider-benchmark", "--multi-rider-pooling", action="store_true", help="Run Experiment 011 multi-rider pooling benchmark")
    parser.add_argument("--recourse-benchmark", "--online-recourse", action="store_true", help="Run Experiment 012 dynamic curbside dwell & recourse benchmark")
    parser.add_argument("--rolling-dispatch-benchmark", "--rolling-horizon-benchmark", "--rolling-dispatch", action="store_true", help="Run Experiment 013 fleet-wide rolling-horizon dispatch benchmark")
    parser.add_argument("--synthesis-benchmark", "--research-synthesis", "--synthesis", action="store_true", help="Run Experiment 014 research synthesis & cross-experiment analysis")
    parser.add_argument("--real-city-benchmark", "--real-benchmark", action="store_true", help="Run empirical San Francisco downtown road network benchmark")
    parser.add_argument("--repositioning-benchmark", "--fleet-rebalance", action="store_true", help="Run predictive fleet repositioning & spatial rebalancing simulation")
    parser.add_argument("--api", action="store_true", help="Launch the local prototype HTTP API")
    parser.add_argument("--port", type=int, default=8000, help="Port for HTTP API (used with --api)")
    args = parser.parse_args(argv)

    if args.api:
        from .api import serve
        serve(port=args.port)
    elif args.batch:
        run_batch_demo()
    elif args.assignment_benchmark:
        run_assignment_benchmark_demo()
    elif args.road_benchmark:
        run_road_benchmark_demo()
    elif args.road_network_validation:
        run_road_validation_demo()
    elif args.hybrid_pruning_benchmark:
        run_hybrid_pruning_demo()
    elif args.dynamic_congestion_benchmark:
        run_dynamic_congestion_demo()
    elif args.multi_rider_benchmark:
        run_multi_rider_benchmark_demo()
    elif args.recourse_benchmark:
        run_recourse_benchmark_demo()
    elif args.rolling_dispatch_benchmark:
        run_rolling_dispatch_benchmark_demo()
    elif args.synthesis_benchmark:
        run_synthesis_demo()
    elif args.real_city_benchmark:
        run_real_benchmark_demo()
    elif args.repositioning_benchmark:
        run_repositioning_demo()
    else:
        run_demo()


if __name__ == "__main__":
    main()
