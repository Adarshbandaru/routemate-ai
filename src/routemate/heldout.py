"""Experiment 004: a second, synthetic label model held out from ranking.

This is deliberately a label-only transformation of the existing synthetic
queries.  The original labels are retained for audit, but are never consulted
by candidate preparation or ranking.
"""
import argparse
import csv
import hashlib
import json
import math
import platform
import random
import sys
from pathlib import Path
from time import perf_counter

from .ablation import rank_configuration
from .candidates import run_candidate_pipeline
from .experiment import evaluate
from .features import calculate_features
from .baselines import METHODS
from .synthetic import DATASET_VERSION, SCENARIOS, generate_dataset

HELDOUT_SEEDS = (101, 202, 303)
EXPERIMENT_VERSION = "heldout-experiment-v1"
HELDOUT_LABEL_MODEL = {
    "source": "synthetic_heldout_non_linear_mobility_preferences",
    "rng_stream": "heldout-labels:{seed}:{scenario}",
    "formula": "p=clip(0.02+0.94*sigmoid(1.65*(utility-0.45)),0.01,0.97); utility=(0.27*(1-d/td)^2+0.20*(1-dest/3)^1.5+0.18*direction^3+0.13*(1-time/30)^2+0.12*slack/(slack+2)+0.10*reliability), multiplied by route_shape_acceptance",
    "features": ["normalized geometric detour", "destination distance", "direction similarity", "departure difference", "provider capacity slack", "provider-specific latent reliability", "route-shape acceptance"],
    "label": "synthetic Bernoulli draw; original query.relevant_ids is not used",
}


def _sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, x))))


def generate_heldout_labels(queries):
    """Return held-out labels and auditable draws, deterministically."""
    labels = {}
    details = {}
    for q in queries:
        rng = random.Random(f"heldout-labels:{q.seed}:{q.scenario}")
        detour_tolerance = rng.uniform(2.0, 5.0)
        route_shape_tolerance = rng.uniform(0.48, 0.92)
        accepted, rows = [], []
        for driver in q.drivers:
            f = calculate_features(driver, q.rider)
            reliability = rng.uniform(0.35, 0.98)
            draw = rng.random()
            detour_fit = max(0.0, 1.0 - f["detour_km"] / detour_tolerance)
            destination_fit = max(0.0, 1.0 - f["destination_distance_km"] / 3.0)
            time_fit = max(0.0, 1.0 - f["departure_difference_min"] / 30.0)
            slack = max(0, driver.vehicle.capacity - q.rider.seats_requested)
            utility = (0.27 * detour_fit ** 2 + 0.20 * destination_fit ** 1.5 +
                       0.18 * f["direction_similarity"] ** 3 + 0.13 * time_fit ** 2 +
                       0.12 * (slack / (slack + 2.0)) + 0.10 * reliability)
            shape_factor = max(0.0, min(1.0, f["route_similarity"] / route_shape_tolerance))
            probability = max(0.01, min(0.97, (0.02 + 0.94 * _sigmoid(1.65 * (utility - 0.45))) * shape_factor))
            relevant = draw < probability
            if relevant:
                accepted.append(driver.journey_id)
            rows.append({"journey_id": driver.journey_id, "features": f,
                         "capacity_slack": slack, "reliability": reliability,
                         "utility": utility, "route_shape_factor": shape_factor,
                         "probability": probability, "bernoulli_draw": draw,
                         "relevant": relevant})
        labels[q.query_id] = tuple(accepted)
        details[q.query_id] = {"detour_tolerance_km": detour_tolerance,
                               "route_shape_tolerance": route_shape_tolerance,
                               "candidates": rows}
    return labels, details


def _rank(decisions, method, seed):
    eligible = [d for d in decisions if d.final_eligible]
    if method == "route_time":
        # Existing full configuration is the route/time heuristic ranking.
        return rank_configuration(decisions, "full")
    if method == "seeded_random":
        rng = random.Random(f"heldout-ranking:{seed}")
        priorities = {d.driver_id: rng.random() for d in sorted(eligible, key=lambda x: x.driver_id)}
        return tuple(d.driver_id for d in sorted(eligible, key=lambda d: (priorities[d.driver_id], d.driver_id)))
    if method == "nearest_neighbour":
        key = lambda d: (d.features["pickup_distance_km"], d.driver_id)
    elif method == "distance_destination":
        key = lambda d: (d.features["pickup_distance_km"] + d.features["destination_distance_km"], d.driver_id)
    else:
        raise ValueError("unknown heldout method: " + method)
    return tuple(d.driver_id for d in sorted(eligible, key=key))


def _snapshot(j):
    return {"journey_id": j.journey_id, "start": {"latitude": j.start.latitude, "longitude": j.start.longitude},
            "destination": {"latitude": j.destination.latitude, "longitude": j.destination.longitude},
            "departure": j.departure.isoformat(), "route": [{"latitude": p.latitude, "longitude": p.longitude} for p in j.route],
            "vehicle": {"kind": j.vehicle.kind, "capacity": j.vehicle.capacity, "verified": j.vehicle.verified},
            "verification": {"identity_verified": j.verification.identity_verified, "vehicle_verified": j.verification.vehicle_verified,
                             "safety_flags": list(j.verification.safety_flags)}, "seats_requested": j.seats_requested}


