import json, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path
from routemate.api import match
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

if __name__ == "__main__": unittest.main()
