"""Deterministic robustness benchmark for synthetic route matching.

Perturbations are deliberately evaluated against the original labels and pool;
they are sensitivity measurements, not counterfactual acceptance labels.
"""
import argparse
import csv
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

from .ablation import rank_configuration
from .candidates import run_candidate_pipeline
from .experiment import evaluate
from .perturbations import CONDITIONS, PARAMETERS, PERTURBATION_VERSION, perturb_query
from .synthetic import DATASET_VERSION, DEFAULT_SEEDS, LABEL_MODEL, SCENARIOS, generate_dataset

ROBUSTNESS_VERSION = "robustness-v1"
PROVIDER = "full"


def _journey(j):
    return {"journey_id": j.journey_id,
            "start": {"latitude": j.start.latitude, "longitude": j.start.longitude},
            "destination": {"latitude": j.destination.latitude, "longitude": j.destination.longitude},
            "departure": j.departure.isoformat(),
            "route": [{"latitude": p.latitude, "longitude": p.longitude} for p in j.route],
            "vehicle": {"kind": j.vehicle.kind, "capacity": j.vehicle.capacity, "verified": j.vehicle.verified},
            "verification": {"identity_verified": j.verification.identity_verified,
                             "vehicle_verified": j.verification.vehicle_verified,
                             "safety_flags": list(j.verification.safety_flags)},
            "seats_requested": j.seats_requested}


def _snapshot(q):
    return {"query_id": q.query_id, "seed": q.seed, "scenario": q.scenario,
            "rider": _journey(q.rider), "drivers": [_journey(d) for d in q.drivers],
            "relevant_ids": list(q.relevant_ids), "latent": q.latent}


def _write_csv(path, rows):
    if not rows:
        rows = [{"empty": ""}]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]), extrasaction="ignore")
        writer.writeheader(); writer.writerows(rows)


def _validate(seeds, k, count):
    if type(k) is not int or k <= 0:
        raise ValueError("k must be positive")
    seeds = tuple(seeds)
    if not seeds or len(seeds) != len(set(seeds)) or any(type(s) is not int for s in seeds):
        raise ValueError("seeds must be nonempty, unique integers")
    if type(count) is not int or count <= 0:
        raise ValueError("requests_per_scenario must be positive")
    return seeds


def _mean(rows, key):
    values = [r[key] for r in rows if r.get(key) not in (None, "")]
    return sum(values) / len(values) if values else None


