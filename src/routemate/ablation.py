"""Stage 5 controlled feature-contribution ablation.

Feasibility is computed once, before any ablated ranking.  Consequently an
ablation can change ordering only; it can never relax a safety or verification
gate.
"""
import argparse
import csv
import hashlib
import json
import platform
import sys
from pathlib import Path
from time import perf_counter

from .candidates import run_candidate_pipeline
from .experiment import evaluate
from .scoring import MAXIMUMS, WEIGHTS
from .synthetic import DATASET_VERSION, DEFAULT_SEEDS, LABEL_MODEL, SCENARIOS, generate_dataset

EXPERIMENT_VERSION = "ablation-experiment-v1"
CONFIGURATIONS = ("full", "route_removed", "temporal_removed", "context_removed")


def ranking_weights(configuration):
    """Return normalized explicit ranking weights for one configuration."""
    if configuration not in CONFIGURATIONS:
        raise ValueError("unknown configuration: " + str(configuration))
    weights = dict(WEIGHTS)
    if configuration == "route_removed":
        weights.pop("route_similarity", None)
        weights.pop("direction_similarity", None)
    elif configuration == "temporal_removed":
        weights.pop("departure_difference_min", None)
    # There is no context/verification contribution in the current heuristic.
    # Keep this explicit so the gate-only nature of this ablation is auditable.
    total = sum(weights.values())
    return {key: value / total for key, value in weights.items()}


def rank_configuration(decisions, configuration):
    """Rank the same already-eligible decisions with explicit feature scores."""
    weights = ranking_weights(configuration)

    def score(decision):
        raw = 0.0
        for key, weight in weights.items():
            value = decision.features[key]
            normalized = max(0.0, 1.0 - value / MAXIMUMS[key]) if key in MAXIMUMS else value
            raw += weight * normalized
        return raw

    return tuple(d.driver_id for d in sorted(
        (d for d in decisions if d.final_eligible),
        key=lambda d: (-score(d), d.driver_id)))


def _journey_snapshot(journey):
    return {"journey_id": journey.journey_id,
            "start": {"latitude": journey.start.latitude, "longitude": journey.start.longitude},
            "destination": {"latitude": journey.destination.latitude, "longitude": journey.destination.longitude},
            "departure": journey.departure.isoformat(),
            "route": [{"latitude": p.latitude, "longitude": p.longitude} for p in journey.route],
            "vehicle": {"kind": journey.vehicle.kind, "capacity": journey.vehicle.capacity,
                        "verified": journey.vehicle.verified},
            "verification": {"identity_verified": journey.verification.identity_verified,
                             "vehicle_verified": journey.verification.vehicle_verified,
                             "safety_flags": list(journey.verification.safety_flags)},
            "seats_requested": journey.seats_requested}


def run_ablation(output, seeds=DEFAULT_SEEDS, k=3, requests_per_scenario=20):
    out = Path(output)
    if out.exists() and any(out.iterdir()):
        raise FileExistsError("output directory must be absent or empty: " + str(out))
    out.mkdir(parents=True, exist_ok=True)
    queries = generate_dataset(seeds, requests_per_scenario)
    rows, timing_rows = [], []
    for query in queries:
        pipeline = run_candidate_pipeline(query.rider, query.drivers)
        candidate_seconds = (pipeline.retrieval_seconds + pipeline.feature_seconds +
                             pipeline.filtering_seconds)
        eligible = {d.driver_id for d in pipeline.feasibility_matrix if d.final_eligible}
        # This is deliberately based on hard filtering, not top-K ranking.
        lost = len(set(query.relevant_ids) - eligible)
        for configuration in CONFIGURATIONS:
            started = perf_counter()
            ranking = rank_configuration(pipeline.feasibility_matrix, configuration)
            ranking_seconds = perf_counter() - started
            metrics = evaluate(ranking, query.relevant_ids, pipeline.retrieved_count,
                               len(eligible), k)
            metrics["relevant_lost_to_filter"] = lost
            rows.append({"query_id": query.query_id, "seed": query.seed,
                         "scenario": query.scenario, "configuration": configuration,
                         "ranking": json.dumps(ranking), **metrics})
            timing_rows.append({"query_id": query.query_id, "seed": query.seed,
                                "scenario": query.scenario, "configuration": configuration,
                                "candidate_generation_seconds": candidate_seconds,
                                "ranking_seconds": ranking_seconds})

    metric_keys = ("precision_at_k", "recall_at_k", "ndcg_at_k", "coverage",
                   "candidate_count", "eligible_count", "relevant_count",
                   "relevant_lost_to_filter")
    aggregates = []
    for scenario, configuration in sorted({(r["scenario"], r["configuration"]) for r in rows}):
        group = [r for r in rows if r["scenario"] == scenario and r["configuration"] == configuration]
        aggregate = {"scenario": scenario, "configuration": configuration,
                     "queries": len(group),
                     "zero_relevant_queries": sum(bool(r["zero_relevant"]) for r in group)}
        for key in metric_keys:
            values = [r[key] for r in group if r[key] is not None]
            aggregate[key + "_mean"] = sum(values) / len(values) if values else None
        aggregates.append(aggregate)

    source_files = ["src/routemate/ablation.py", "src/routemate/candidates.py",
                    "src/routemate/synthetic.py", "src/routemate/experiment.py",
                    "src/routemate/features.py", "src/routemate/models.py",
                    "src/routemate/scoring.py"]
    hashes = {}
    for name in source_files:
        path = Path(__file__).resolve().parents[2] / name
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    manifest = {"experiment_version": EXPERIMENT_VERSION, "dataset_version": DATASET_VERSION,
                "label_model": LABEL_MODEL, "seeds": list(seeds), "scenarios": SCENARIOS,
                "requests_per_scenario": requests_per_scenario, "k": k,
                "configurations": list(CONFIGURATIONS), "ranking_weights":
                {name: ranking_weights(name) for name in CONFIGURATIONS},
                "hard_gates": ["identity verification", "vehicle verification", "safety flags",
                               "capacity", "direction compatibility", "pickup <=2km",
                               "destination <=3km", "departure <=30min", "detour <=5km"],
                "code_sha256": hashes, "python": sys.version, "platform": platform.platform(),
                "timing_note": "quality and ordering are deterministic; timing is machine-dependent",
                "context_ablation_note": "No context/verification ranking feature exists in the current heuristic; context_removed is gate-only and mathematically identical to full.",
                "privacy": "synthetic IDs and artificial coordinates only; no user locations/logs"}
    snapshot = [{"query_id": q.query_id, "seed": q.seed, "scenario": q.scenario,
                 "rider": _journey_snapshot(q.rider),
                 "drivers": [_journey_snapshot(d) for d in q.drivers],
                 "relevant_ids": list(q.relevant_ids), "latent": q.latent} for q in queries]
    snapshot_bytes = json.dumps(snapshot, indent=2, sort_keys=True).encode()
    (out / "synthetic_dataset.json").write_bytes(snapshot_bytes)
    manifest["synthetic_dataset_sha256"] = hashlib.sha256(snapshot_bytes).hexdigest()
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")

    def write_csv(name, data):
        with (out / name).open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(data[0]))
            writer.writeheader(); writer.writerows(data)
    write_csv("per_query.csv", rows)
    write_csv("metrics.csv", aggregates)
    write_csv("timing.csv", timing_rows)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--k", type=int, default=3)
    args = parser.parse_args(argv)
    run_ablation(args.output, k=args.k)


if __name__ == "__main__":
    main()
