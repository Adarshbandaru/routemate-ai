import unittest
from datetime import datetime, timedelta, timezone

from routemate.candidates import (CandidatePair, evaluate_feasibility,
                                   FeatureRow, generate_features, retrieve_candidates,
                                   run_candidate_pipeline)
from routemate.geometry import Coordinate
from routemate.models import Journey, Vehicle, VerificationContext


def j(i, x=0, offset=0, capacity=2, identity=True, vehicle=True, flags=()):
    a, b = Coordinate(0, x), Coordinate(0, x + 1)
    return Journey(i, a, b, datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=offset),
                   (a, b), Vehicle("car", capacity, vehicle),
                   VerificationContext(identity, vehicle, flags))


class CandidateTests(unittest.TestCase):
    def test_all_pass_and_stage_counts(self):
        result = run_candidate_pipeline(j("r"), [j("b", .01), j("a", .01)])
        self.assertEqual(result.retrieved_count, 2)
        self.assertEqual(len(result.feature_rows), 2)
        self.assertEqual(len(result.feasibility_matrix), 2)
        self.assertEqual(result.eligible_ids, ("a", "b"))
        self.assertGreaterEqual(result.retrieval_seconds, 0)

    def test_deterministic_ordering_and_no_retrieval_filter(self):
        out = retrieve_candidates(j("r"), [j("z", 0), j("a", 1)])
        self.assertEqual(tuple(p.driver_id for p in out), ("a", "z"))

    def test_rejection_reasons(self):
        rider = j("r")
        cases = [(j("d", 0, capacity=0), "insufficient vehicle capacity"),
                 (j("d", 0, offset=31), "departure difference"),
                 (j("d", 0, flags=("x",)), "safety flags"),
                 (j("d", 0, identity=False), "identity verification"),
                 (j("d", 0, vehicle=False), "vehicle verification")]
        for driver, text in cases:
            decision = run_candidate_pipeline(rider, [driver]).feasibility_matrix[0]
            self.assertFalse(decision.final_eligible)
            self.assertTrue(any(text in reason for reason in decision.rejection_reasons), text)

    def test_duplicate_and_collision(self):
        with self.assertRaises(ValueError): retrieve_candidates(j("r"), [j("x"), j("x")])
        with self.assertRaises(ValueError): retrieve_candidates(j("r"), [j("r")])

    def test_features_are_generated_for_ineligible_pairs(self):
        result = run_candidate_pipeline(j("r"), [j("d", 0, offset=31)])
        self.assertEqual(len(result.feature_rows), 1)
        self.assertFalse(result.feasibility_matrix[0].final_eligible)

    def test_each_geometric_gate_and_score_is_not_a_gate(self):
        pair = CandidatePair(j("d"), j("r"))
        base = {"pickup_distance_km": 0.1, "destination_distance_km": 0.1,
                "route_similarity": 1.0, "direction_similarity": 1.0,
                "driver_route_km": 100.0, "detour_km": 0.1,
                "departure_difference_min": 0.0}
        for key, value, phrase in (("pickup_distance_km", 2.1, "pickup distance"),
                                   ("destination_distance_km", 3.1, "destination distance"),
                                   ("departure_difference_min", 30.1, "departure difference"),
                                   ("detour_km", 5.1, "detour"),
                                   ("direction_similarity", .5, "direction")):
            values = dict(base)
            values[key] = value
            decision = evaluate_feasibility(pair, FeatureRow("d", "r", values))
            self.assertFalse(decision.final_eligible)
            self.assertTrue(any(phrase in reason for reason in decision.rejection_reasons))

        values = dict(base)
        values.update(pickup_distance_km=2.0, destination_distance_km=3.0,
                      departure_difference_min=30.0, detour_km=5.0,
                      route_similarity=0.0)
        decision = evaluate_feasibility(pair, FeatureRow("d", "r", values))
        self.assertTrue(decision.final_eligible)
        self.assertEqual(decision.rejection_reasons, ())
        self.assertLess(decision.score, 50.0)


if __name__ == "__main__":
    unittest.main()