def run_heldout(output, seeds=HELDOUT_SEEDS, k=3, requests_per_scenario=20):
    seeds = tuple(seeds)
    if seeds != HELDOUT_SEEDS:
        raise ValueError("Experiment 004 requires held-out seeds (101, 202, 303)")
    if k != 3:
        raise ValueError("Experiment 004 requires k=3")
    out = Path(output)
    if out.exists() and any(out.iterdir()):
        raise FileExistsError("output directory must be absent or empty: " + str(out))
    out.mkdir(parents=True, exist_ok=True)
    queries = generate_dataset(seeds, requests_per_scenario)
    heldout, label_details = generate_heldout_labels(queries)
    rows, timing = [], []
    methods = tuple(METHODS)
    for q in queries:
        started = perf_counter(); pipeline = run_candidate_pipeline(q.rider, q.drivers)
        candidate_seconds = perf_counter() - started
        eligible = {d.driver_id for d in pipeline.feasibility_matrix if d.final_eligible}
        lost = len(set(heldout[q.query_id]) - eligible)
        for method in methods:
            start = perf_counter(); ranking = _rank(pipeline.feasibility_matrix, method, q.seed)
            ranking_seconds = perf_counter() - start
            metrics = evaluate(ranking, heldout[q.query_id], pipeline.retrieved_count, len(eligible), k)
            top = ranking[:k]; utilities = {x["journey_id"]: x["utility"] for x in label_details[q.query_id]["candidates"]}
            quality = sum(utilities[x] for x in top if x in utilities) / k
            rows.append({"query_id": q.query_id, "seed": q.seed, "scenario": q.scenario, "method": method,
                         "ranking": json.dumps(ranking), "pre_filter_heldout_relevant_count": len(heldout[q.query_id]),
                         "relevant_lost_to_hard_filter": lost, "deterministic_quality_at_3": quality, **metrics})
            timing.append({"query_id": q.query_id, "seed": q.seed, "scenario": q.scenario, "method": method,
                           "candidate_generation_seconds": candidate_seconds, "ranking_seconds": ranking_seconds})
    aggregates = []
    keys = ("precision_at_k", "recall_at_k", "ndcg_at_k", "coverage", "candidate_count", "eligible_count",
            "relevant_count", "pre_filter_heldout_relevant_count", "relevant_lost_to_hard_filter", "deterministic_quality_at_3")
    for scenario, method in sorted({(r["scenario"], r["method"]) for r in rows}):
        group = [r for r in rows if r["scenario"] == scenario and r["method"] == method]
        a = {"scenario": scenario, "method": method, "queries": len(group), "zero_relevant_queries": sum(r["zero_relevant"] for r in group)}
        for key in keys:
            vals = [r[key] for r in group if r[key] is not None]; a[key + "_mean"] = sum(vals) / len(vals) if vals else None
        aggregates.append(a)
    source_files = ["src/routemate/heldout.py", "src/routemate/synthetic.py", "src/routemate/candidates.py", "src/routemate/experiment.py", "src/routemate/ablation.py", "src/routemate/features.py", "src/routemate/models.py"]
    root = Path(__file__).resolve().parents[2]
    hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in source_files}
    snapshot = [{"query_id": q.query_id, "seed": q.seed, "scenario": q.scenario, "rider": _snapshot(q.rider), "drivers": [_snapshot(d) for d in q.drivers],
                 "original_label": {"type": "synthetic_original", "relevant_ids": list(q.relevant_ids)},
                 "heldout_label": {"type": "synthetic_heldout", "relevant_ids": list(heldout[q.query_id])},
                 "original_relevant_ids": list(q.relevant_ids), "heldout_relevant_ids": list(heldout[q.query_id]), "heldout_latent": label_details[q.query_id]} for q in queries]
    data = json.dumps(snapshot, indent=2, sort_keys=True).encode(); (out / "synthetic_dataset.json").write_bytes(data)
    manifest = {"experiment_version": EXPERIMENT_VERSION, "dataset_version": DATASET_VERSION, "label_model": HELDOUT_LABEL_MODEL,
                "seeds": list(seeds), "scenarios": SCENARIOS, "requests_per_scenario": requests_per_scenario, "k": k,
                "methods": list(methods), "original_label_type": "synthetic_original", "heldout_label_type": "synthetic_heldout",
                "hard_gates": ["identity verification", "vehicle verification", "safety flags", "capacity", "direction compatibility", "pickup <=2km", "destination <=3km", "departure <=30min", "detour <=5km"],
                "code_sha256": hashes, "synthetic_dataset_sha256": hashlib.sha256(data).hexdigest(), "python": sys.version, "platform": platform.platform(),
                "timing_note": "quality is deterministic; timing is machine-dependent", "privacy": "synthetic IDs and artificial coordinates only; no private environment variables"}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    def write(name, values):
        with (out / name).open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(values[0])); w.writeheader(); w.writerows(values)
    write("per_query.csv", rows); write("metrics.csv", aggregates); write("timing.csv", timing)
    return manifest


def main(argv=None):
    p = argparse.ArgumentParser(); p.add_argument("--output", required=True); args = p.parse_args(argv)
    run_heldout(args.output)


if __name__ == "__main__":
    main()
