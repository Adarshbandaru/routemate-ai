"""Reproducible synthetic baseline experiment and artifact writer."""
import argparse
import csv
import hashlib
import json
import platform
import sys
from pathlib import Path
from time import perf_counter

from .baselines import ALGORITHM_VERSION, METHODS, prepare_candidates, rank_candidates
from .synthetic import DATASET_VERSION, DEFAULT_SEEDS, LABEL_MODEL, SCENARIOS, generate_dataset

EXPERIMENT_VERSION = "baseline-experiment-v1"


def _ndcg(ranking, relevant, k):
    rel = set(relevant)
    dcg = sum((1.0 / __import__('math').log2(i + 2)) for i, x in enumerate(ranking[:k]) if x in rel)
    ideal = sum(1.0 / __import__('math').log2(i + 2) for i in range(min(k, len(rel))))
    return dcg / ideal if ideal else None


def evaluate(ranking, relevant_ids, candidate_count, eligible_count, k=3):
    """Metrics: fixed-K precision; recall/NDCG conditional on nonempty relevant."""
    relevant = set(relevant_ids)
    top = tuple(ranking[:k])
    hits = sum(x in relevant for x in top)
    positive = bool(relevant)
    return {"precision_at_k": hits / float(k),
            "recall_at_k": hits / len(relevant) if positive else None,
            "ndcg_at_k": _ndcg(top, relevant, k) if positive else None,
            "coverage": eligible_count / candidate_count if candidate_count else 0.0,
            "candidate_count": candidate_count, "eligible_count": eligible_count,
            "relevant_count": len(relevant),
            "relevant_lost_to_filter": sum(x not in set(ranking) for x in relevant),
            "zero_relevant": not positive}


def run_experiment(output, seeds=DEFAULT_SEEDS, k=3, requests_per_scenario=20):
    out = Path(output)
    if out.exists() and any(out.iterdir()):
        raise FileExistsError("output directory must be absent or empty: " + str(out))
    out.mkdir(parents=True, exist_ok=True)
    queries = generate_dataset(seeds, requests_per_scenario)
    rows, timing_rows = [], []
    for query in queries:
        pool = prepare_candidates(query.rider, query.drivers)
        for method in METHODS:
            started = perf_counter()
            ranking = rank_candidates(pool, method, seed=query.seed)
            ranking_seconds = perf_counter() - started
            metrics = evaluate(ranking, query.relevant_ids, len(pool.candidates), len(pool.eligible), k)
            rows.append({"query_id": query.query_id, "seed": query.seed,
                         "scenario": query.scenario, "method": method,
                         "ranking": json.dumps(ranking), **metrics})
            timing_rows.append({"query_id": query.query_id, "method": method,
                                "preprocessing_seconds": pool.preprocessing_seconds,
                                "ranking_seconds": ranking_seconds})
    metric_keys = ("precision_at_k", "recall_at_k", "ndcg_at_k", "coverage",
                   "candidate_count", "eligible_count", "relevant_count", "relevant_lost_to_filter")
    aggregates = []
    groups = sorted(set((r["scenario"], r["method"]) for r in rows))
    for scenario, method in groups:
        group = [r for r in rows if r["scenario"] == scenario and r["method"] == method]
        aggregate = {"scenario": scenario, "method": method, "queries": len(group),
                     "zero_relevant_queries": sum(r["zero_relevant"] for r in group)}
        for key in metric_keys:
            vals = [r[key] for r in group if r[key] is not None]
            aggregate[key + "_mean"] = sum(vals) / len(vals) if vals else None
        aggregates.append(aggregate)
    source_files = ["src/routemate/baselines.py", "src/routemate/synthetic.py",
                    "src/routemate/experiment.py", "src/routemate/geometry.py",
                    "src/routemate/features.py", "src/routemate/models.py",
                    "src/routemate/scoring.py"]
    hashes = {}
    for name in source_files:
        p = Path(__file__).resolve().parents[2] / name
        hashes[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    manifest = {"experiment_version": EXPERIMENT_VERSION, "algorithm_version": ALGORITHM_VERSION,
                "dataset_version": DATASET_VERSION, "label_model": LABEL_MODEL,
                "seeds": list(seeds), "scenarios": SCENARIOS, "requests_per_scenario": requests_per_scenario,
                "k": k, "source_label": LABEL_MODEL["source"], "python": sys.version,
                "platform": platform.platform(), "code_sha256": hashes,
                "method_timing_note": "quality is deterministic; timing is recorded separately and may vary",
                "privacy": "synthetic IDs and artificial coordinates only; no user locations/logs"}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    def journey_snapshot(journey):
        return {"journey_id": journey.journey_id,
                "start": {"latitude": journey.start.latitude, "longitude": journey.start.longitude},
                "destination": {"latitude": journey.destination.latitude,
                                "longitude": journey.destination.longitude},
                "departure": journey.departure.isoformat(),
                "route": [{"latitude": point.latitude, "longitude": point.longitude}
                          for point in journey.route],
                "vehicle": {"kind": journey.vehicle.kind,
                            "capacity": journey.vehicle.capacity,
                            "verified": journey.vehicle.verified},
                "verification": {"identity_verified": journey.verification.identity_verified,
                                 "vehicle_verified": journey.verification.vehicle_verified,
                                 "safety_flags": list(journey.verification.safety_flags)},
                "seats_requested": journey.seats_requested}

    snapshot = [{"query_id": q.query_id, "seed": q.seed, "scenario": q.scenario,
                 "rider": journey_snapshot(q.rider),
                 "drivers": [journey_snapshot(d) for d in q.drivers],
                 "relevant_ids": list(q.relevant_ids), "latent": q.latent} for q in queries]
    snapshot_bytes = json.dumps(snapshot, indent=2, sort_keys=True).encode()
    (out / "synthetic_dataset.json").write_bytes(snapshot_bytes)
    manifest["synthetic_dataset_sha256"] = hashlib.sha256(snapshot_bytes).hexdigest()
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    def write_csv(name, data):
        with (out / name).open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(data[0]), extrasaction="ignore")
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
    run_experiment(args.output, k=args.k)


if __name__ == "__main__":
    main()
