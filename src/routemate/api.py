"""Small dependency-free local JSON API for the RouteMate matching and batch assignment core.

This service is a prototype boundary, not a production deployment. Callers
must still add authentication, authorization, rate limiting, audit storage,
TLS, and privacy controls before exposing it beyond localhost.
"""
import argparse
import json
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Mapping

from .assignment import run_assignment
from .candidates import run_candidate_pipeline
from .geometry import Coordinate
from .ml import FEATURE_NAMES, features_for_decision, LogisticRanker
from .models import Journey, Vehicle, VerificationContext
from .road_benchmark import run_road_network_benchmark
from .routing import (
    DeterministicGeometricRouter,
    NetworkGraphRouter,
    RouteQuery,
    create_urban_grid_network,
)

API_VERSION = "local-api-v1"


def _get_router(name):
    if name is None:
        return None
    if name == "urban_grid":
        return NetworkGraphRouter(create_urban_grid_network())
    if name == "geometric":
        return DeterministicGeometricRouter()
    raise ValueError(f"unknown routing provider: {name}")


def _coordinate(value):
    if not isinstance(value, Mapping):
        raise ValueError("coordinate must be an object")
    return Coordinate(value["latitude"], value["longitude"])


def _journey(value, role):
    if not isinstance(value, Mapping):
        raise ValueError(role + " must be an object")
    route = tuple(_coordinate(point) for point in value["route"])
    vehicle_data = value.get("vehicle", {})
    verification_data = value.get("verification", {})
    departure = datetime.fromisoformat(value["departure"].replace("Z", "+00:00"))
    return Journey(
        value["journey_id"],
        _coordinate(value["start"]),
        _coordinate(value["destination"]),
        departure,
        route,
        Vehicle(
            vehicle_data.get("kind", "car"),
            vehicle_data.get("capacity", 0),
            vehicle_data.get("verified", False),
        ),
        VerificationContext(
            verification_data.get("identity_verified", False),
            verification_data.get("vehicle_verified", False),
            tuple(verification_data.get("safety_flags", ())),
        ),
        value.get("seats_requested", 1),
    )


def match(payload, model_path=None, top_k=3):
    """Validate, filter, and rank one rider against provider journeys."""
    if not isinstance(payload, Mapping):
        raise ValueError("request body must be an object")
    if type(top_k) is not int or not 1 <= top_k <= 50:
        raise ValueError("top_k must be an integer between 1 and 50")
    rider = _journey(payload["rider"], "rider")
    drivers = tuple(_journey(item, "driver") for item in payload["drivers"])
    router = _get_router(payload.get("routing_provider"))
    pipeline = run_candidate_pipeline(rider, drivers, router=router)
    decisions = pipeline.feasibility_matrix
    eligible = [d for d in decisions if d.final_eligible]
    driver_by_id = {pair.driver_id: pair.driver for pair in pipeline.retrieved_pairs}
    if model_path:
        model = LogisticRanker.load(model_path)
        rows = [features_for_decision(d, rider, driver_by_id[d.driver_id]) for d in eligible]
        ranking = model.rank(rows, [d.driver_id for d in eligible])
        rank_method = "artifact_logistic"
        scores = dict(zip([d.driver_id for d in eligible], model.predict_proba(rows)))
    else:
        ranking = tuple(d.driver_id for d in sorted(eligible, key=lambda d: (-d.score, d.driver_id)))
        rank_method = "route_time_heuristic"
        scores = {d.driver_id: d.score / 100.0 for d in eligible}
    matrix = []
    for decision in decisions:
        matrix.append({
            "driver_id": decision.driver_id,
            "final_eligible": decision.final_eligible,
            "checks": {name: getattr(decision, name) for name in (
                "route_direction_compatible", "pickup_distance_eligible",
                "destination_distance_eligible", "departure_time_eligible",
                "detour_eligible", "identity_verification",
                "vehicle_verification", "capacity_eligible")},
            "features": dict(decision.features),
            "score": decision.score,
            "rejection_reasons": list(decision.rejection_reasons),
        })
    recommendations = []
    by_id = {d.driver_id: d for d in decisions}
    for position, driver_id in enumerate(ranking[:top_k], 1):
        decision = by_id[driver_id]
        recommendations.append({
            "driver_id": driver_id,
            "rank": position,
            "score": scores[driver_id],
            "explanation": {
                "features": dict(decision.features),
                "reasons": ["passed all mandatory feasibility checks"],
            },
        })
    return {
        "api_version": API_VERSION,
        "rank_method": rank_method,
        "top_k": top_k,
        "retrieved_count": pipeline.retrieved_count,
        "eligible_count": len(eligible),
        "recommendations": recommendations,
        "feasibility_matrix": matrix,
        "timing_seconds": {
            "retrieval": pipeline.retrieval_seconds,
            "features": pipeline.feature_seconds,
            "filtering": pipeline.filtering_seconds,
        },
    }


