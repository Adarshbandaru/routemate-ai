"""Runner script for Experiment 008: Realistic Road-Network / Trajectory Validation.

Usage:
    uv run python experiments/008_road_network_validation/run.py
"""
import json
from pathlib import Path
import sys

# Ensure repository root is in sys.path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "src"))

from routemate.road_network_validation import (
    generate_sf_study_dataset,
    run_road_network_validation_experiment,
    save_experiment_008_outputs,
)
from routemate.routing import create_osm_sf_downtown_network


def main() -> None:
    exp_dir = Path(__file__).resolve().parent
    data_dir = exp_dir / "data"
    output_dir = exp_dir / "outputs"
    data_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("  ROUTEMATE EXPERIMENT 008: REALISTIC ROAD-NETWORK VALIDATION")
    print("=" * 80)
    print("Study Area: San Francisco Downtown / Financial District & SoMa Corridor")
    print("Bounding Box: [37.7805 N, -122.4065 W] to [37.7938 N, -122.3865 W]")
    print("Data Source: OpenStreetMap contributors (ODbL 1.0 license)")
    print("-" * 80)

    # 1. Build and serialize the preprocessed OSM street network fixture
    network = create_osm_sf_downtown_network()
    osm_path = data_dir / "osm_sf_downtown.json"
    with open(osm_path, "w", encoding="utf-8") as f:
        f.write(network.to_json(indent=2))
    print(f"Serialized preprocessed OSM road network -> {osm_path}")

    # 2. Build and serialize the commuter trip dataset
    drivers, riders = generate_sf_study_dataset(network=network, seed=42)
    trips_data = {
        "metadata": {
            "study_area": "San Francisco Downtown / Financial District & SoMa",
            "driver_count": len(drivers),
            "rider_count": len(riders),
            "total_candidate_pairs": len(drivers) * len(riders),
            "created_seed": 42,
        },
        "drivers": [
            {
                "id": d.journey_id,
                "start": {"lat": d.start.latitude, "lon": d.start.longitude},
                "destination": {"lat": d.destination.latitude, "lon": d.destination.longitude},
                "departure_iso": d.departure.isoformat(),
                "capacity": d.vehicle.capacity,
                "route_nodes_count": len(d.route),
            }
            for d in drivers
        ],
        "riders": [
            {
                "id": r.journey_id,
                "start": {"lat": r.start.latitude, "lon": r.start.longitude},
                "destination": {"lat": r.destination.latitude, "lon": r.destination.longitude},
                "departure_iso": r.departure.isoformat(),
                "seats_requested": r.seats_requested,
            }
            for r in riders
        ],
    }
    trips_path = data_dir / "trips.json"
    with open(trips_path, "w", encoding="utf-8") as f:
        json.dump(trips_data, f, indent=2)
    print(f"Serialized commuter trips dataset -> {trips_path}")

    # 3. Run validation experiment
    print("\nRunning dual geometric & road-network feature extraction across candidate pairs...")
    report = run_road_network_validation_experiment(network=network, seed=42)

    # 4. Save results, metrics, manifest
    results_path, metrics_path, manifest_path = save_experiment_008_outputs(report, output_dir)
    print(f"Saved experiment results -> {results_path}")
    print(f"Saved metric tabular CSV -> {metrics_path}")
    print(f"Saved experiment manifest -> {manifest_path}")

    # 5. Display formatted summary
    print("\n" + "=" * 80)
    print("  EXPERIMENT 008: INFORMATION RETRIEVAL & RANKING EVALUATION")
    print("=" * 80)
    print(f"{'Approach / Method':<24} | {'P@1':<5} | {'P@3':<5} | {'R@3':<5} | {'NDCG@3':<6} | {'MRR':<5} | {'Coverage':<8} | {'Detour':<7}")
    print("-" * 80)
    for name, m in report.approach_metrics.items():
        print(f"{name:<24} | {m.precision_at_1:<5.3f} | {m.precision_at_3:<5.3f} | {m.recall_at_3:<5.3f} | {m.ndcg_at_3:<6.3f} | {m.mrr:<5.3f} | {m.candidate_coverage_pct:<7.1f}% | {m.mean_selected_detour_km:<5.2f}km")

    print("\n" + "=" * 80)
    print("  CONTROLLED ABLATION STUDY: FEATURE SET EVOLUTION")
    print("=" * 80)
    print(f"{'Ablation Stage':<24} | {'P@1':<5} | {'P@3':<5} | {'R@3':<5} | {'NDCG@3':<6} | {'MRR':<5} | {'Selected Detour':<15}")
    print("-" * 80)
    for name, m in report.ablation_metrics.items():
        print(f"{name:<24} | {m.precision_at_1:<5.3f} | {m.precision_at_3:<5.3f} | {m.recall_at_3:<5.3f} | {m.ndcg_at_3:<6.3f} | {m.mrr:<5.3f} | {m.mean_selected_detour_km:.2f}km ({m.mean_selected_detour_seconds:.0f}s)")

    da = report.disagreement_analysis
    print("\n" + "=" * 80)
    print("  DISAGREEMENT & DIVERGENCE ANALYSIS (GEOMETRIC VS. ROAD-NETWORK)")
    print("=" * 80)
    print(f"Total Candidate Pairs Evaluated:   {da.total_candidate_pairs}")
    print(f"Geometric Eligible Pairs:          {da.geometric_eligible_count}")
    print(f"Road-Network Eligible Pairs:       {da.network_eligible_count}")
    print(f"Ground-Truth Feasible Pairs:       {da.ground_truth_feasible_count}")
    print(f"Geometric False Positives:         {da.geometric_false_positives} pairs (passed geometry, failed network)")
    print(f"Feasibility Disagreement Rate:     {da.feasibility_disagreement_rate * 100:.1f}%")
    print(f"Unreachable / Disconnected Pairs:  {da.unreachable_pair_count} pairs (one-way opposing or dock spur)")
    print("-" * 80)
    print(f"Mean Top-3 Jaccard Similarity:     {da.mean_top3_jaccard_similarity:.3f} (1.0 = identical sets)")
    print(f"Mean Spearman Rank Correlation:    {da.mean_spearman_rank_correlation:.3f}")
    print(f"Top-1 Recommendation Disagreement: {da.top1_rank_disagreement_rate * 100:.1f}%")
    print(f"Pairwise Rank Inversion Rate:      {da.rank_inversion_rate * 100:.1f}%")
    print("-" * 80)
    print(f"Geometric Feature Latency:         {da.geometric_feature_latency_us:.1f} us / pair")
    print(f"Road Network Feature Latency:      {da.network_feature_latency_us:.1f} us / pair")
    print(f"Latency Slowdown Factor:           {da.latency_slowdown_factor:.1f}x")
    print("=" * 80)


if __name__ == "__main__":
    main()
