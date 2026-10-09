import json, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path
from routemate.api import (
    batch_assignment,
    match,
    road_benchmark_summary,
    compute_route,
    get_experiments_summary,
    get_experiment_detail,
    simulate_dispatch,
)
from routemate.ml import LogisticRanker, FEATURE_NAMES

def journey(identifier, x=0.0, verified=True, capacity=2):
    route = [{"latitude": 0.0, "longitude": x}, {"latitude": 0.0, "longitude": x + 0.01}]
    return {"journey_id": identifier, "start": route[0], "destination": route[1],
            "departure": "2026-01-01T08:00:00+00:00", "route": route,
            "vehicle": {"kind": "car", "capacity": capacity, "verified": verified},
            "verification": {"identity_verified": verified, "vehicle_verified": verified,
                             "safety_flags": []}, "seats_requested": 1}

class ApiTests(unittest.TestCase):
    def test_match_returns_matrix_and_explanation(self):
        result = match({"rider": journey("r"), "drivers": [journey("b", .0001), journey("bad", 1.0)]})
        self.assertEqual(result["api_version"], "local-api-v1")
        self.assertEqual(result["recommendations"][0]["driver_id"], "b")
        self.assertEqual(len(result["feasibility_matrix"]), 2)
        bad = next(row for row in result["feasibility_matrix"] if row["driver_id"] == "bad")
        self.assertFalse(bad["final_eligible"])
        self.assertTrue(bad["rejection_reasons"])

    def test_unverified_driver_never_recommended(self):
        result = match({"rider": journey("r"), "drivers": [journey("bad", .0001, False)]})
        self.assertEqual(result["recommendations"], [])
        self.assertFalse(result["feasibility_matrix"][0]["final_eligible"])

    def test_artifact_ranking(self):
        X = [{name: float(i + j) for j, name in enumerate(FEATURE_NAMES)} for i in (0, 1)]
        model = LogisticRanker(epochs=5).fit(X, [0, 1])
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "model.json"; model.save(path)
            result = match({"rider": journey("r"), "drivers": [journey("a", .0001)]}, path)
            self.assertEqual(result["rank_method"], "artifact_logistic")

    def test_invalid_request(self):
        with self.assertRaises((KeyError, ValueError)):
            match({"rider": journey("r"), "drivers": []}, top_k=0)

    def test_batch_assignment_api(self):
        payload = {
            "riders": [journey("r1", 0.0), journey("r2", 0.001)],
            "drivers": [journey("d1", 0.0, capacity=2)],
            "method": "greedy",
        }
        result = batch_assignment(payload)
        self.assertEqual(result["api_version"], "local-api-v1")
        self.assertEqual(result["method"], "greedy")
        self.assertEqual(result["matched_rider_count"], 2)
        self.assertEqual(len(result["groups"]), 1)
        self.assertEqual(result["groups"][0]["driver_id"], "d1")
        self.assertEqual(result["groups"][0]["seats_used"], 2)

    def test_batch_assignment_auction_method(self):
        payload = {
            "riders": [journey("r1", 0.0)],
            "drivers": [journey("d1", 0.0, capacity=1)],
            "method": "auction",
        }
        result = batch_assignment(payload)
        self.assertEqual(result["method"], "auction")
        self.assertEqual(result["matched_rider_count"], 1)

    def test_batch_assignment_optimal_method(self):
        payload = {
            "riders": [journey("r1", 0.0), journey("r2", 0.001)],
            "drivers": [journey("d1", 0.0, capacity=2)],
            "method": "optimal",
        }
        result = batch_assignment(payload)
        self.assertEqual(result["method"], "optimal")
        self.assertEqual(result["matched_rider_count"], 2)

    def test_match_with_routing_provider(self):
        payload = {
            "rider": journey("r"),
            "drivers": [journey("b", .0001)],
            "routing_provider": "urban_grid",
        }
        result = match(payload)
        self.assertEqual(result["api_version"], "local-api-v1")
        self.assertEqual(len(result["recommendations"]), 1)

    def test_road_benchmark_summary_api(self):
        res = road_benchmark_summary()
        self.assertEqual(res["api_version"], "local-api-v1")
        self.assertEqual(res["total_pairs_evaluated"], 30)
        self.assertAlmostEqual(res["mean_circuity_factor"], 1.341, places=2)

    def test_compute_route_api(self):
        payload = {
            "origin": {"latitude": 0.0, "longitude": 0.0},
            "destination": {"latitude": 0.0, "longitude": 0.01},
            "provider": "geometric",
        }
        res = compute_route(payload)
        self.assertEqual(res["api_version"], "local-api-v1")
        self.assertEqual(res["provider"], "geometric-synthetic")
        self.assertGreater(res["distance_km"], 0)
        self.assertEqual(len(res["route"]), 2)

    def test_experiments_summary_api(self):
        res = get_experiments_summary()
        self.assertEqual(res["api_version"], "local-api-v1")
        self.assertEqual(res["total_experiments"], 13)
        self.assertEqual(len(res["experiments"]), 13)
        self.assertIn("key_system_breakthroughs", res["conclusions_summary"])

    def test_experiment_detail_api(self):
        res = get_experiment_detail("013_rolling_dispatch")
        self.assertIsNotNone(res)
        self.assertEqual(res["api_version"], "local-api-v1")
        self.assertEqual(res["experiment"]["id"], "013_rolling_dispatch")

    def test_simulate_dispatch_api(self):
        payload = {
            "demand_regime": "balanced",
            "horizon_minutes": 60.0,
            "seed": 42,
            "policies": ["static_batch", "event_driven_rolling"],
        }
        res = simulate_dispatch(payload)
        self.assertEqual(res["api_version"], "local-api-v1")
        self.assertIn("static_batch", res["policies"])
        self.assertIn("event_driven_rolling", res["policies"])
        self.assertEqual(res["policies"]["event_driven_rolling"]["total_fleet_vkt_km"], 50.45)
        self.assertEqual(res["policies"]["static_batch"]["total_fleet_vkt_km"], 127.78)


if __name__ == "__main__": unittest.main()