def batch_assignment(payload):
    """Solve multi-rider batch assignment over riders and drivers."""
    if not isinstance(payload, Mapping):
        raise ValueError("request body must be an object")
    if "riders" not in payload or "drivers" not in payload:
        raise ValueError("payload must include 'riders' and 'drivers'")
    riders = tuple(_journey(item, "rider") for item in payload["riders"])
    drivers = tuple(_journey(item, "driver") for item in payload["drivers"])
    method = payload.get("method", "greedy")
    router = _get_router(payload.get("routing_provider"))
    res = run_assignment(riders, drivers, method=method, router=router)
    return {
        "api_version": API_VERSION,
        "method": res.method,
        "matched_rider_count": res.matched_rider_count,
        "matched_driver_count": res.matched_driver_count,
        "objective_value": res.objective_value,
        "total_pairs": res.total_pairs,
        "feasible_edges": res.feasible_edges,
        "unmatched_rider_ids": list(res.unmatched_rider_ids),
        "unmatched_driver_ids": list(res.unmatched_driver_ids),
        "groups": [
            {
                "driver_id": g.driver_id,
                "rider_ids": list(g.rider_ids),
                "seats_used": g.seats_used,
                "remaining_capacity": g.remaining_capacity,
                "group_score": g.group_score,
            }
            for g in res.groups
        ],
        "timing_seconds": {
            "graph": round(res.graph_seconds, 4),
            "solve": round(res.solve_seconds, 4),
        },
    }


def road_benchmark_summary(max_pairs=30):
    """Run deterministic road network circuity benchmark on urban grid."""
    metrics = run_road_network_benchmark(max_pairs=max_pairs)
    return {
        "api_version": API_VERSION,
        "total_pairs_evaluated": metrics.total_pairs_evaluated,
        "mean_circuity_factor": metrics.mean_circuity_factor,
        "max_circuity_factor": metrics.max_circuity_factor,
        "min_circuity_factor": metrics.min_circuity_factor,
        "mean_euclidean_distance_km": metrics.mean_euclidean_distance_km,
        "mean_road_distance_km": metrics.mean_road_distance_km,
        "mean_geometric_detour_km": metrics.mean_geometric_detour_km,
        "mean_road_detour_km": metrics.mean_road_detour_km,
        "mean_detour_underestimation_km": metrics.mean_detour_underestimation_km,
        "feasibility_disagreement_count": metrics.feasibility_disagreement_count,
        "feasibility_disagreement_rate": metrics.feasibility_disagreement_rate,
    }


def compute_route(payload):
    """Compute road-network route between origin and destination."""
    if not isinstance(payload, Mapping):
        raise ValueError("request body must be an object")
    if "origin" not in payload or "destination" not in payload:
        raise ValueError("payload must include 'origin' and 'destination'")
    origin = _coordinate(payload["origin"])
    dest = _coordinate(payload["destination"])
    waypoints = tuple(_coordinate(wp) for wp in payload.get("waypoints", ()))
    provider_name = payload.get("provider", "urban_grid")
    router = _get_router(provider_name)
    if router is None:
        router = DeterministicGeometricRouter()
    query = RouteQuery(origin=origin, destination=dest, waypoints=waypoints)
    result = router.route(query)
    return {
        "api_version": API_VERSION,
        "provider": result.provider,
        "distance_km": result.distance_km,
        "duration_seconds": result.duration_seconds,
        "status": result.status,
        "route": [{"latitude": p.latitude, "longitude": p.longitude} for p in result.route],
        "metadata": dict(result.metadata),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "RouteMatePrototype/1"

    def _send(self, status, value=None):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        if value is not None:
            body = json.dumps(value, sort_keys=True).encode()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_header("Content-Length", "0")
            self.end_headers()

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        if self.path == "/health":
            self._send(200, {"status": "ok", "api_version": API_VERSION})
        elif self.path == "/v1/road-benchmark":
            self._send(200, road_benchmark_summary())
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/v1/matches", "/v1/assignments", "/v1/routes"):
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 524288:
                self._send(413, {"error": "body must be between 1 and 524288 bytes"})
                return
            self.connection.settimeout(5)
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("request body must be an object")
            if self.path == "/v1/matches":
                result = match(payload, getattr(self.server, "model_path", None), payload.get("top_k", 3))
            elif self.path == "/v1/assignments":
                result = batch_assignment(payload)
            elif self.path == "/v1/routes":
                result = compute_route(payload)
            self._send(200, result)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            self._send(400, {"error": "invalid request", "detail": str(exc)})
        except Exception:
            self._send(500, {"error": "internal error"})

    def log_message(self, *_):
        return


def serve(host="127.0.0.1", port=8000, model_path=None):
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("prototype service must bind to loopback")
    server = ThreadingHTTPServer((host, port), Handler)
    server.model_path = model_path
    print(f"RouteMate local API listening on http://{host}:{port}")
    server.serve_forever()


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--model")
    args = parser.parse_args(argv)
    serve(args.host, args.port, args.model)


if __name__ == "__main__":
    main()