def run_robustness(output, seeds=DEFAULT_SEEDS, k=3, requests_per_scenario=20):
    seeds = _validate(seeds, k, requests_per_scenario)
    out = Path(output)
    if out.exists() and any(out.iterdir()):
        raise FileExistsError("output directory must be absent or empty: " + str(out))
    out.mkdir(parents=True, exist_ok=True)
    originals = generate_dataset(seeds, requests_per_scenario)
    perturbed = {(q.query_id, c): perturb_query(q, c) for q in originals for c in CONDITIONS}
    per_query, matrix_rows, timing = [], [], []
    for original in originals:
        base = run_candidate_pipeline(original.rider, original.drivers)
        original_ids = {d.journey_id for d in original.drivers}
        base_eligible = set(base.eligible_ids)
        control_top = rank_configuration(base.feasibility_matrix, "full")
        for condition in CONDITIONS:
            q = perturbed[(original.query_id, condition)]
            available = {d.journey_id for d in q.drivers}
            t0 = perf_counter(); pipeline = run_candidate_pipeline(q.rider, q.drivers)
            retrieval_s = pipeline.retrieval_seconds
            feature_s = pipeline.feature_seconds
            filter_s = pipeline.filtering_seconds
            t1 = perf_counter(); ranking = rank_configuration(pipeline.feasibility_matrix, "full"); ranking_s = perf_counter() - t1
            eligible = set(pipeline.eligible_ids)
            control_relevant = set(original.relevant_ids)
            top = tuple(ranking[:k])
            intersect = original_ids & available
            control_reasons = {d.driver_id: set(d.rejection_reasons) for d in base.feasibility_matrix}
            reasons = {d.driver_id: set(d.rejection_reasons) for d in pipeline.feasibility_matrix}
            reason_changes = sum(control_reasons[x] != reasons[x] for x in intersect if x in reasons)
            lost_avail = control_relevant - available
            lost_hard = (control_relevant & available) - eligible
            evaluation = evaluate(ranking, original.relevant_ids, len(original_ids), len(pipeline.eligible_ids), k)
            # Report filtering loss as hard-filter loss, not top-K absence.
            evaluation["relevant_lost_to_filter"] = len(lost_hard)
            row = {"query_id": original.query_id, "seed": original.seed, "scenario": original.scenario,
                   "provider": PROVIDER, "condition": condition, "ranking": json.dumps(ranking),
                   **evaluation, "eligible_coverage_original": len(eligible) / len(original_ids) if original_ids else 0.0,
                   "eligible_coverage_available": len(eligible) / len(available) if available else None,
                   "retrieval_recall_available": len({p.driver_id for p in pipeline.retrieved_pairs} & available) / len(available) if available else None,
                   "eligible_retention_vs_control": len(eligible & base_eligible) / len(base_eligible) if base_eligible else None,
                   "newly_eligible": len(eligible - base_eligible), "top3_overlap_vs_control": len(set(top) & set(control_top)) / len(control_top) if control_top else None,
                   "relevant_lost_availability": len(lost_avail), "relevant_lost_hard_filter": len(lost_hard),
                   "rejection_reason_changes_intersecting": reason_changes,
                   "available_count": len(available), "original_pool_count": len(original_ids),
                   "not_evaluated": False}
            per_query.append(row)
            for d in pipeline.feasibility_matrix:
                matrix_rows.append({"query_id": original.query_id, "seed": original.seed, "scenario": original.scenario,
                                    "provider": PROVIDER, "condition": condition, "driver_id": d.driver_id,
                                    "available": True, "evaluated": True, "route_direction_compatible": d.route_direction_compatible,
                                    "pickup_distance_eligible": d.pickup_distance_eligible, "destination_distance_eligible": d.destination_distance_eligible,
                                    "departure_time_eligible": d.departure_time_eligible, "detour_eligible": d.detour_eligible,
                                    "identity_verification": d.identity_verification, "vehicle_verification": d.vehicle_verification,
                                    "capacity_eligible": d.capacity_eligible, "final_eligible": d.final_eligible,
                                    "rejection_reasons": json.dumps(d.rejection_reasons), "features": json.dumps(dict(d.features), sort_keys=True)})
            for did in sorted(original_ids - available):
                matrix_rows.append({"query_id": original.query_id, "seed": original.seed, "scenario": original.scenario,
                                    "provider": PROVIDER, "condition": condition, "driver_id": did,
                                    "available": False, "evaluated": False, "not_evaluated": True,
                                    "rejection_reasons": "unavailable"})
            timing.append({"query_id": original.query_id, "seed": original.seed, "scenario": original.scenario,
                           "provider": PROVIDER, "condition": condition, "retrieval_seconds": retrieval_s,
                           "feature_seconds": feature_s, "filter_seconds": filter_s, "ranking_seconds": ranking_s,
                           "measurement_seconds": perf_counter() - t0})
    metrics = []
    keys = ["precision_at_k", "recall_at_k", "ndcg_at_k", "eligible_coverage_original", "eligible_coverage_available",
            "retrieval_recall_available", "eligible_retention_vs_control", "newly_eligible", "top3_overlap_vs_control",
            "relevant_lost_availability", "relevant_lost_hard_filter"]
    for scenario in SCENARIOS:
        for condition in CONDITIONS:
            group = [r for r in per_query if r["scenario"] == scenario and r["condition"] == condition]
            metric = {"scenario": scenario, "condition": condition, "provider": PROVIDER,
                      "queries": len(group), "seed_count": len(seeds)}
            for key in keys:
                metric[key + "_mean"] = _mean(group, key)
                metric["excluded_denominator_" + key] = sum(r.get(key) is None for r in group)
            metrics.append(metric)
    source_root = Path(__file__).resolve().parent
    hashes = {"src/routemate/" + p.name: hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(source_root.glob("*.py"))}
    original_bytes = json.dumps([_snapshot(q) for q in originals], indent=2, sort_keys=True).encode()
    pert_bytes = json.dumps([_snapshot(perturbed[(q.query_id, c)]) for q in originals for c in CONDITIONS], indent=2, sort_keys=True).encode()
    (out / "original_dataset.json").write_bytes(original_bytes)
    (out / "perturbed_dataset.json").write_bytes(pert_bytes)
    manifest = {"robustness_version": ROBUSTNESS_VERSION, "perturbation_version": PERTURBATION_VERSION,
                "parameters": PARAMETERS, "conditions": list(CONDITIONS), "provider": PROVIDER,
                "dataset_version": DATASET_VERSION, "label_model": LABEL_MODEL, "seeds": list(seeds),
                "scenarios": SCENARIOS, "requests_per_scenario": requests_per_scenario, "k": k,
                "code_sha256": hashes, "original_dataset_sha256": hashlib.sha256(original_bytes).hexdigest(),
                "perturbed_dataset_sha256": hashlib.sha256(pert_bytes).hexdigest(), "python": sys.version,
                 "platform": platform.platform(),
                 "environment": {"python": sys.version, "platform": platform.platform()},
                "utc_run_time": datetime.now(timezone.utc).isoformat(),
                "labels_note": "Original labels are frozen sensitivity labels, not counterfactual acceptance."}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    _write_csv(out / "per_query.csv", per_query); _write_csv(out / "metrics.csv", metrics)
    _write_csv(out / "feasibility_matrix.csv", matrix_rows); _write_csv(out / "timing.csv", timing)
    return manifest


def main(argv=None):
    p = argparse.ArgumentParser(); p.add_argument("--output", required=True); p.add_argument("--k", type=int, default=3)
    p.add_argument("--requests-per-scenario", type=int, default=20); args = p.parse_args(argv)
    run_robustness(args.output, k=args.k, requests_per_scenario=args.requests_per_scenario)


if __name__ == "__main__":
    main()
